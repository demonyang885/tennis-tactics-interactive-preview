import type { BoardDocument } from "../board/model";
import type { BoardStorage } from "../board/storage";
import { BOARD_IMPORT_MAX_CHARACTERS, parseBoardJSON, validateBoardDocument, type BoardResult } from "../board/validate";
import { validateLearningChoice, type BoardLearningChoice, type FixedSkillId } from "./model";
import { readBoardFollowUp, validateBoardFollowUp, type BoardFollowUp } from "./followUp";
import { readBoardDiscovery, validateBoardDiscovery, type BoardDiscovery } from "./discovery";
import { readBoardAlternative, validateBoardAlternative, type BoardAlternative } from "./alternative";

export const BOARD_LEARNING_STORAGE_KEY = "rallypath:board-learning:v1";
export const BOARD_LEARNING_EVENT = "rallypath-board-learning-changed";

const MAX_RECORDS = 100;
// An older preview could write exactly one record beyond MAX_RECORDS before
// its reader rejected the envelope. Keep that one extra record recoverable.
const MAX_RECOVERABLE_RECORDS = MAX_RECORDS + 1;
const MAX_STORED_CHARACTERS = 120_000;

type LearningEnvelope = {
  version: 1;
  records: BoardLearningChoice[];
};

export type BoardBackupPackage = {
  kind: "rallypath-board-backup";
  version: 1 | 2;
  board: BoardDocument;
  learning?: BoardLearningChoice;
  followUp?: BoardFollowUp;
  discovery?: BoardDiscovery;
  alternative?: BoardAlternative;
};

function defaultStorage(): BoardResult<BoardStorage> {
  try {
    if (typeof window === "undefined" || !window.localStorage) return { ok: false, error: "此环境不支持浏览器记录" };
    return { ok: true, value: window.localStorage };
  } catch {
    return { ok: false, error: "暂时打不开这一分的记录" };
  }
}

function resolveStorage(storage?: BoardStorage): BoardResult<BoardStorage> {
  return storage ? { ok: true, value: storage } : defaultStorage();
}

function readEnvelope(storage: BoardStorage): BoardResult<LearningEnvelope> {
  let serialized: string | null;
  try {
    serialized = storage.getItem(BOARD_LEARNING_STORAGE_KEY);
  } catch {
    return { ok: false, error: "暂时读不到这一分的下一步" };
  }
  if (serialized === null) return { ok: true, value: { version: 1, records: [] } };
  if (serialized.length > MAX_STORED_CHARACTERS) return { ok: false, error: "这一分的记录过大，未覆盖原数据" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { ok: false, error: "这一分的记录已损坏，未覆盖原数据" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ok: false, error: "这一分的记录格式不正确" };
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.records) || candidate.records.length > MAX_RECOVERABLE_RECORDS) {
    return { ok: false, error: "不支持的下一步记录格式" };
  }

  const records: BoardLearningChoice[] = [];
  const boardIds = new Set<string>();
  for (const item of candidate.records) {
    const record = validateLearningChoice(item);
    if (!record || boardIds.has(record.boardId)) return { ok: false, error: "下一步记录不完整，未覆盖原数据" };
    boardIds.add(record.boardId);
    records.push(record);
  }
  return { ok: true, value: { version: 1, records } };
}

function writeEnvelope(storage: BoardStorage, envelope: LearningEnvelope): BoardResult<void> {
  if (envelope.records.length > MAX_RECOVERABLE_RECORDS) return { ok: false, error: "下一步记录已达数量上限" };
  let serialized: string;
  try {
    serialized = JSON.stringify(envelope);
  } catch {
    return { ok: false, error: "这一分的下一步尚未保存" };
  }
  if (serialized.length > MAX_STORED_CHARACTERS) return { ok: false, error: "下一步记录已达容量上限" };
  try {
    if (envelope.records.length) storage.setItem(BOARD_LEARNING_STORAGE_KEY, serialized);
    else storage.removeItem(BOARD_LEARNING_STORAGE_KEY);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: "这一分的下一步尚未保存" };
  }
}

export function readLearningChoice(boardId: string, storage?: BoardStorage): BoardResult<BoardLearningChoice | undefined> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;
  return { ok: true, value: envelope.value.records.find((record) => record.boardId === boardId) };
}

export function saveTacticChoice(boardId: string, tacticId: string, storage?: BoardStorage): BoardResult<BoardLearningChoice> {
  return saveChoice({ version: 1, boardId, route: "tactic", tacticId, updatedAt: new Date().toISOString() }, storage);
}

export function saveSkillChoice(boardId: string, skillId: FixedSkillId, storage?: BoardStorage): BoardResult<BoardLearningChoice> {
  return saveChoice({ version: 1, boardId, route: "skill", skillId, updatedAt: new Date().toISOString() }, storage);
}

export function saveSkillChoiceIfUnchanged(boardId: string, skillId: FixedSkillId, expected: BoardLearningChoice | undefined, storage?: BoardStorage): BoardResult<BoardLearningChoice> {
  return saveChoice({ version: 1, boardId, route: "skill", skillId, updatedAt: new Date().toISOString() }, storage, { value: expected });
}

export function saveTacticChoiceIfUnchanged(boardId: string, tacticId: string, expected: BoardLearningChoice | undefined, storage?: BoardStorage): BoardResult<BoardLearningChoice> {
  return saveChoice({ version: 1, boardId, route: "tactic", tacticId, updatedAt: new Date().toISOString() }, storage, { value: expected });
}

export function saveLearningChoice(choice: BoardLearningChoice, storage?: BoardStorage): BoardResult<BoardLearningChoice> {
  const validated = validateLearningChoice(choice);
  if (!validated) return { ok: false, error: "这一分的下一步不完整" };
  return saveChoice(validated, storage);
}

export function saveLearningChoiceIfUnchanged(choice: BoardLearningChoice, expected: BoardLearningChoice | undefined, storage?: BoardStorage): BoardResult<BoardLearningChoice> {
  const validated = validateLearningChoice(choice);
  if (!validated) return { ok: false, error: "这一分的下一步不完整" };
  return saveChoice(validated, storage, { value: expected });
}

function saveChoice(choice: BoardLearningChoice, storage?: BoardStorage, expected?: { value: BoardLearningChoice | undefined }): BoardResult<BoardLearningChoice> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;
  const current = envelope.value.records.find((record) => record.boardId === choice.boardId);
  if (expected && JSON.stringify(current) !== JSON.stringify(expected.value)) {
    return { ok: false, error: "这一分的下一步已在另一页改变，未覆盖。请返回画板重新查看。" };
  }
  const records = envelope.value.records.filter((record) => record.boardId !== choice.boardId);
  records.push(choice);
  if (!current && records.length > MAX_RECORDS) return { ok: false, error: "下一步记录已达数量上限" };
  const written = writeEnvelope(target.value, { version: 1, records });
  if (!written.ok) return written;
  return { ok: true, value: choice };
}

export function deleteLearningChoice(boardId: string, storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;
  return writeEnvelope(target.value, { version: 1, records: envelope.value.records.filter((record) => record.boardId !== boardId) });
}

/** A board deletion must not erase a choice changed after its recovery journal was captured. */
export function deleteLearningChoiceIfUnchanged(boardId: string, expected: BoardLearningChoice | undefined, storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const envelope = readEnvelope(target.value);
  if (!envelope.ok) return envelope;
  const current = envelope.value.records.find((record) => record.boardId === boardId);
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    return { ok: false, error: "这一分的下一步已在另一页改变，未删除" };
  }
  return current
    ? writeEnvelope(target.value, { version: 1, records: envelope.value.records.filter((record) => record.boardId !== boardId) })
    : { ok: true, value: undefined };
}

export function createBoardBackupJSON(board: BoardDocument, storage?: BoardStorage): BoardResult<string> {
  const learning = readLearningChoice(board.id, storage);
  if (!learning.ok) return learning;
  const followUp = readBoardFollowUp(board.id, storage);
  if (!followUp.ok) return followUp;
  const discovery = readBoardDiscovery(board.id, storage);
  if (!discovery.ok) return discovery;
  const alternative = readBoardAlternative(board.id, storage);
  if (!alternative.ok) return alternative;
  const backup: BoardBackupPackage = {
    kind: "rallypath-board-backup",
    version: discovery.value || alternative.value ? 2 : 1,
    board,
    ...(learning.value ? { learning: learning.value } : {}),
    ...(followUp.value ? { followUp: followUp.value } : {}),
    ...(discovery.value ? { discovery: discovery.value } : {}),
    ...(alternative.value ? { alternative: alternative.value } : {}),
  };
  let serialized: string;
  try {
    serialized = JSON.stringify(backup, null, 2);
    // Keep readable backups normally, but drop formatting if that alone would
    // make an otherwise valid editable backup exceed the importer limit.
    if (serialized.length > BOARD_IMPORT_MAX_CHARACTERS) serialized = JSON.stringify(backup);
  } catch {
    return { ok: false, error: "备份内容无法整理，未生成文件" };
  }
  if (serialized.length > BOARD_IMPORT_MAX_CHARACTERS) {
    return { ok: false, error: "备份内容过大，无法生成可重新导入的文件" };
  }
  return { ok: true, value: serialized };
}

export function parseBoardBackupJSON(serialized: string): BoardResult<{ board: BoardDocument; learning?: BoardLearningChoice; followUp?: BoardFollowUp; discovery?: BoardDiscovery; alternative?: BoardAlternative }> {
  if (typeof serialized !== "string" || serialized.length > BOARD_IMPORT_MAX_CHARACTERS) {
    return { ok: false, error: `备份文件过大（最多 ${BOARD_IMPORT_MAX_CHARACTERS.toLocaleString()} 字符）` };
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return { ok: false, error: "备份不是有效的 JSON" };
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    if (candidate.kind === "rallypath-board-backup" && (candidate.version === 1 || candidate.version === 2)) {
      const board = validateBoardDocument(candidate.board);
      if (!board.ok) return board;
      const learning = candidate.learning === undefined ? undefined : validateLearningChoice(candidate.learning);
      if (candidate.learning !== undefined && !learning) return { ok: false, error: "备份中的下一步记录不完整" };
      if (learning && learning.boardId !== board.value.id) return { ok: false, error: "备份中的下一步不属于这张画板" };
      const followUp = candidate.followUp === undefined ? undefined : validateBoardFollowUp(candidate.followUp);
      if (candidate.followUp !== undefined && (!followUp || followUp.boardId !== board.value.id)) return { ok: false, error: "备份中的练后发现不完整" };
      const discovery = candidate.version === 2 && candidate.discovery !== undefined ? validateBoardDiscovery(candidate.discovery) : undefined;
      if (candidate.discovery !== undefined && (!discovery || discovery.boardId !== board.value.id)) return { ok: false, error: "备份中的个人发现不完整" };
      const alternative = candidate.version === 2 && candidate.alternative !== undefined ? validateBoardAlternative(candidate.alternative) : undefined;
      if (candidate.alternative !== undefined && (!alternative || alternative.sourceBoardId !== board.value.id)) return { ok: false, error: "备份中的另一种打法不完整" };
      return { ok: true, value: { board: board.value, ...(learning ? { learning } : {}), ...(followUp ? { followUp } : {}), ...(discovery ? { discovery } : {}), ...(alternative ? { alternative } : {}) } };
    }
  }

  const legacy = parseBoardJSON(serialized);
  return legacy.ok ? { ok: true, value: { board: legacy.value } } : legacy;
}

/** A failed alternative save can still be exported as a restorable, self-contained v2 backup. */
export function createAlternativeRecoveryBackupJSON(value: BoardAlternative): BoardResult<string> {
  const alternative = validateBoardAlternative(value);
  if (!alternative) return { ok: false, error: "试法还没有可备份的实际改动" };
  const backup: BoardBackupPackage = { kind: "rallypath-board-backup", version: 2,
    board: alternative.sourceSnapshot, alternative };
  const serialized = JSON.stringify(backup);
  return serialized.length <= BOARD_IMPORT_MAX_CHARACTERS
    ? { ok: true, value: serialized }
    : { ok: false, error: "备份内容过大，无法重新导入" };
}
