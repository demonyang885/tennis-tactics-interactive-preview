import { readBoards, type BoardStorage } from "../board/storage";
import type { BoardResult } from "../board/validate";
import { validateLearningChoice, type BoardLearningChoice } from "./model";
import { readLearningChoice, saveLearningChoiceIfUnchanged } from "./storage";
import { readBoardFollowUp, saveBoardFollowUpIfUnchanged, validateBoardFollowUp, type BoardFollowUp } from "./followUp";
import { readBoardDiscovery, saveBoardDiscoveryIfUnchanged, validateBoardDiscovery, type BoardDiscovery } from "./discovery";

export const BOARD_DELETE_JOURNAL_KEY = "rallypath:board-delete-pending:v1";

export type BoardDeleteJournal = {
  version: 1;
  boardId: string;
  title: string;
  learning?: BoardLearningChoice;
  followUp?: BoardFollowUp;
  discovery?: BoardDiscovery;
};

const MAX_JOURNAL_CHARACTERS = 5_000;

function resolveStorage(storage?: BoardStorage): BoardResult<BoardStorage> {
  if (storage) return { ok: true, value: storage };
  try {
    if (typeof window === "undefined" || !window.localStorage) return { ok: false, error: "此环境不支持浏览器记录" };
    return { ok: true, value: window.localStorage };
  } catch {
    return { ok: false, error: "暂时打不开删除续接记录" };
  }
}

function validJournal(value: unknown): BoardDeleteJournal | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || typeof item.boardId !== "string" || !item.boardId.trim() || item.boardId.length > 160
    || typeof item.title !== "string" || !item.title.trim() || item.title.length > 120) return null;
  const learning = item.learning === undefined ? undefined : validateLearningChoice(item.learning);
  const followUp = item.followUp === undefined ? undefined : validateBoardFollowUp(item.followUp);
  const discovery = item.discovery === undefined ? undefined : validateBoardDiscovery(item.discovery);
  if ((item.learning !== undefined && !learning) || (item.followUp !== undefined && !followUp) || (item.discovery !== undefined && !discovery)) return null;
  if ((learning && learning.boardId !== item.boardId) || (followUp && followUp.boardId !== item.boardId) || (discovery && discovery.boardId !== item.boardId)) return null;
  return { version: 1, boardId: item.boardId, title: item.title, ...(learning ? { learning } : {}), ...(followUp ? { followUp } : {}), ...(discovery ? { discovery } : {}) };
}

function validJournalWithDamagedTitle(value: unknown): BoardDeleteJournal | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const titleIsValid = typeof item.title === "string" && Boolean(item.title.trim()) && item.title.length <= 120;
  // Only the display title may be lost; require at least one complete linked snapshot.
  if (titleIsValid || item.learning === undefined && item.followUp === undefined && item.discovery === undefined) return null;
  return validJournal({ ...item, title: "待恢复画板" });
}

function readJournalWithDamagedTitle(storage?: BoardStorage): BoardResult<BoardDeleteJournal | undefined> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  let serialized: string | null;
  try { serialized = target.value.getItem(BOARD_DELETE_JOURNAL_KEY); }
  catch { return { ok: false, error: "暂时读不到上次删除记录" }; }
  if (serialized === null || serialized.length > MAX_JOURNAL_CHARACTERS) return { ok: true, value: undefined };
  try { return { ok: true, value: validJournalWithDamagedTitle(JSON.parse(serialized)) ?? undefined }; }
  catch { return { ok: true, value: undefined }; }
}

export function readBoardDeleteJournal(storage?: BoardStorage): BoardResult<BoardDeleteJournal | undefined> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  let serialized: string | null;
  try { serialized = target.value.getItem(BOARD_DELETE_JOURNAL_KEY); }
  catch { return { ok: false, error: "暂时读不到上次删除记录" }; }
  if (serialized === null) return { ok: true, value: undefined };
  if (serialized.length > MAX_JOURNAL_CHARACTERS) return { ok: false, error: "上次删除记录异常，未继续删除" };
  try {
    const journal = validJournal(JSON.parse(serialized));
    return journal ? { ok: true, value: journal } : { ok: false, error: "上次删除记录异常，未继续删除" };
  } catch {
    return { ok: false, error: "上次删除记录异常，未继续删除" };
  }
}

export function saveBoardDeleteJournal(journal: BoardDeleteJournal, storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const valid = validJournal(journal);
  if (!valid) return { ok: false, error: "删除续接记录不完整，未开始删除" };
  const serialized = JSON.stringify(valid);
  if (serialized.length > MAX_JOURNAL_CHARACTERS) return { ok: false, error: "删除续接记录过大，未开始删除" };
  try {
    target.value.setItem(BOARD_DELETE_JOURNAL_KEY, serialized);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: "暂时无法保留删除续接记录，未开始删除" };
  }
}

export function clearBoardDeleteJournal(storage?: BoardStorage): BoardResult<void> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  try {
    target.value.removeItem(BOARD_DELETE_JOURNAL_KEY);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: "删除续接记录暂时无法清理" };
  }
}

/** Restores missing relationships only while the source board still exists. */
export function recoverPendingBoardDelete(storage?: BoardStorage): BoardResult<"none" | "restored" | "cleared"> {
  const pending = readBoardDeleteJournal(storage);
  const titleRepair = pending.ok ? undefined : readJournalWithDamagedTitle(storage);
  if (!pending.ok && (!titleRepair?.ok || !titleRepair.value)) return pending;
  const journal = pending.ok ? pending.value : titleRepair?.ok ? titleRepair.value : undefined;
  if (!journal) return { ok: true, value: "none" };
  const boards = readBoards(storage);
  if (!boards.ok) return boards;
  if (!boards.value.some(board => board.id === journal.boardId)) {
    if (!pending.ok) return { ok: false, error: "原画板已不在本机，已保留受损删除记录供恢复排查" };
    const cleared = clearBoardDeleteJournal(storage);
    return cleared.ok ? { ok: true, value: "cleared" } : cleared;
  }
  const learning = readLearningChoice(journal.boardId, storage);
  const followUp = readBoardFollowUp(journal.boardId, storage);
  const discovery = readBoardDiscovery(journal.boardId, storage);
  if (!learning.ok || !followUp.ok || !discovery.ok) return { ok: false, error: "暂时无法核对上次删除的关联记录" };
  if (journal.learning && !learning.value) {
    const restored = saveLearningChoiceIfUnchanged(journal.learning, undefined, storage);
    if (!restored.ok) return { ok: false, error: "关联选择尚未恢复，请重试恢复" };
  }
  if (journal.followUp && !followUp.value) {
    const restored = saveBoardFollowUpIfUnchanged(journal.followUp, undefined, storage);
    if (!restored.ok) return { ok: false, error: "练后发现尚未恢复，请重试恢复" };
  }
  if (journal.discovery && !discovery.value) {
    const restored = saveBoardDiscoveryIfUnchanged(journal.discovery, undefined, storage);
    if (!restored.ok) return { ok: false, error: "个人发现尚未恢复，请重试恢复" };
  }
  const cleared = clearBoardDeleteJournal(storage);
  return cleared.ok ? { ok: true, value: "restored" } : cleared;
}
