import { BOARD_MAX_SAVED_DOCUMENTS } from "../board/storage";
import type { BoardResult } from "../board/validate";
import { parseBoardBackupJSON, type BoardBackupPackage } from "../learning/storage";

/** Account snapshots contain the same editable, linked backups as JSON export. */
export type CloudSnapshot = { version: 1; boards: BoardBackupPackage[] };
export const CLOUD_MAX_BYTES = 8_000_000;
// An exported file wraps the bounded snapshot with its kind and revision.
export const CLOUD_BACKUP_MAX_BYTES = CLOUD_MAX_BYTES + 4096;

export function createLibraryBackupJSON(snapshot: CloudSnapshot, metadata: { revision?: number; updatedAt?: string | null } = {}): BoardResult<string> {
  try {
    const envelope = { kind: "rallypath-library-backup", version: 1, ...metadata, snapshot };
    let serialized = JSON.stringify(envelope, null, 2);
    if (new TextEncoder().encode(serialized).byteLength > CLOUD_BACKUP_MAX_BYTES) serialized = JSON.stringify(envelope);
    return new TextEncoder().encode(serialized).byteLength <= CLOUD_BACKUP_MAX_BYTES
      ? { ok: true, value: serialized }
      : { ok: false, error: "备份超过可恢复的容量；未生成无法重新导入的文件" };
  } catch { return { ok: false, error: "无法整理画板库备份" }; }
}

export function validateCloudSnapshot(value: unknown): BoardResult<CloudSnapshot> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, error: "云端画板资料格式不正确" };
    }
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== 1 || !Array.isArray(candidate.boards)
      || candidate.boards.length > BOARD_MAX_SAVED_DOCUMENTS) {
      return { ok: false, error: "云端画板版本或数量不受支持" };
    }
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > CLOUD_MAX_BYTES) {
      return { ok: false, error: "云端画板超过 8 MB；请先保留 JSON 备份" };
    }
    const boards: BoardBackupPackage[] = [], ids = new Set<string>();
    for (const item of candidate.boards) {
      if (typeof item !== "object" || item === null || Array.isArray(item)
        || item.kind !== "rallypath-board-backup" || (item.version !== 1 && item.version !== 2)) {
        return { ok: false, error: "云端包含无效的画板备份" };
      }
      const parsed = parseBoardBackupJSON(JSON.stringify(item));
      if (!parsed.ok) return { ok: false, error: `云端备份无效：${parsed.error}` };
      if (ids.has(parsed.value.board.id)) return { ok: false, error: "云端画板 ID 重复" };
      ids.add(parsed.value.board.id);
      boards.push({ kind: "rallypath-board-backup", version: 2, ...parsed.value });
    }
    boards.sort((left, right) => left.board.id < right.board.id ? -1 : left.board.id > right.board.id ? 1 : 0);
    const snapshot: CloudSnapshot = { version: 1, boards };
    if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > CLOUD_MAX_BYTES) {
      return { ok: false, error: "云端画板超过 8 MB；请先保留 JSON 备份" };
    }
    return { ok: true, value: snapshot };
  } catch {
    return { ok: false, error: "无法读取云端备份；未更改本机画板" };
  }
}

/** Stable key order lets metadata compare snapshots without duplicating their data. */
export function canonicalSnapshot(snapshot: CloudSnapshot): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  };
  return JSON.stringify(canonical(snapshot));
}

export async function snapshotHash(snapshot: CloudSnapshot): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSnapshot(snapshot));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
