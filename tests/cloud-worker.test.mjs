import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../output/cloudtests/server/index.js";
import { splitLibraryPayload, LIBRARY_CHUNK_CHARACTERS } from "../output/cloudtests/server/library.js";
import { createStarterBoard, setPath } from "../output/cloudtests/src/board/model.js";
import { validateCloudSnapshot } from "../output/cloudtests/src/cloud/snapshot.js";

/** Exercise the production prepared statements and real migration against SQLite. */
class D1SQLite {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    for (const filename of readdirSync(new URL("../drizzle/", import.meta.url)).filter(name => name.endsWith(".sql")).sort()) {
      this.sqlite.exec(readFileSync(new URL("../drizzle/" + filename, import.meta.url), "utf8"));
    }
    this.failStatement = null;
    this.batches = 0;
  }
  prepare(sql) {
    const statement = {
      sql,
      values: [],
      bind: (...values) => ({ ...statement, values }),
    };
    return statement;
  }
  async batch(statements) {
    this.batches += 1;
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement, index) => {
        if (index === this.failStatement) {
          this.failStatement = null;
          throw new Error("Injected transaction failure");
        }
        const prepared = this.sqlite.prepare(statement.sql);
        const results = prepared.all(...statement.values).map(row => ({ ...row }));
        const changes = this.sqlite.prepare("SELECT changes() AS count").get().count;
        return { results, success: true, meta: { changes } };
      });
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  close() { this.sqlite.close(); }
}

function setup(context) {
  const db = new D1SQLite();
  context.after(() => db.close());
  return db;
}

const identity = (id = "player-a", email = "a@example.test") => ({
  "oai-authenticated-user-id": id,
  "oai-authenticated-user-email": email,
  "X-RallyPath-Account": id,
});

function request(pathname = "/api/library", { method = "GET", user = "player-a", headers = {}, body } = {}) {
  return new Request("https://rallypath.example.test" + pathname, {
    method,
    headers: { ...(user ? identity(user) : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

async function call(db, options = {}, pathname = "/api/library") {
  const response = await worker.fetch(request(pathname, options), { DB: db });
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  return { response, body: await response.json() };
}

function snapshot(title = "服务器保存的画板", id = "test-board") {
  let board = { ...createStarterBoard(title), id, updatedAt: "2026-09-30T00:00:00.000Z" };
  delete board.smartRally;
  delete board.authoringMode;
  const ball = board.actors.find(actor => actor.kind === "ball");
  board = setPath(board, 0, { id: "saved-shot", kind: "shot", actorId: ball.id,
    from: board.frames[0].poses[ball.id], to: [.7, .3], pace: "drive" });
  board.updatedAt = "2026-09-30T00:00:00.000Z";
  const validated = validateCloudSnapshot({
    version: 1,
    boards: [{ kind: "rallypath-board-backup", version: 2, board,
      learning: { version: 1, boardId: id, route: "skill", skillId: "next-ball", updatedAt: board.updatedAt } }],
  });
  assert.equal(validated.ok, true, validated.error);
  return validated.value;
}

test("account uses only verified platform identity and decodes the display name", async context => {
  const db = setup(context);
  const account = await call(db, { headers: { "oai-authenticated-user-full-name": encodeURIComponent("楊教練 🎾"),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8" } }, "/api/account");
  assert.equal(account.response.status, 200);
  assert.deepEqual(account.body, { user: { id: "player-a", email: "a@example.test", name: "楊教練 🎾" } });
  assert.equal(db.batches, 0);
  const missing = await call(db, { user: null, headers: { "X-RallyPath-Account": "player-a" } }, "/api/account");
  assert.equal(missing.response.status, 401);
  assert.equal(missing.body.error, "unauthenticated");
  const partialIdentity = await call(db, { user: null, headers: { "oai-authenticated-user-id": "player-a" } }, "/api/account");
  assert.equal(partialIdentity.response.status, 401);
  const malformedName = await call(db, { headers: { "oai-authenticated-user-full-name": "%broken",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8" } }, "/api/account");
  assert.equal(malformedName.response.status, 200);
  assert.equal(malformedName.body.user.name, undefined);
  const unencodedName = await call(db, { headers: { "oai-authenticated-user-full-name": "100% Player" } }, "/api/account");
  assert.equal(unencodedName.body.user.name, "100% Player");
  const absentName = await call(db, {}, "/api/account");
  assert.equal(absentName.body.user.name, undefined);
});

test("anonymous library access cannot read or write another user's boards", async context => {
  const db = setup(context);
  for (const options of [
    { user: null },
    { user: null, method: "PUT", body: { userId: "player-a", expectedRevision: 0, snapshot: snapshot() } },
  ]) {
    const result = await call(db, options);
    assert.equal(result.response.status, 401);
  }
  assert.equal(db.batches, 0);
});

test("new accounts start empty, separate users are isolated, and a fresh device reads editable boards", async context => {
  const db = setup(context);
  const empty = await call(db);
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body, { revision: 0, updatedAt: null, snapshot: { version: 1, boards: [] } });
  const savedSnapshot = snapshot();
  const saved = await call(db, { method: "PUT", body: { expectedRevision: 0, snapshot: savedSnapshot, userId: "player-b" } });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.revision, 1);
  assert.ok(Number.isFinite(Date.parse(saved.body.updatedAt)));
  assert.deepEqual(saved.body.snapshot, savedSnapshot);
  const otherAccount = await call(db, { user: "player-b" });
  assert.deepEqual(otherAccount.body, empty.body);
  const freshDevice = await call(db);
  assert.deepEqual(freshDevice.body, saved.body);
  assert.ok(freshDevice.body.snapshot.boards[0].board.frames[0].paths.length > 0);
  assert.equal(freshDevice.body.snapshot.boards[0].learning.skillId, "next-ball");
});

test("a switched account refuses reads and writes before accessing the database", async context => {
  const db = setup(context);
  for (const method of ["GET", "PUT"]) {
    const result = await call(db, { user: "player-b", method, headers: { "X-RallyPath-Account": "player-a" },
      ...(method === "PUT" ? { body: { expectedRevision: 0, snapshot: snapshot() } } : {}) });
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error, "account_changed");
  }
  const omittedHeader = await call(db, { headers: { "X-RallyPath-Account": "" } });
  assert.equal(omittedHeader.response.status, 409);
  assert.equal(db.batches, 0);
});

test("CAS conflicts keep the winning generation, including two new-device uploads", async context => {
  const db = setup(context);
  const first = snapshot("第一个装置");
  const second = snapshot("第二个装置");
  const uploads = await Promise.all([
    call(db, { method: "PUT", body: { expectedRevision: 0, snapshot: first } }),
    call(db, { method: "PUT", body: { expectedRevision: 0, snapshot: second } }),
  ]);
  assert.deepEqual(uploads.map(upload => upload.response.status), [200, 409]);
  assert.equal(uploads[1].body.error, "conflict");
  assert.deepEqual(uploads[1].body.current, uploads[0].body);
  const updated = await call(db, { method: "PUT", body: { expectedRevision: 1, snapshot: second } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.revision, 2);
  const stale = await call(db, { method: "PUT", body: { expectedRevision: 1, snapshot: first } });
  assert.equal(stale.response.status, 409);
  assert.deepEqual(stale.body.current, updated.body);
  assert.deepEqual((await call(db)).body, updated.body);
  const generations = db.sqlite.prepare("SELECT DISTINCT generation FROM library_chunks").all();
  assert.equal(generations.length, 1, "losing transactions must neither insert stale chunks nor delete winning chunks");
});

test("a failure after the CAS update rolls back metadata, chunks, and cleanup", async context => {
  const db = setup(context);
  const saved = await call(db, { method: "PUT", body: { expectedRevision: 0, snapshot: snapshot("保留下来的画板") } });
  db.failStatement = 2;
  const failed = await call(db, { method: "PUT", body: { expectedRevision: 1, snapshot: snapshot("失败的修改") } });
  assert.equal(failed.response.status, 503);
  assert.equal(failed.body.error, "database_unavailable");
  assert.deepEqual((await call(db)).body, saved.body);
  db.failStatement = 1;
  const newAccountFailure = await call(db, { user: "player-b", method: "PUT", body: { expectedRevision: 0, snapshot: snapshot() } });
  assert.equal(newAccountFailure.response.status, 503);
  assert.equal((await call(db, { user: "player-b" })).body.revision, 0);
});

test("origin checks reject browser cross-site writes before persistence", async context => {
  const db = setup(context);
  for (const headers of [
    { Origin: "https://unrelated.example.test" },
    { Origin: "null" },
    { "Sec-Fetch-Site": "cross-site" },
  ]) {
    const result = await call(db, { method: "PUT", headers, body: { expectedRevision: 0, snapshot: snapshot() } });
    assert.equal(result.response.status, 403);
    assert.equal(result.body.error, "invalid_origin");
  }
  assert.equal(db.batches, 0);
  const allowed = await call(db, { method: "PUT", headers: { Origin: "https://rallypath.example.test", "Sec-Fetch-Site": "same-origin" },
    body: { expectedRevision: 0, snapshot: snapshot() } });
  assert.equal(allowed.response.status, 200);
});

test("malformed requests, unsupported methods, missing bindings, and unknown APIs return structured errors", async context => {
  const db = setup(context);
  for (const [options, expectedStatus, expectedError] of [
    [{ method: "POST", body: {} }, 405, "method_not_allowed"],
    [{ method: "PUT", headers: { "Content-Type": "text/plain" }, body: "{}" }, 415, "unsupported_media_type"],
    [{ method: "PUT", body: "{" }, 400, "invalid_json"],
    [{ method: "PUT", body: { expectedRevision: -1, snapshot: snapshot() } }, 400, "invalid_revision"],
    [{ method: "PUT", body: { expectedRevision: 1.2, snapshot: snapshot() } }, 400, "invalid_revision"],
    [{ method: "PUT", body: { expectedRevision: Number.MAX_SAFE_INTEGER, snapshot: snapshot() } }, 400, "invalid_revision"],
    [{ method: "PUT", body: { expectedRevision: 0, snapshot: { version: 2, boards: [] } } }, 400, "invalid_snapshot"],
    [{ method: "PUT", body: { expectedRevision: 0, snapshot: { version: 1, boards: [{ kind: "malicious" }] } } }, 400, "invalid_snapshot"],
  ]) {
    const result = await call(db, options);
    assert.equal(result.response.status, expectedStatus);
    assert.equal(result.body.error, expectedError);
  }
  assert.equal(db.batches, 0);
  const noDb = await call(undefined);
  assert.equal(noDb.response.status, 503);
  assert.equal(noDb.body.error, "database_unavailable");
  const unknown = await call(db, {}, "/api/unknown");
  assert.equal(unknown.response.status, 404);
  const apiRoot = await call(db, {}, "/api");
  assert.equal(apiRoot.response.status, 404);
  const accountMethod = await call(db, { method: "PUT", body: {} }, "/api/account");
  assert.equal(accountMethod.response.status, 405);
  assert.equal(accountMethod.response.headers.get("allow"), "GET");
});

test("the byte limit rejects oversized streamed JSON without mutating the library", async context => {
  const db = setup(context);
  const saved = await call(db, { method: "PUT", body: { expectedRevision: 0, snapshot: snapshot() } });
  const payload = JSON.stringify({ expectedRevision: 1, snapshot: { version: 1, boards: [], ignored: "界".repeat(2_700_000) } });
  assert.ok(new TextEncoder().encode(payload).byteLength > 8_001_024);
  const rejected = await call(db, { method: "PUT", body: payload });
  assert.equal(rejected.response.status, 413);
  assert.equal(rejected.body.error, "payload_too_large");
  assert.deepEqual((await call(db)).body, saved.body);
});

test("large Unicode libraries round-trip across small D1 rows and surrogate boundaries", async context => {
  const db = setup(context);
  const text = "🎾".repeat(500);
  const boards = Array.from({ length: 12 }, (_, index) => {
    const board = snapshot("大画板 " + index, "unicode-board-" + index).boards[0];
    board.board.frames[0].marks = Array.from({ length: 100 }, (_, markIndex) => ({
      id: "text-" + markIndex, kind: "text", position: [.4, .4], text,
    }));
    return board;
  });
  const checked = validateCloudSnapshot({ version: 1, boards });
  assert.equal(checked.ok, true);
  const serialized = JSON.stringify(checked.value);
  assert.ok(new TextEncoder().encode(serialized).byteLength > 2_000_000);
  const saved = await call(db, { method: "PUT", body: { expectedRevision: 0, snapshot: checked.value } });
  assert.equal(saved.response.status, 200);
  const rows = db.sqlite.prepare("SELECT payload FROM library_chunks ORDER BY chunk_index").all();
  assert.ok(rows.length > 1);
  for (const row of rows) {
    assert.ok(row.payload.length <= LIBRARY_CHUNK_CHARACTERS);
    assert.ok(new TextEncoder().encode(row.payload).byteLength < 2_000_000);
    assert.ok(!/[\ud800-\udbff]$/.test(row.payload));
    assert.ok(!/^[\udc00-\udfff]/.test(row.payload));
  }
  assert.equal(rows.map(row => row.payload).join(""), serialized);
  assert.deepEqual((await call(db)).body, saved.body);
  const boundary = "x".repeat(LIBRARY_CHUNK_CHARACTERS - 1) + "🎾" + "tail";
  const boundaryChunks = splitLibraryPayload(boundary);
  assert.equal(boundaryChunks[0].length, LIBRARY_CHUNK_CHARACTERS - 1);
  assert.ok(boundaryChunks[1].startsWith("🎾"));
  assert.equal(boundaryChunks.join(""), boundary);
});

test("missing persisted chunks return an unavailable response instead of an empty cloud library", async context => {
  const db = setup(context);
  const saved = await call(db, { method: "PUT", body: { expectedRevision: 0, snapshot: snapshot() } });
  assert.equal(saved.response.status, 200);
  db.sqlite.exec("DELETE FROM library_chunks");
  const corrupted = await call(db);
  assert.equal(corrupted.response.status, 503);
  assert.equal(corrupted.body.error, "database_unavailable");
  assert.equal(corrupted.body.snapshot, undefined);
});

test("the cloud wrapper preserves the protected static worker's asset and SPA behavior", async () => {
  const seen = [];
  const assets = { fetch: async incoming => {
    seen.push(new URL(incoming.url).pathname);
    return new Response(seen.length === 1 ? "missing" : "app", { status: seen.length === 1 ? 404 : 200 });
  } };
  const response = await worker.fetch(new Request("https://rallypath.example.test/boards/abc", { headers: { Accept: "text/html" } }), { ASSETS: assets });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "app");
  assert.deepEqual(seen, ["/boards/abc", "/index.html"]);
});

test("public HTML advertises the cloud API without granting anonymous account access", async () => {
  const html = '<!doctype html><html><HEAD data-layout="court"><title>RallyPath</title></HEAD><body><main>画板</main></body></html>';
  const incoming = request("/", { user: null });
  const response = await worker.fetch(incoming, { ASSETS: { fetch: async () => new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0",
      "Content-Length": String(new TextEncoder().encode(html).byteLength), ETag: '"original-asset"' },
  }) } });
  assert.equal(response.status, 200);
  const rendered = await response.text();
  const marker = '<meta name="rallypath-cloud-api" content="v1">';
  assert.ok(rendered.includes('<HEAD data-layout="court">' + marker));
  assert.equal(rendered.replace(marker, ""), html);
  assert.equal(response.headers.get("etag"), null);
  assert.equal(response.headers.get("content-length"), null);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0");
  const account = await worker.fetch(request("/api/account", { user: null }), {});
  assert.equal(account.status, 401);
  assert.equal((await account.json()).error, "unauthenticated");
});

test("cloud capability injection leaves JavaScript assets and HEAD responses unchanged", async () => {
  const script = new Response('console.log("court")', { headers: {
    "Content-Type": "text/javascript", ETag: '"script-asset"', "Content-Length": "20",
  } });
  const delivered = await worker.fetch(request("/assets/app.js", { user: null }), { ASSETS: { fetch: async () => script } });
  assert.equal(delivered, script);
  assert.equal(await delivered.text(), 'console.log("court")');
  assert.equal(delivered.headers.get("etag"), '"script-asset"');
  const head = new Response(null, { headers: { "Content-Type": "text/html", ETag: '"html-asset"', "Content-Length": "100" } });
  const headResult = await worker.fetch(request("/", { user: null, method: "HEAD" }), { ASSETS: { fetch: async () => head } });
  assert.equal(headResult, head);
  assert.equal(await headResult.text(), "");
  assert.equal(headResult.headers.get("content-length"), "100");
  assert.equal(headResult.headers.get("etag"), '"html-asset"');
});
