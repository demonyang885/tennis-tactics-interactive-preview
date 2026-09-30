import type { BoardDocument } from "./model";
import { validateBoardDocument, type BoardResult } from "./validate";

export type { BoardResult } from "./validate";

export type BoardStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type BoardSaveConflict = "changed" | "deleted" | "created";
export type GuardedBoardSaveResult =
  | { ok: true; value: BoardDocument }
  | { ok: false; error: string; conflict?: BoardSaveConflict };
export type GuardedBoardDeleteResult =
  | { ok: true; value: void }
  | { ok: false; error: string; conflict?: BoardSaveConflict };

export const BOARD_STORAGE_KEY = "tennis-tactics:board-drafts:v1";
export const BOARD_MAX_SAVED_DOCUMENTS = 100;

const MAX_STORED_CHARACTERS = 4_000_000;

type StoredBoards = {
  version: 1;
  boards: BoardDocument[];
};

function storageError(action: string, error: unknown) {
  const detail = error instanceof Error && error.message.trim() ? `：${error.message}` : "";
  return `${action}失敗${detail}`;
}

function defaultStorage(): BoardResult<BoardStorage> {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return { ok: false, error: "此環境不支援瀏覽器草稿儲存" };
    }
    return { ok: true, value: window.localStorage };
  } catch (error) {
    return { ok: false, error: storageError("開啟草稿儲存", error) };
  }
}

function resolveStorage(storage?: BoardStorage): BoardResult<BoardStorage> {
  return storage ? { ok: true, value: storage } : defaultStorage();
}

function readEnvelope(storage: BoardStorage): BoardResult<StoredBoards> {
  let serialized: string | null;
  try {
    serialized = storage.getItem(BOARD_STORAGE_KEY);
  } catch (error) {
    return { ok: false, error: storageError("讀取草稿", error) };
  }
  if (serialized === null) return { ok: true, value: { version: 1, boards: [] } };
  if (serialized.length > MAX_STORED_CHARACTERS) return { ok: false, error: "草稿儲存內容過大，請先匯出備份" };

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return { ok: false, error: "瀏覽器草稿資料已損壞，未覆寫原資料" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "瀏覽器草稿格式不正確，未覆寫原資料" };
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== 1 || !Array.isArray(envelope.boards)) {
    return { ok: false, error: "不支援的瀏覽器草稿版本" };
  }
  if (envelope.boards.length > BOARD_MAX_SAVED_DOCUMENTS) {
    return { ok: false, error: `瀏覽器草稿超出上限（最多 ${BOARD_MAX_SAVED_DOCUMENTS} 份）` };
  }

  const boards: BoardDocument[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < envelope.boards.length; index += 1) {
    const result = validateBoardDocument(envelope.boards[index]);
    if (!result.ok) return { ok: false, error: `第 ${index + 1} 份瀏覽器草稿無效：${result.error}` };
    if (ids.has(result.value.id)) return { ok: false, error: `瀏覽器草稿 ID「${result.value.id}」重複` };
    ids.add(result.value.id);
    boards.push(result.value);
  }
  return { ok: true, value: { version: 1, boards } };
}

function writeEnvelope(storage: BoardStorage, envelope: StoredBoards, action = "保存草稿"): BoardResult<void> {
  let serialized: string;
  try {
    serialized = JSON.stringify(envelope);
  } catch (error) {
    return { ok: false, error: storageError("整理草稿", error) };
  }
  if (serialized.length > MAX_STORED_CHARACTERS) {
    return { ok: false, error: "草稿容量過大，尚未保存；請匯出 JSON 備份" };
  }
  try {
    storage.setItem(BOARD_STORAGE_KEY, serialized);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: storageError(action, error) };
  }
}

export function readBoards(storage?: BoardStorage): BoardResult<BoardDocument[]> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;
  return {
    ok: true,
    value: envelope.value.boards
      .slice()
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
  };
}

function boardSnapshotConflict(current: BoardDocument | undefined, expected: BoardDocument | null): Extract<GuardedBoardSaveResult, { ok: false }> | null {
  if (expected === null) {
    return current ? { ok: false, conflict: "created", error: "同一画板已在另一个页面建立；未覆盖它。请先另存一份或备份画板。" } : null;
  }
  if (!current) return { ok: false, conflict: "deleted", error: "画板已在另一个页面删除；你的改动尚未保存，也没有恢复它。请先另存一份或备份画板。" };
  const validated = validateBoardDocument(expected);
  if (!validated.ok || JSON.stringify(current) !== JSON.stringify(validated.value)) {
    return { ok: false, conflict: "changed", error: "画板已在另一个页面修改；你的改动尚未保存，也没有覆盖它。请先另存一份或备份画板。" };
  }
  return null;
}

/** Read-only check before linking a learning choice to an unchanged open board. */
export function checkBoardUnchanged(expected: BoardDocument, storage?: BoardStorage): GuardedBoardSaveResult {
  const validated = validateBoardDocument(expected);
  if (!validated.ok) return { ok: false, error: `画板检查失败：${validated.error}` };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;
  const current = envelope.value.boards.find((item) => item.id === validated.value.id);
  return boardSnapshotConflict(current, validated.value) ?? { ok: true, value: current! };
}

function writeBoard(board: BoardDocument, expected: BoardDocument | null | undefined, storage?: BoardStorage): GuardedBoardSaveResult {
  const validated = validateBoardDocument(board);
  if (!validated.ok) return { ok: false, error: `畫板尚未保存：${validated.error}` };
  if (expected && expected.id !== validated.value.id) {
    return { ok: false, error: "画板保存依据不匹配，未覆盖原稿" };
  }
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;

  const existingIndex = envelope.value.boards.findIndex((item) => item.id === validated.value.id);
  if (expected !== undefined) {
    const conflict = boardSnapshotConflict(envelope.value.boards[existingIndex], expected);
    if (conflict) return conflict;
  }

  const saved: BoardDocument = { ...validated.value, updatedAt: new Date().toISOString() };
  const boards = envelope.value.boards.slice();
  if (existingIndex >= 0) boards[existingIndex] = saved;
  else {
    if (boards.length >= BOARD_MAX_SAVED_DOCUMENTS) {
      return { ok: false, error: `草稿已達上限（最多 ${BOARD_MAX_SAVED_DOCUMENTS} 份），尚未保存` };
    }
    boards.push(saved);
  }

  const written = writeEnvelope(target.value, { version: 1, boards });
  if (!written.ok) return written;
  return { ok: true, value: saved };
}

export function saveBoard(board: BoardDocument, storage?: BoardStorage): BoardResult<BoardDocument> {
  return writeBoard(board, undefined, storage);
}

/** Guards editor revisions and newly imported IDs without changing the v1 storage format. */
export function saveBoardIfUnchanged(board: BoardDocument, expected: BoardDocument | null, storage?: BoardStorage): GuardedBoardSaveResult {
  return writeBoard(board, expected, storage);
}

function removeBoardAtIndex(storage: BoardStorage, envelope: StoredBoards, index: number): BoardResult<void> {
  if (index < 0) return { ok: true, value: undefined };
  const boards = envelope.boards.filter((_, boardIndex) => boardIndex !== index);
  if (!boards.length) {
    try {
      storage.removeItem(BOARD_STORAGE_KEY);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: storageError("刪除草稿", error) };
    }
  }
  return writeEnvelope(storage, { version: 1, boards }, "刪除草稿");
}

export function deleteBoard(boardId: string, storage?: BoardStorage): BoardResult<void> {
  if (typeof boardId !== "string" || !boardId.trim()) return { ok: false, error: "缺少要刪除的畫板 ID" };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;
  return removeBoardAtIndex(target.value, envelope.value, envelope.value.boards.findIndex((board) => board.id === boardId));
}

/** A list item may be stale even when the deletion is a retry. Never delete a newer revision by id alone. */
export function deleteBoardIfUnchanged(expected: BoardDocument, storage?: BoardStorage): GuardedBoardDeleteResult {
  const validated = validateBoardDocument(expected);
  if (!validated.ok) return { ok: false, error: `画板删除依据无效：${validated.error}` };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;
  const index = envelope.value.boards.findIndex((board) => board.id === validated.value.id);
  const conflict = boardSnapshotConflict(envelope.value.boards[index], validated.value);
  if (conflict) return conflict;
  return removeBoardAtIndex(target.value, envelope.value, index);
}
