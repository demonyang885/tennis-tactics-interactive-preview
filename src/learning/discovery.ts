import type { BoardStorage } from "../board/storage";
import type { BoardResult } from "../board/validate";

export const BOARD_DISCOVERY_STORAGE_KEY = "rallypath:board-discovery:v1";
export const BOARD_DISCOVERY_EVENT = "rallypath-board-discovery-changed";

export type BoardDiscovery = {
  version: 1;
  id: string;
  boardId: string;
  frameId: string;
  progress?: number;
  note: string;
  nextTry: string;
  uncertain: boolean;
  createdAt: string;
  updatedAt: string;
};

const MAX_RECORDS = 100;
const MAX_STORED_CHARACTERS = 120_000;
const MAX_TEXT_LENGTH = 240;
const validId = (value: unknown) => typeof value === "string" && Boolean(value.trim()) && value.length <= 160;
const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function validateBoardDiscovery(value: unknown): BoardDiscovery | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || !validId(item.id) || !validId(item.boardId) || !validId(item.frameId)) return null;
  if (typeof item.note !== "string" || item.note.length > MAX_TEXT_LENGTH
    || typeof item.nextTry !== "string" || item.nextTry.length > MAX_TEXT_LENGTH
    || typeof item.uncertain !== "boolean") return null;
  if (!item.uncertain && !item.note.trim() && !item.nextTry.trim()) return null;
  if (item.progress !== undefined && (typeof item.progress !== "number" || !Number.isFinite(item.progress) || item.progress < 0 || item.progress > 1)) return null;
  if (!validDate(item.createdAt) || !validDate(item.updatedAt)) return null;
  return item as BoardDiscovery;
}

function resolveStorage(storage?: BoardStorage): BoardResult<BoardStorage> {
  if (storage) return { ok: true, value: storage };
  try {
    if (typeof window === "undefined" || !window.localStorage) return { ok: false, error: "此环境不支持浏览器记录" };
    return { ok: true, value: window.localStorage };
  } catch { return { ok: false, error: "暂时打不开这一拍的发现" }; }
}

function readEnvelope(storage: BoardStorage): BoardResult<BoardDiscovery[]> {
  let serialized: string | null;
  try { serialized = storage.getItem(BOARD_DISCOVERY_STORAGE_KEY); }
  catch { return { ok: false, error: "暂时读不到这一拍的发现" }; }
  if (serialized === null) return { ok: true, value: [] };
  if (serialized.length > MAX_STORED_CHARACTERS) return { ok: false, error: "发现记录过大，未覆盖原数据" };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    const envelope = parsed as Record<string, unknown>;
    if (envelope.version !== 1 || !Array.isArray(envelope.records) || envelope.records.length > MAX_RECORDS) throw new Error();
    const records: BoardDiscovery[] = [], seen = new Set<string>();
    for (const candidate of envelope.records) {
      const record = validateBoardDiscovery(candidate);
      if (!record || seen.has(record.boardId)) throw new Error();
      seen.add(record.boardId);
      records.push(record);
    }
    return { ok: true, value: records };
  } catch { return { ok: false, error: "发现记录已损坏，未覆盖原数据" }; }
}

function writeEnvelope(storage: BoardStorage, records: BoardDiscovery[]): BoardResult<void> {
  const serialized = JSON.stringify({ version: 1, records });
  if (records.length > MAX_RECORDS || serialized.length > MAX_STORED_CHARACTERS) return { ok: false, error: "发现记录已达容量上限" };
  try {
    if (records.length) storage.setItem(BOARD_DISCOVERY_STORAGE_KEY, serialized);
    else storage.removeItem(BOARD_DISCOVERY_STORAGE_KEY);
    return { ok: true, value: undefined };
  } catch { return { ok: false, error: "这次发现尚未保存，请重试" }; }
}

export function readBoardDiscovery(boardId: string, storage?: BoardStorage): BoardResult<BoardDiscovery | undefined> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const records = readEnvelope(target.value);
  return records.ok ? { ok: true, value: records.value.find(record => record.boardId === boardId) } : records;
}

export function readAllBoardDiscoveries(storage?: BoardStorage): BoardResult<BoardDiscovery[]> {
  const target = resolveStorage(storage);
  return target.ok ? readEnvelope(target.value) : target;
}

export function saveBoardDiscoveryIfUnchanged(value: BoardDiscovery, expected: BoardDiscovery | undefined, storage?: BoardStorage): BoardResult<BoardDiscovery> {
  const record = validateBoardDiscovery(value);
  if (!record) return { ok: false, error: "这一拍的发现不完整" };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const existing = readEnvelope(target.value);
  if (!existing.ok) return existing;
  const current = existing.value.find(item => item.boardId === record.boardId);
  if (JSON.stringify(current) !== JSON.stringify(expected)) return { ok: false, error: "这一拍的发现已在另一页改变，未覆盖。请关闭后重新打开查看。" };
  const written = writeEnvelope(target.value, [...existing.value.filter(item => item.boardId !== record.boardId), record]);
  return written.ok ? { ok: true, value: record } : written;
}

export function saveBoardDiscovery(value: BoardDiscovery, storage?: BoardStorage): BoardResult<BoardDiscovery> {
  const current = readBoardDiscovery(value.boardId, storage);
  return current.ok ? saveBoardDiscoveryIfUnchanged(value, current.value, storage) : current;
}

export function deleteBoardDiscovery(boardId: string, storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const existing = readEnvelope(target.value);
  return existing.ok ? writeEnvelope(target.value, existing.value.filter(item => item.boardId !== boardId)) : existing;
}

export function deleteBoardDiscoveryIfUnchanged(boardId: string, expected: BoardDiscovery | undefined, storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const existing = readEnvelope(target.value);
  if (!existing.ok) return existing;
  const current = existing.value.find(item => item.boardId === boardId);
  if (JSON.stringify(current) !== JSON.stringify(expected)) return { ok: false, error: "这一拍的发现已在另一页改变，未删除" };
  return current ? writeEnvelope(target.value, existing.value.filter(item => item.boardId !== boardId)) : { ok: true, value: undefined };
}
