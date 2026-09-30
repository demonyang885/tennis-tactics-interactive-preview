import { readBoards, type BoardStorage } from "../board/storage";
import type { BoardResult } from "../board/validate";
import { validateLearningChoice, type BoardLearningChoice } from "./model";
import { deleteLearningChoice, readLearningChoice } from "./storage";
import { deleteBoardFollowUp, readBoardFollowUp, validateBoardFollowUp, type BoardFollowUp } from "./followUp";
import { deleteBoardDiscovery, readBoardDiscovery, validateBoardDiscovery, type BoardDiscovery } from "./discovery";

export const BOARD_COPY_JOURNAL_KEY = "rallypath:board-copy-pending:v1";
export const BOARD_COPY_RECOVERY_EVENT = "rallypath-board-copy-recovered";

export type BoardCopyJournal = {
  version: 1;
  sourceId: string;
  targetId: string;
  learning?: BoardLearningChoice;
  followUp?: BoardFollowUp;
  discovery?: BoardDiscovery;
};

const MAX_JOURNAL_CHARACTERS = 5_000;
const validId = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= 160;

function resolveStorage(storage?: BoardStorage): BoardResult<BoardStorage> {
  if (storage) return { ok: true, value: storage };
  try {
    if (typeof window === "undefined" || !window.localStorage) return { ok: false, error: "此环境不支持浏览器记录" };
    return { ok: true, value: window.localStorage };
  } catch {
    return { ok: false, error: "暂时打不开另存续接记录" };
  }
}

function validateJournal(value: unknown): BoardCopyJournal | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !validId(candidate.sourceId) || !validId(candidate.targetId)
    || candidate.sourceId === candidate.targetId || candidate.learning === undefined && candidate.followUp === undefined && candidate.discovery === undefined) return null;
  const learning = candidate.learning === undefined ? undefined : validateLearningChoice(candidate.learning);
  const followUp = candidate.followUp === undefined ? undefined : validateBoardFollowUp(candidate.followUp);
  const discovery = candidate.discovery === undefined ? undefined : validateBoardDiscovery(candidate.discovery);
  if (candidate.learning !== undefined && !learning || candidate.followUp !== undefined && !followUp || candidate.discovery !== undefined && !discovery) return null;
  if (learning && learning.boardId !== candidate.targetId || followUp && followUp.boardId !== candidate.targetId || discovery && discovery.boardId !== candidate.targetId) return null;
  return {
    version: 1,
    sourceId: candidate.sourceId,
    targetId: candidate.targetId,
    ...(learning ? { learning } : {}),
    ...(followUp ? { followUp } : {}),
    ...(discovery ? { discovery } : {}),
  };
}

export function readBoardCopyJournal(storage?: BoardStorage): BoardResult<BoardCopyJournal | undefined> {
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  let serialized: string | null;
  try { serialized = target.value.getItem(BOARD_COPY_JOURNAL_KEY); }
  catch { return { ok: false, error: "暂时读不到上次另存记录" }; }
  if (serialized === null) return { ok: true, value: undefined };
  if (serialized.length > MAX_JOURNAL_CHARACTERS) return { ok: false, error: "上次另存记录异常，未清理原始资料" };
  try {
    const journal = validateJournal(JSON.parse(serialized));
    return journal ? { ok: true, value: journal } : { ok: false, error: "上次另存记录异常，未清理原始资料" };
  } catch {
    return { ok: false, error: "上次另存记录异常，未清理原始资料" };
  }
}

export function saveBoardCopyJournal(journal: BoardCopyJournal, storage?: BoardStorage): BoardResult<void> {
  const valid = validateJournal(journal);
  if (!valid) return { ok: false, error: "另存续接记录不完整，未开始另存" };
  const serialized = JSON.stringify(valid);
  if (serialized.length > MAX_JOURNAL_CHARACTERS) return { ok: false, error: "另存续接记录过大，未开始另存" };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  const previous = readBoardCopyJournal(target.value);
  if (!previous.ok) return previous;
  if (previous.value) return { ok: false, error: "上次另存尚未整理完，请重试" };
  try {
    target.value.setItem(BOARD_COPY_JOURNAL_KEY, serialized);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: "暂时无法保留另存续接记录，未开始另存" };
  }
}

export function clearBoardCopyJournal(targetId: string, storage?: BoardStorage): BoardResult<void> {
  const pending = readBoardCopyJournal(storage);
  if (!pending.ok) return pending;
  if (!pending.value) return { ok: true, value: undefined };
  if (pending.value.targetId !== targetId) return { ok: false, error: "另存记录已在另一页改变，未清理" };
  const target = resolveStorage(storage);
  if (!target.ok) return target;
  try {
    target.value.removeItem(BOARD_COPY_JOURNAL_KEY);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: "另存续接记录暂时无法清理" };
  }
}

/** A board is published last. Another tab may still be writing it, so an
 * unpublished copy is never cleaned by a page merely opening. */
export function recoverPendingBoardCopy(
  storage?: BoardStorage,
  options: { allowUnpublishedCleanup?: boolean; expectedTargetId?: string } = {},
): BoardResult<"none" | "cleaned" | "completed"> {
  const pending = readBoardCopyJournal(storage);
  if (!pending.ok) return pending;
  const journal = pending.value;
  if (!journal) return { ok: true, value: "none" };
  if (options.expectedTargetId !== undefined && journal.targetId !== options.expectedTargetId) {
    return { ok: false, error: "另存记录已在另一页改变，未清理原始资料" };
  }
  const boards = readBoards(storage);
  if (!boards.ok) return boards;
  if (boards.value.some(board => board.id === journal.targetId)) {
    const cleared = clearBoardCopyJournal(journal.targetId, storage);
    return cleared.ok ? { ok: true, value: "completed" } : cleared;
  }
  if (!options.allowUnpublishedCleanup) {
    return { ok: false, error: "上次另存尚未完成；请确认其他页面已停止另存，再重试恢复" };
  }
  const learning = readLearningChoice(journal.targetId, storage);
  const followUp = readBoardFollowUp(journal.targetId, storage);
  const discovery = readBoardDiscovery(journal.targetId, storage);
  if (!learning.ok || !followUp.ok || !discovery.ok) return { ok: false, error: "暂时无法核对上次另存的关联记录，未清理" };
  if (learning.value && JSON.stringify(learning.value) !== JSON.stringify(journal.learning)
    || followUp.value && JSON.stringify(followUp.value) !== JSON.stringify(journal.followUp)
    || discovery.value && JSON.stringify(discovery.value) !== JSON.stringify(journal.discovery)) {
    return { ok: false, error: "另存记录已在另一页改变，未清理原始资料" };
  }
  if (followUp.value && !deleteBoardFollowUp(journal.targetId, storage).ok) return { ok: false, error: "练后发现暂时无法清理，请重试" };
  if (discovery.value && !deleteBoardDiscovery(journal.targetId, storage).ok) return { ok: false, error: "个人发现暂时无法清理，请重试" };
  if (learning.value && !deleteLearningChoice(journal.targetId, storage).ok) return { ok: false, error: "技能选择暂时无法清理，请重试" };
  const cleared = clearBoardCopyJournal(journal.targetId, storage);
  return cleared.ok ? { ok: true, value: "cleaned" } : cleared;
}
