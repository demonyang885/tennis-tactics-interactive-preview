import type { BoardDocument } from "./model";
import { validateBoardDocument, type BoardResult } from "./validate";

export type { BoardResult } from "./validate";

export type BoardStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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

export function saveBoard(board: BoardDocument, storage?: BoardStorage): BoardResult<BoardDocument> {
  const validated = validateBoardDocument(board);
  if (!validated.ok) return { ok: false, error: `畫板尚未保存：${validated.error}` };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;

  const saved: BoardDocument = { ...validated.value, updatedAt: new Date().toISOString() };
  const existingIndex = envelope.value.boards.findIndex((item) => item.id === saved.id);
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

export function deleteBoard(boardId: string, storage?: BoardStorage): BoardResult<void> {
  if (typeof boardId !== "string" || !boardId.trim()) return { ok: false, error: "缺少要刪除的畫板 ID" };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;
  const boards = envelope.value.boards.filter((board) => board.id !== boardId);
  if (boards.length === envelope.value.boards.length) return { ok: true, value: undefined };

  if (!boards.length) {
    try {
      target.value.removeItem(BOARD_STORAGE_KEY);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: storageError("刪除草稿", error) };
    }
  }
  return writeEnvelope(target.value, { version: 1, boards }, "刪除草稿");
}
