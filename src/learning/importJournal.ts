import type { BoardStorage } from "../board/storage";
import type { BoardResult } from "../board/validate";

export const BOARD_IMPORT_JOURNAL_KEY = "rallypath:board-import-pending:v1";

export type BoardImportJournal = {
  version: 1;
  signature: string;
  targetId: string;
  targetTitle: string;
};

export type RecoverableBoardImportJournal = Pick<BoardImportJournal, "signature" | "targetId">;

const MAX_JOURNAL_CHARACTERS = 1_000;

function resolveStorage(storage?: BoardStorage): BoardResult<BoardStorage> {
  if (storage) return { ok: true, value: storage };
  try {
    if (typeof window === "undefined" || !window.localStorage) return { ok: false, error: "此环境不支持浏览器记录" };
    return { ok: true, value: window.localStorage };
  } catch {
    return { ok: false, error: "暂时打不开导入记录" };
  }
}

/** Identifies a reselected file. This is a retry key, not a security checksum. */
export function boardBackupSignature(serialized: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${serialized.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export function readBoardImportJournal(storage?: BoardStorage): BoardResult<BoardImportJournal | undefined> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  let serialized: string | null;
  try { serialized = target.value.getItem(BOARD_IMPORT_JOURNAL_KEY); }
  catch { return { ok: false, error: "暂时读不到上次导入记录" }; }
  if (serialized === null) return { ok: true, value: undefined };
  if (serialized.length > MAX_JOURNAL_CHARACTERS) return { ok: false, error: "上次导入记录异常，未开始新的导入" };
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== 1 || typeof candidate.signature !== "string" || !/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/.test(candidate.signature)
      || typeof candidate.targetId !== "string" || !candidate.targetId.trim() || candidate.targetId.length > 160
      || typeof candidate.targetTitle !== "string" || !candidate.targetTitle.trim() || candidate.targetTitle.length > 120) throw new Error();
    return { ok: true, value: candidate as BoardImportJournal };
  } catch {
    return { ok: false, error: "上次导入记录异常，未开始新的导入" };
  }
}

/** Only a lost title is repairable. Keep the raw marker intact until the exact backup finishes importing. */
export function readRecoverableBoardImportJournal(storage?: BoardStorage): BoardResult<RecoverableBoardImportJournal | undefined> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  let serialized: string | null;
  try { serialized = target.value.getItem(BOARD_IMPORT_JOURNAL_KEY); }
  catch { return { ok: false, error: "暂时读不到上次导入记录" }; }
  if (serialized === null || serialized.length > MAX_JOURNAL_CHARACTERS) return { ok: true, value: undefined };
  try {
    const value: unknown = JSON.parse(serialized);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: true, value: undefined };
    const candidate = value as Record<string, unknown>;
    const titleIsValid = typeof candidate.targetTitle === "string"
      && Boolean(candidate.targetTitle.trim()) && candidate.targetTitle.length <= 120;
    if (candidate.version !== 1 || typeof candidate.signature !== "string" || !/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/.test(candidate.signature)
      || typeof candidate.targetId !== "string" || !candidate.targetId.trim() || candidate.targetId.length > 160
      || titleIsValid) {
      return { ok: true, value: undefined };
    }
    return { ok: true, value: { signature: candidate.signature, targetId: candidate.targetId } };
  } catch {
    return { ok: true, value: undefined };
  }
}

export function saveBoardImportJournal(journal: BoardImportJournal, storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  try {
    target.value.setItem(BOARD_IMPORT_JOURNAL_KEY, JSON.stringify(journal));
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: "暂时无法保留导入续接记录，未开始导入" };
  }
}

export function clearBoardImportJournal(storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  try {
    target.value.removeItem(BOARD_IMPORT_JOURNAL_KEY);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: "导入记录暂时无法清理" };
  }
}
