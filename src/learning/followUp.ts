import type { BoardStorage } from "../board/storage";
import type { BoardResult } from "../board/validate";
import { fixedSkillById, type FixedSkillId } from "./model";

export const BOARD_FOLLOW_UP_STORAGE_KEY = "rallypath:board-follow-up:v1";
export const BOARD_FOLLOW_UP_EVENT = "rallypath-board-follow-up-changed";

export type BoardFollowUp = {
  version: 1;
  id: string;
  boardId: string;
  frameId: string;
  progress?: number;
  skillId: FixedSkillId;
  skillLabel: string;
  question: string;
  note: string;
  uncertain: boolean;
  createdAt: string;
  updatedAt: string;
};

const MAX_RECORDS = 100;
const MAX_STORED_CHARACTERS = 120_000;
const MAX_NOTE_LENGTH = 240;
const validId = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 160;
const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function validateBoardFollowUp(value: unknown): BoardFollowUp | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || !validId(item.id) || !validId(item.boardId) || !validId(item.frameId)) return null;
  if (typeof item.skillId !== "string" || !fixedSkillById(item.skillId)) return null;
  if (typeof item.skillLabel !== "string" || !item.skillLabel.trim() || item.skillLabel.length > 120) return null;
  if (typeof item.question !== "string" || !item.question.trim() || item.question.length > 240) return null;
  if (typeof item.note !== "string" || item.note.length > MAX_NOTE_LENGTH || typeof item.uncertain !== "boolean") return null;
  if (item.progress !== undefined && (typeof item.progress !== "number" || !Number.isFinite(item.progress) || item.progress < 0 || item.progress > 1)) return null;
  if (!item.uncertain && !item.note.trim()) return null;
  if (!validDate(item.createdAt) || !validDate(item.updatedAt)) return null;
  return item as BoardFollowUp;
}

function resolveStorage(storage?: BoardStorage): BoardResult<BoardStorage> {
  if (storage) return { ok: true, value: storage };
  try {
    if (typeof window === "undefined" || !window.localStorage) return { ok: false, error: "此环境不支持浏览器记录" };
    return { ok: true, value: window.localStorage };
  } catch {
    return { ok: false, error: "暂时打不开练后的发现" };
  }
}

function readEnvelope(storage: BoardStorage): BoardResult<BoardFollowUp[]> {
  let serialized: string | null;
  try { serialized = storage.getItem(BOARD_FOLLOW_UP_STORAGE_KEY); }
  catch { return { ok: false, error: "暂时读不到练后的发现" }; }
  if (serialized === null) return { ok: true, value: [] };
  if (serialized.length > MAX_STORED_CHARACTERS) return { ok: false, error: "练后的记录过大，未覆盖原数据" };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    const envelope = parsed as Record<string, unknown>;
    if (envelope.version !== 1 || !Array.isArray(envelope.records) || envelope.records.length > MAX_RECORDS) throw new Error();
    const records: BoardFollowUp[] = [], seen = new Set<string>();
    for (const candidate of envelope.records) {
      const record = validateBoardFollowUp(candidate);
      if (!record || seen.has(record.boardId)) throw new Error();
      seen.add(record.boardId);
      records.push(record);
    }
    return { ok: true, value: records };
  } catch {
    return { ok: false, error: "练后的记录已损坏，未覆盖原数据" };
  }
}

function writeEnvelope(storage: BoardStorage, records: BoardFollowUp[]): BoardResult<void> {
  const serialized = JSON.stringify({ version: 1, records });
  if (serialized.length > MAX_STORED_CHARACTERS) return { ok: false, error: "练后的记录已达容量上限" };
  try {
    if (records.length) storage.setItem(BOARD_FOLLOW_UP_STORAGE_KEY, serialized);
    else storage.removeItem(BOARD_FOLLOW_UP_STORAGE_KEY);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: "这次发现尚未保存，请重试" };
  }
}

export function readBoardFollowUp(boardId: string, storage?: BoardStorage): BoardResult<BoardFollowUp | undefined> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const records = readEnvelope(target.value);
  if (!records.ok) return records;
  return { ok: true, value: records.value.find(record => record.boardId === boardId) };
}

export function readAllBoardFollowUps(storage?: BoardStorage): BoardResult<BoardFollowUp[]> {
  const target = resolveStorage(storage);
  return target.ok ? readEnvelope(target.value) : target;
}

export function saveBoardFollowUp(value: BoardFollowUp, storage?: BoardStorage): BoardResult<BoardFollowUp> {
  return saveBoardFollowUpInternal(value, storage);
}

export function saveBoardFollowUpIfUnchanged(value: BoardFollowUp, expected: BoardFollowUp | undefined, storage?: BoardStorage): BoardResult<BoardFollowUp> {
  return saveBoardFollowUpInternal(value, storage, { value: expected });
}

function saveBoardFollowUpInternal(value: BoardFollowUp, storage?: BoardStorage, expected?: { value: BoardFollowUp | undefined }): BoardResult<BoardFollowUp> {
  const record = validateBoardFollowUp(value);
  if (!record) return { ok: false, error: "这次发现不完整" };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const existing = readEnvelope(target.value);
  if (!existing.ok) return existing;
  const current = existing.value.find(item => item.boardId === record.boardId);
  if (expected && JSON.stringify(current) !== JSON.stringify(expected.value)) {
    return { ok: false, error: "这一拍的发现已在另一页改变，未覆盖。请关闭后重新打开查看。" };
  }
  const records = existing.value.filter(item => item.boardId !== record.boardId);
  records.push(record);
  if (records.length > MAX_RECORDS) return { ok: false, error: "练后的记录已达数量上限" };
  const written = writeEnvelope(target.value, records);
  return written.ok ? { ok: true, value: record } : written;
}

export function deleteBoardFollowUp(boardId: string, storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const existing = readEnvelope(target.value);
  if (!existing.ok) return existing;
  return writeEnvelope(target.value, existing.value.filter(item => item.boardId !== boardId));
}

export function deleteBoardFollowUpIfUnchanged(boardId: string, expected: BoardFollowUp | undefined, storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const existing = readEnvelope(target.value);
  if (!existing.ok) return existing;
  const current = existing.value.find(item => item.boardId === boardId);
  if (JSON.stringify(current) !== JSON.stringify(expected)) return { ok: false, error: "练后的发现已在另一页改变，未删除" };
  return current ? writeEnvelope(target.value, existing.value.filter(item => item.boardId !== boardId)) : { ok: true, value: undefined };
}
