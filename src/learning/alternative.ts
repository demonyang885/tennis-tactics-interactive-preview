import { cloneBoard, type BoardDocument } from "../board/model";
import type { BoardStorage } from "../board/storage";
import { validateBoardDocument, type BoardResult } from "../board/validate";

export const BOARD_ALTERNATIVES_STORAGE_KEY = "rallypath:board-alternatives:v1";
export const BOARD_ALTERNATIVES_EVENT = "rallypath-board-alternatives-changed";

export type BoardAlternative = {
  version: 1;
  id: string;
  sourceBoardId: string;
  startFrameId: string;
  tacticId: string;
  sourceSnapshot: BoardDocument;
  board: BoardDocument;
  createdAt: string;
  updatedAt: string;
};

const MAX_RECORDS = 20;
const MAX_STORED_CHARACTERS = 4_000_000;
const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const validId = (value: unknown) => typeof value === "string" && Boolean(value.trim()) && value.length <= 160;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function hasAlternativeChange(source: BoardDocument, candidate: BoardDocument, startFrameId: string): boolean {
  const start = source.frames.findIndex(frame => frame.id === startFrameId);
  if (start < 0) return false;
  const projection = (board: BoardDocument) => board.frames.slice(start).map(frame => ({
    id: frame.id, poses: frame.poses, paths: frame.paths,
  }));
  return !same(projection(source), projection(candidate));
}

export function validateBoardAlternative(value: unknown): BoardAlternative | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || !validId(item.id) || !validId(item.sourceBoardId)
    || !validId(item.startFrameId) || !validId(item.tacticId)
    || !validDate(item.createdAt) || !validDate(item.updatedAt)) return null;
  const source = validateBoardDocument(item.sourceSnapshot);
  const candidate = validateBoardDocument(item.board);
  if (!source.ok || !candidate.ok || source.value.id !== item.sourceBoardId || candidate.value.id !== item.id
    || source.value.id === candidate.value.id || !same(source.value.actors, candidate.value.actors)) return null;
  const start = source.value.frames.findIndex(frame => frame.id === item.startFrameId);
  if (start < 0 || source.value.frames[start].paths.length === 0 || candidate.value.frames.length <= start) return null;
  if (!same(source.value.frames.slice(0, start), candidate.value.frames.slice(0, start))
    || candidate.value.frames[start].id !== item.startFrameId
    || !same(source.value.frames[start].poses, candidate.value.frames[start].poses)
    || !candidate.value.frames.slice(start).some(frame => frame.paths.some(path => path.kind === "shot"))
    || !hasAlternativeChange(source.value, candidate.value, item.startFrameId)) return null;
  return { ...item, sourceSnapshot: source.value, board: candidate.value } as BoardAlternative;
}

export function createAlternativeDraft(source: BoardDocument, startFrameId: string, tacticId: string): BoardResult<BoardAlternative> {
  const validated = validateBoardDocument(source);
  if (!validated.ok) return validated;
  const start = validated.value.frames.findIndex(frame => frame.id === startFrameId);
  if (start < 0 || validated.value.frames[start].paths.length === 0) return { ok: false, error: "先选有球路的那一拍" };
  if (!validId(tacticId)) return { ok: false, error: "先选一个打法作参考" };
  const board = cloneBoard(validated.value, `${validated.value.title} · 试试`);
  const now = new Date().toISOString();
  return { ok: true, value: { version: 1, id: board.id, sourceBoardId: validated.value.id,
    startFrameId, tacticId, sourceSnapshot: validated.value, board, createdAt: now, updatedAt: now } };
}

function resolveStorage(storage?: BoardStorage): BoardResult<BoardStorage> {
  if (storage) return { ok: true, value: storage };
  try {
    if (typeof window === "undefined" || !window.localStorage) return { ok: false, error: "此环境不支持浏览器记录" };
    return { ok: true, value: window.localStorage };
  } catch { return { ok: false, error: "暂时打不开另一种打法" }; }
}

function readEnvelope(storage: BoardStorage): BoardResult<BoardAlternative[]> {
  let serialized: string | null;
  try { serialized = storage.getItem(BOARD_ALTERNATIVES_STORAGE_KEY); }
  catch { return { ok: false, error: "暂时读不到另一种打法" }; }
  if (serialized === null) return { ok: true, value: [] };
  if (serialized.length > MAX_STORED_CHARACTERS) return { ok: false, error: "另一种打法资料过大，未覆盖原数据" };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    const envelope = parsed as Record<string, unknown>;
    if (envelope.version !== 1 || !Array.isArray(envelope.records) || envelope.records.length > MAX_RECORDS) throw new Error();
    const records: BoardAlternative[] = [], sources = new Set<string>(), ids = new Set<string>();
    for (const candidate of envelope.records) {
      const record = validateBoardAlternative(candidate);
      if (!record || sources.has(record.sourceBoardId) || ids.has(record.id)) throw new Error();
      sources.add(record.sourceBoardId);ids.add(record.id);records.push(record);
    }
    return { ok: true, value: records };
  } catch { return { ok: false, error: "另一种打法资料已损坏，未覆盖原数据" }; }
}

function writeEnvelope(storage: BoardStorage, records: BoardAlternative[]): BoardResult<void> {
  const serialized = JSON.stringify({ version: 1, records });
  if (records.length > MAX_RECORDS || serialized.length > MAX_STORED_CHARACTERS) return { ok: false, error: "另一种打法资料已达容量上限；请先备份原画板" };
  try {
    if (records.length) storage.setItem(BOARD_ALTERNATIVES_STORAGE_KEY, serialized);
    else storage.removeItem(BOARD_ALTERNATIVES_STORAGE_KEY);
    return { ok: true, value: undefined };
  } catch { return { ok: false, error: "另一种打法尚未保存，请重试" }; }
}

export function readAllAlternatives(storage?: BoardStorage): BoardResult<BoardAlternative[]> {
  const target = resolveStorage(storage);
  return target.ok ? readEnvelope(target.value) : target;
}

export function readBoardAlternative(sourceBoardId: string, storage?: BoardStorage): BoardResult<BoardAlternative | undefined> {
  const records = readAllAlternatives(storage);
  return records.ok ? { ok: true, value: records.value.find(record => record.sourceBoardId === sourceBoardId) } : records;
}

export function checkBoardAlternativeUnchanged(expected: BoardAlternative, storage?: BoardStorage): BoardResult<BoardAlternative> {
  const current = readBoardAlternative(expected.sourceBoardId, storage);
  if (!current.ok) return current;
  return same(current.value, expected)
    ? { ok: true, value: current.value! }
    : { ok: false, error: "另一种打法已在另一页改变，未覆盖。请重新打开查看。" };
}

export function saveBoardAlternativeIfUnchanged(value: BoardAlternative, expected: BoardAlternative | undefined, storage?: BoardStorage): BoardResult<BoardAlternative> {
  const record = validateBoardAlternative(value);
  if (!record) return { ok: false, error: "试法还没有改出一条有效球路或站位，未保存" };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const existing = readEnvelope(target.value);
  if (!existing.ok) return existing;
  const current = existing.value.find(item => item.sourceBoardId === record.sourceBoardId);
  if (!same(current, expected)) return { ok: false, error: "另一种打法已在另一页改变，未覆盖。请重新打开查看。" };
  if (expected && (record.id !== expected.id || !same(record.sourceSnapshot, expected.sourceSnapshot)
    || record.startFrameId !== expected.startFrameId || record.tacticId !== expected.tacticId)) {
    return { ok: false, error: "试法起点已改变，未覆盖原记录" };
  }
  const next = { ...record, updatedAt: new Date().toISOString() };
  const written = writeEnvelope(target.value, [...existing.value.filter(item => item.sourceBoardId !== record.sourceBoardId), next]);
  return written.ok ? { ok: true, value: next } : written;
}

export function deleteBoardAlternativeIfUnchanged(sourceBoardId: string, expected: BoardAlternative, storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const existing = readEnvelope(target.value);
  if (!existing.ok) return existing;
  const current = existing.value.find(item => item.sourceBoardId === sourceBoardId);
  if (!same(current, expected)) return { ok: false, error: "另一种打法已在另一页改变，未删除" };
  return writeEnvelope(target.value, existing.value.filter(item => item.sourceBoardId !== sourceBoardId));
}
