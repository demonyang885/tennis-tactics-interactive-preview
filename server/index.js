import staticWorker from "../worker/index.js";
import { CLOUD_MAX_BYTES, validateCloudSnapshot } from "../src/cloud/snapshot.ts";
import { readLibrary, writeLibrary } from "./library.js";

// Sites verifies the session and replaces these headers before Worker ingress.
// Account IDs and email addresses in a JSON body never establish an identity.
function authenticatedUser(request) {
  const id = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = request.headers.get("oai-authenticated-user-email")?.trim();
  if (!id || !email || id.length > 512 || email.length > 512) return null;
  const user = { id, email };
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  if (encodedName) {
    try {
      const name = (request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
        ? decodeURIComponent(encodedName) : encodedName).trim();
      if (name && name.length <= 512) user.name = name;
    } catch { /* A malformed optional display name must not break a session. */ }
  }
  return user;
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "Vary": "Cookie, oai-authenticated-user-id, oai-authenticated-user-email",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function error(status, code, message, extraHeaders) {
  return json({ error: code, message }, status, extraHeaders);
}

function unsafeWriteOrigin(request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  return origin !== null && origin !== new URL(request.url).origin;
}

async function readLimitedBody(request) {
  // Account for the small PUT envelope around the already limited snapshot.
  const limit = CLOUD_MAX_BYTES + 1_024;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(part.value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function apiFetch(request, env) {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/api/account" && pathname !== "/api/library") {
    return error(404, "not_found", "找不到这个云端接口");
  }
  const allowedMethods = pathname === "/api/account" ? ["GET"] : ["GET", "PUT"];
  if (!allowedMethods.includes(request.method)) {
    return error(405, "method_not_allowed", "这个接口不支持此操作", { Allow: allowedMethods.join(", ") });
  }
  const user = authenticatedUser(request);
  if (!user) return error(401, "unauthenticated", "请先登入账户");
  if (pathname === "/api/account") return json({ user });
  if (request.headers.get("X-RallyPath-Account") !== user.id) {
    return error(409, "account_changed", "账户已切换；请重新确认账户后同步");
  }
  if (request.method === "PUT" && unsafeWriteOrigin(request)) {
    return error(403, "invalid_origin", "只允许从当前网站同步画板");
  }
  if (!env?.DB?.prepare || !env?.DB?.batch) {
    return error(503, "database_unavailable", "云端储存暂时不可用；本机画板仍然保留");
  }
  if (request.method === "GET") return json(await readLibrary(env.DB, user.id));
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return error(415, "unsupported_media_type", "请使用 JSON 同步画板");
  }
  let body;
  try {
    const serialized = await readLimitedBody(request);
    if (serialized === null) return error(413, "payload_too_large", "云端画板超过 8 MB；请先保留 JSON 备份");
    body = JSON.parse(serialized);
  } catch {
    return error(400, "invalid_json", "无法读取同步资料");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)
    || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
    || body.expectedRevision >= Number.MAX_SAFE_INTEGER) {
    return error(400, "invalid_revision", "同步版本格式不正确");
  }
  const validation = validateCloudSnapshot(body.snapshot);
  if (!validation.ok) return error(400, "invalid_snapshot", validation.error);
  if (new TextEncoder().encode(JSON.stringify(validation.value)).byteLength > CLOUD_MAX_BYTES) {
    return error(413, "payload_too_large", "云端画板超过 8 MB；请先保留 JSON 备份");
  }
  const result = await writeLibrary(env.DB, user.id, body.expectedRevision, validation.value);
  if (result.conflict) {
    return json({ error: "conflict", message: "其他装置已更新画板；请确认后再同步", current: result.current }, 409);
  }
  return json(result.current);
}

export default {
  async fetch(request, env, context) {
    const pathname = new URL(request.url).pathname;
    if (pathname !== "/api" && !pathname.startsWith("/api/")) return staticWorker.fetch(request, env, context);
    try {
      return await apiFetch(request, env);
    } catch {
      return error(503, "database_unavailable", "云端储存暂时不可用；本机画板仍然保留");
    }
  },
};
