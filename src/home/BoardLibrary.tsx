import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilePlusIcon,
  LayersIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "@radix-ui/react-icons";

import {
  BOARD_PURPOSE_LABELS,
  cloneBoard,
  createStarterBoard,
  getBoardPurpose,
  newBoardId,
  type BoardDocument,
} from "../board/model";
import { BOARD_STORAGE_KEY, checkBoardUnchanged, deleteBoardIfUnchanged, readBoards, saveBoardIfUnchanged, type BoardSaveConflict } from "../board/storage";
import { BOARD_IMPORT_MAX_CHARACTERS } from "../board/validate";
import { BOARD_LEARNING_STORAGE_KEY, createBoardBackupJSON, deleteLearningChoice, deleteLearningChoiceIfUnchanged, parseBoardBackupJSON, readLearningChoice, saveLearningChoice } from "../learning/storage";
import { BOARD_FOLLOW_UP_STORAGE_KEY, deleteBoardFollowUp, deleteBoardFollowUpIfUnchanged, readAllBoardFollowUps, readBoardFollowUp, saveBoardFollowUp, type BoardFollowUp } from "../learning/followUp";
import { BOARD_DISCOVERY_STORAGE_KEY, deleteBoardDiscovery, deleteBoardDiscoveryIfUnchanged, readAllBoardDiscoveries, readBoardDiscovery, saveBoardDiscovery, type BoardDiscovery } from "../learning/discovery";
import { BOARD_ALTERNATIVES_EVENT, BOARD_ALTERNATIVES_STORAGE_KEY, deleteBoardAlternativeIfUnchanged, readAllAlternatives, readBoardAlternative, saveBoardAlternativeIfUnchanged, type BoardAlternative } from "../learning/alternative";
import { BOARD_DELETE_JOURNAL_KEY, clearBoardDeleteJournal, readBoardDeleteJournal, recoverPendingBoardDelete, saveBoardDeleteJournal } from "../learning/deleteJournal";
import { BOARD_IMPORT_JOURNAL_KEY, boardBackupSignature, clearBoardImportJournal, readBoardImportJournal, readRecoverableBoardImportJournal, saveBoardImportJournal, type BoardImportJournal } from "../learning/importJournal";
import { BOARD_COPY_JOURNAL_KEY, BOARD_COPY_RECOVERY_EVENT, readBoardCopyJournal, recoverPendingBoardCopy } from "../learning/copyJournal";
import { BottomSheet, MobileScroll, useKeyboard } from "../mobile";
import "./board-delete-confirmation.css";

export const BOARD_DRAFTS_EVENT = "tennis-board-drafts-changed";

export type BoardLibraryProps = {
  openBoard: (board: BoardDocument, persisted?: boolean, notice?: string) => void;
  openAlternative?: (record: BoardAlternative, sourceMissing: boolean) => void;
  /** The editor directly beneath this library screen remains mounted. */
  activeBoardId?: string;
  /** Allows a parent FlowStack reset to force a fresh storage read. */
  draftsRevision?: number;
  /** Override only when the host already publishes a different draft event. */
  draftsEventName?: string;
};

const IMPORT_SUFFIX = "（导入）";
const MAX_BOARD_TITLE_LENGTH = 120;
const IMPORT_CHUNK_BYTES = 256 * 1024;
type DraftsLoadState = "loading" | "ready" | "error";
type StorageFailure =
  | { kind: "load"; message: string }
  | { kind: "import"; message: string }
  | { kind: "restore"; message: string; board?: BoardDocument }
  | { kind: "delete"; message: string; board: BoardDocument };

function importedTitle(title: string, existing: readonly BoardDocument[]) {
  const used = new Set(existing.map((board) => board.title));
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? IMPORT_SUFFIX : `（导入 ${index}）`;
    let stem = title.slice(0, MAX_BOARD_TITLE_LENGTH - suffix.length).trimEnd();
    const lastCode = stem.charCodeAt(stem.length - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) stem = stem.slice(0, -1);
    const candidate = `${stem || "导入画板"}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

function boardDate(updatedAt: string) {
  return new Date(updatedAt).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function sameImportedCourt(left: BoardDocument, right: BoardDocument) {
  return JSON.stringify([
    left.version, left.purpose, left.sourceTacticId, left.actors, left.frames, left.drillId, left.authoringMode, left.smartRally,
  ]) === JSON.stringify([
    right.version, right.purpose, right.sourceTacticId, right.actors, right.frames, right.drillId, right.authoringMode, right.smartRally,
  ]);
}

async function readBoundedBackup(file: File): Promise<string | null> {
  // A UTF-8 file can be larger in bytes than the accepted JSON character
  // count. Read that case in chunks so mobile browsers never decode a large
  // file at once merely to discover that it exceeds the import limit.
  if (file.size <= BOARD_IMPORT_MAX_CHARACTERS) return file.text();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let characters = 0;
  for (let offset = 0; offset < file.size; offset += IMPORT_CHUNK_BYTES) {
    const bytes = await file.slice(offset, offset + IMPORT_CHUNK_BYTES).arrayBuffer();
    const chunk = decoder.decode(bytes, { stream: true });
    characters += chunk.length;
    if (characters > BOARD_IMPORT_MAX_CHARACTERS) return null;
    chunks.push(chunk);
  }
  const tail = decoder.decode();
  if (characters + tail.length > BOARD_IMPORT_MAX_CHARACTERS) return null;
  chunks.push(tail);
  return chunks.join("");
}

/**
 * The pushed 草稿与模板 screen. It deliberately lists every valid local
 * document; playable-path filtering belongs only to the animated home hero.
 */
export function BoardLibrary({
  openBoard,
  openAlternative,
  activeBoardId,
  draftsRevision = 0,
  draftsEventName = BOARD_DRAFTS_EVENT,
}: BoardLibraryProps) {
  const [drafts, setDrafts] = useState<BoardDocument[]>([]);
  const [alternatives, setAlternatives] = useState<BoardAlternative[]>([]);
  const [alternativeLoadError, setAlternativeLoadError] = useState("");
  const [loadState, setLoadState] = useState<DraftsLoadState>("loading");
  const [storageFailure, setStorageFailure] = useState<StorageFailure | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<BoardDocument | null>(null);
  const [storageStatus, setStorageStatus] = useState("");
  const [pendingImportMessage, setPendingImportMessage] = useState("");
  const [pendingImportId, setPendingImportId] = useState("");
  const [pendingImportCorrupt, setPendingImportCorrupt] = useState(false);
  const [pendingImportRepairable, setPendingImportRepairable] = useState(false);
  const [pendingDeleteBlocked, setPendingDeleteBlocked] = useState(false);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState("");
  const [pendingCopyMessage, setPendingCopyMessage] = useState("");
  const [copyCanDiscard, setCopyCanDiscard] = useState("");
  const [copyDiscardTargetId, setCopyDiscardTargetId] = useState("");
  const [copyDiscardError, setCopyDiscardError] = useState("");
  const [recoveryExportError, setRecoveryExportError] = useState("");
  const [legacyFollowUps, setLegacyFollowUps] = useState<BoardFollowUp[]>([]);
  const [legacyDiscoveries, setLegacyDiscoveries] = useState<BoardDiscovery[]>([]);
  const [legacyLoadError, setLegacyLoadError] = useState("");
  const [showLegacy, setShowLegacy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const deleteOpenerRef = useRef<HTMLButtonElement | null>(null);
  const draftsHeadingRef = useRef<HTMLHeadingElement>(null);
  const deleteFocusTimerRef = useRef<number | undefined>(undefined);
  const keyboard = useKeyboard();

  useEffect(() => () => window.clearTimeout(deleteFocusTimerRef.current), []);

  const requestDraftDeletion = (board: BoardDocument, opener: HTMLButtonElement) => {
    window.clearTimeout(deleteFocusTimerRef.current);
    deleteOpenerRef.current = opener;
    keyboard.hide();
    // Keep the displayed snapshot: storage can change while confirmation is
    // open, and removeDraft must still reject a changed or deleted board.
    setDeleteConfirmation(board);
  };

  const closeDeleteConfirmation = () => {
    setDeleteConfirmation(null);
    window.clearTimeout(deleteFocusTimerRef.current);
    // BottomSheet's exit animation releases the Radix focus trap. There is
    // no Dialog.Trigger here, so explicitly return focus to this row (or the
    // draft heading if a confirmed deletion removed the row).
    deleteFocusTimerRef.current = window.setTimeout(() => {
      const opener = deleteOpenerRef.current;
      if (opener?.isConnected && !opener.disabled) opener.focus({ preventScroll: true });
      else draftsHeadingRef.current?.focus({ preventScroll: true });
    }, 250);
  };

  const refresh = useCallback(() => {
    const deletionJournal = readBoardDeleteJournal();
    const recovery = recoverPendingBoardDelete();
    const result = readBoards();
    const deletionStillHasBoard = deletionJournal.ok && Boolean(deletionJournal.value
      && (!result.ok || result.value.some(board => board.id === deletionJournal.value?.boardId)));
    const deletionBlocked = !recovery.ok && (!deletionJournal.ok || deletionStillHasBoard);
    setPendingDeleteBlocked(deletionBlocked);
    setPendingDeleteMessage(!deletionBlocked ? "" : deletionJournal.ok
      ? "上次删除的关联记录尚未恢复，暂时不能确认画板是否完整。"
      : deletionJournal.error.includes("异常")
        ? "上次删除记录异常，画板仍在本机，但暂时不能确认关联记录。"
        : "暂时读不到上次删除记录，请稍后重试。");
    const journal = readBoardImportJournal();
    const copy = readBoardCopyJournal();
    const discardableCopyId = copy.ok && copy.value && result.ok
      && !result.value.some(board => board.id === copy.value?.targetId) ? copy.value.targetId : "";
    setCopyCanDiscard(discardableCopyId);
    setCopyDiscardTargetId(current => current === discardableCopyId ? current : "");
    setPendingCopyMessage(copy.ok ? copy.value
      ? "上次另存尚未整理完，暂时不能确认副本是否完整。"
      : ""
      : "上次另存记录异常，暂时不能确认副本是否完整。");
    const repairable = journal.ok ? undefined : readRecoverableBoardImportJournal();
    setPendingImportCorrupt(!journal.ok);
    setPendingImportRepairable(Boolean(repairable?.ok && repairable.value));
    setPendingImportId(journal.ok ? journal.value?.targetId ?? "" : "");
    setPendingImportMessage(journal.ok
      ? journal.value ? "上次导入未完成。重新选择同一份备份继续，不会多建一份。" : ""
      : repairable?.ok && repairable.value
        ? "上次导入记录的名称受损。可重选原备份核对，完成前画板仍会隔离。"
        : "上次导入记录异常。画板仍在本机，但暂时不能确认哪份已完整导入。");
    if (result.ok) {
      setDrafts(result.value);
      const followUps = readAllBoardFollowUps();
      const discoveries = readAllBoardDiscoveries();
      if (followUps.ok && discoveries.ok) {
        setLegacyFollowUps(followUps.value);
        setLegacyDiscoveries(discoveries.value);
        setLegacyLoadError("");
      } else {
        setLegacyFollowUps([]);
        setLegacyDiscoveries([]);
        setLegacyLoadError("以前留下的记录暂时读不到；原资料没有更改。可导出原始资料留存。");
      }
      const alternativeResult = readAllAlternatives();
      if (alternativeResult.ok) { setAlternatives(alternativeResult.value); setAlternativeLoadError(""); }
      else setAlternativeLoadError("暂时读不到另一种打法，请重试检查本机资料");
      setLoadState("ready");
      setStorageFailure((current) => {
        if (!recovery.ok) return current?.kind === "restore" ? current : { kind: "restore", message: recovery.error };
        if (current?.kind === "restore" && current.board && !result.value.some(board => board.id === current.board?.id)) return current;
        return current?.kind === "load" || current?.kind === "restore" ? null : current;
      });
      return;
    }
    setLoadState("error");
    setStorageStatus("");
    // A failed restore can leave the only editable board copy in memory.
    // A later read error must not replace its backup and retry controls.
    setStorageFailure(current => current?.kind === "restore" && current.board
      ? current
      : { kind: "load", message: "暂时读不到此浏览器里的画板，请重试" });
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === BOARD_STORAGE_KEY || event.key === BOARD_ALTERNATIVES_STORAGE_KEY || event.key === BOARD_FOLLOW_UP_STORAGE_KEY || event.key === BOARD_DISCOVERY_STORAGE_KEY || event.key === BOARD_IMPORT_JOURNAL_KEY || event.key === BOARD_DELETE_JOURNAL_KEY || event.key === BOARD_COPY_JOURNAL_KEY) refresh();
    };
    window.addEventListener(draftsEventName, refresh);
    window.addEventListener(BOARD_ALTERNATIVES_EVENT, refresh);
    window.addEventListener(BOARD_COPY_RECOVERY_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(draftsEventName, refresh);
      window.removeEventListener(BOARD_ALTERNATIVES_EVENT, refresh);
      window.removeEventListener(BOARD_COPY_RECOVERY_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [draftsEventName, draftsRevision, refresh]);

  const reportStaleDeletion = (board: BoardDocument, conflict: BoardSaveConflict) => {
    refresh();
    setStorageFailure(null);
    setStorageStatus(conflict === "deleted"
      ? `「${board.title}」已在另一页删除，列表已更新。`
      : `「${board.title}」已在另一页修改，未删除。列表已更新，请确认后再操作。`);
  };

  const removeDraft = (board: BoardDocument) => {
    const previous = recoverPendingBoardDelete();
    if (!previous.ok) {
      setStorageStatus("");
      setStorageFailure({ kind: "restore", message: `上次删除的关联记录尚未恢复：${previous.error}` });
      return;
    }
    const current = checkBoardUnchanged(board);
    if (!current.ok) {
      if (current.conflict) {
        reportStaleDeletion(board, current.conflict);
        return;
      }
      setStorageStatus("");
      setStorageFailure({ kind: "delete", message: `暂时无法核对「${board.title}」，未删除，请重试`, board });
      return;
    }
    const linked = readLearningChoice(board.id);
    const observation = readBoardFollowUp(board.id);
    const discovery = readBoardDiscovery(board.id);
    if (!linked.ok || !observation.ok || !discovery.ok) {
      setStorageStatus("");
      setStorageFailure({ kind: "delete", message: `暂时无法删除「${board.title}」，请重试`, board });
      return;
    }
    const hasLinkedRecords = Boolean(linked.value || observation.value || discovery.value);
    if (hasLinkedRecords) {
      const journal = saveBoardDeleteJournal({ version: 1, boardId: board.id, title: board.title,
        ...(linked.value ? { learning: linked.value } : {}),
        ...(observation.value ? { followUp: observation.value } : {}),
        ...(discovery.value ? { discovery: discovery.value } : {}),
      });
      if (!journal.ok) {
        setStorageStatus("");
        setStorageFailure({ kind: "delete", message: journal.error, board });
        return;
      }
    }
    const reportFailedDelete = (conflict?: BoardSaveConflict, reason?: string) => {
      const restored = hasLinkedRecords ? recoverPendingBoardDelete() : { ok: true as const, value: "none" as const };
      if (!restored.ok) {
        setStorageStatus("");
        setStorageFailure({ kind: "restore", message: `「${board.title}」仍保留，但关联记录未能完整恢复。${restored.error}` });
      } else if (conflict) reportStaleDeletion(board, conflict);
      else {
        setStorageStatus("");
        setStorageFailure({ kind: "delete", message: reason ?? `暂时无法删除「${board.title}」，请重试`, board });
      }
    };
    const reportLinkedDeleteFailure = (message: string) =>
      reportFailedDelete(undefined, message.includes("另一页改变") ? message : undefined);
    if (linked.value) {
      const unlinked = deleteLearningChoiceIfUnchanged(board.id, linked.value);
      if (!unlinked.ok) {
        reportLinkedDeleteFailure(unlinked.error);
        return;
      }
    }
    if (observation.value) {
      const removed = deleteBoardFollowUpIfUnchanged(board.id, observation.value);
      if (!removed.ok) {
        reportLinkedDeleteFailure(removed.error);
        return;
      }
    }
    if (discovery.value) {
      const removed = deleteBoardDiscoveryIfUnchanged(board.id, discovery.value);
      if (!removed.ok) {
        reportLinkedDeleteFailure(removed.error);
        return;
      }
    }
    // Another page may have created a previously absent relationship after
    // our first read. Never remove its source board while that link exists.
    const remainingLearning = readLearningChoice(board.id);
    const remainingFollowUp = readBoardFollowUp(board.id);
    const remainingDiscovery = readBoardDiscovery(board.id);
    if (!remainingLearning.ok || !remainingFollowUp.ok || !remainingDiscovery.ok) {
      reportFailedDelete(undefined, `暂时无法核对「${board.title}」的关联记录，未删除，请重试`);
      return;
    }
    if (remainingLearning.value || remainingFollowUp.value || remainingDiscovery.value) {
      reportFailedDelete(undefined, `「${board.title}」的关联记录已在另一页改变，未删除。请重新确认后再操作。`);
      return;
    }
    const result = deleteBoardIfUnchanged(board);
    if (!result.ok) {
      reportFailedDelete(result.conflict);
      return;
    }
    // A second tab can write a link while the board storage key is being
    // removed, after the last pre-delete read. Check once more before
    // publishing success and put the same board back if a link appeared.
    const postDeleteLearning = readLearningChoice(board.id);
    const postDeleteFollowUp = readBoardFollowUp(board.id);
    const postDeleteDiscovery = readBoardDiscovery(board.id);
    if (!postDeleteLearning.ok || !postDeleteFollowUp.ok || !postDeleteDiscovery.ok
      || postDeleteLearning.value || postDeleteFollowUp.value || postDeleteDiscovery.value) {
      const restoredBoard = saveBoardIfUnchanged(board, null);
      if (!restoredBoard.ok && restoredBoard.conflict !== "created") {
        setStorageStatus("");
        setStorageFailure({ kind: "restore", board, message: `「${board.title}」的关联记录仍在，但画板暂时无法恢复。请勿关闭此页，先下载画板备份，再重试恢复。${restoredBoard.error}` });
        return;
      }
      reportFailedDelete(undefined, !postDeleteLearning.ok || !postDeleteFollowUp.ok || !postDeleteDiscovery.ok
        ? `暂时无法核对「${board.title}」的关联记录，未确认删除，请重试`
        : `「${board.title}」的关联记录已在另一页改变，未删除。请重新确认后再操作。`);
      return;
    }
    if (hasLinkedRecords) {
      const cleared = clearBoardDeleteJournal();
      if (!cleared.ok) {
        setStorageStatus("");
        setStorageFailure({ kind: "restore", message: `已删除「${board.title}」，但删除记录尚未清理，请重试` });
        setDrafts((current) => current.filter((item) => item.id !== board.id));
        window.dispatchEvent(new Event(draftsEventName));
        return;
      }
    }
    setStorageFailure(null);
    setStorageStatus(`已删除「${board.title}」`);
    setDrafts((current) => current.filter((item) => item.id !== board.id));
    window.dispatchEvent(new Event(draftsEventName));
  };

  const failImport = (message: string) => {
    setStorageStatus("");
    setStorageFailure({ kind: "import", message });
  };

  const exportRawRecovery = () => {
    try {
      const keys = [BOARD_STORAGE_KEY, BOARD_LEARNING_STORAGE_KEY, BOARD_FOLLOW_UP_STORAGE_KEY, BOARD_DISCOVERY_STORAGE_KEY, BOARD_ALTERNATIVES_STORAGE_KEY,
        BOARD_IMPORT_JOURNAL_KEY, BOARD_DELETE_JOURNAL_KEY, BOARD_COPY_JOURNAL_KEY];
      const records = Object.fromEntries(keys.map(key => [key, window.localStorage.getItem(key)]));
      const serialized = JSON.stringify({ kind: "rallypath-local-recovery", version: 1,
        exportedAt: new Date().toISOString(), records }, null, 2);
      const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `rallypath-recovery-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setRecoveryExportError("");
      setStorageStatus("已请求浏览器下载。请确认文件已保存；本机资料没有被清除。");
    } catch {
      setStorageStatus("");
      setRecoveryExportError("暂时无法导出原始资料，请勿清除浏览器网站数据，稍后重试。");
    }
  };

  const exportBoardRecovery = (board: BoardDocument) => {
    try {
      const packaged = createBoardBackupJSON(board);
      const serialized = packaged.ok ? packaged.value : JSON.stringify(board);
      const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `rallypath-board-recovery-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setRecoveryExportError("");
      setStorageStatus(packaged.ok
        ? "已请求下载画板备份。请确认文件已保存，再重试恢复。"
        : "已请求下载画板原稿。关联资料可能未包含，请另导出原始资料留存。");
    } catch {
      setStorageStatus("");
      setRecoveryExportError("暂时无法下载画板备份。请勿关闭此页或清除网站数据，稍后重试。");
    }
  };

  const importBoard = async (file: File | undefined) => {
    if (!file) return;
    // UTF-8 can use up to four bytes per character. Reject an obviously
    // oversized file before loading its entire contents into mobile memory.
    if (file.size > BOARD_IMPORT_MAX_CHARACTERS * 4) {
      failImport("备份文件过大，未读取。请确认选的是画板 JSON");
      return;
    }
    setStorageStatus("正在打开备份…");
    setStorageFailure(null);
    try {
      const serialized = await readBoundedBackup(file);
      if (serialized === null) {
        failImport("备份文件过大，未导入。请保留原文件");
        return;
      }
      const parsed = parseBoardBackupJSON(serialized);
      if (!parsed.ok) {
        failImport(parsed.error.includes("过大") || parsed.error.includes("過大")
          ? "备份文件过大，未导入。请保留原文件"
          : "这个备份打不开，请换一个文件重试");
        return;
      }
      const source = parsed.value.board;
      const categorized = source.purpose
        ? source
        : { ...source, purpose: getBoardPurpose(source) };
      const existing = readBoards();
      if (!existing.ok) {
        failImport("暂时读不到现有画板，未导入备份，请重试");
        return;
      }
      const signature = boardBackupSignature(serialized);
      const pending = readBoardImportJournal();
      const recoverable = pending.ok ? undefined : readRecoverableBoardImportJournal();
      if (!pending.ok && (!recoverable?.ok || !recoverable.value)) {
        failImport(pending.error);
        return;
      }
      const recovered = recoverable?.ok ? recoverable.value : undefined;
      const previous = pending.ok ? pending.value : recovered;
      if (previous && previous.signature !== signature) {
        failImport(recovered ? "这不是上次同一份备份，原记录未修改。请选择原备份" : "上次导入还没完成，请重新选择同一份备份；未开始新的导入");
        return;
      }

      const recoveredBoard = recovered ? existing.value.find(board => board.id === recovered.targetId) : undefined;
      const recoveredTitle = recovered ? importedTitle(source.title,
        existing.value.filter(board => board.id !== recovered.targetId)) : "";
      if (recoveredBoard && (recoveredBoard.title !== recoveredTitle || !sameImportedCourt(recoveredBoard, categorized))) {
        failImport("上次未完成的画板已被修改，未覆盖。请保留原备份，暂不继续导入");
        return;
      }
      let marker: BoardImportJournal;
      if (pending.ok && pending.value) marker = pending.value;
      else if (recovered) marker = { version: 1, signature, targetId: recovered.targetId, targetTitle: recoveredTitle };
      else {
        const imported = cloneBoard(categorized, importedTitle(source.title, existing.value));
        marker = { version: 1, signature, targetId: imported.id, targetTitle: imported.title };
      }
      if (!previous) {
        const prepared = saveBoardImportJournal(marker);
        if (!prepared.ok) {
          failImport(prepared.error);
          return;
        }
      }

      let createdBoard: BoardDocument | undefined;
      let createdLearning = false;
      let createdFollowUp = false;
      let createdDiscovery = false;
      let createdAlternative = false;
      const rollback = () => {
        const alternative = readBoardAlternative(marker.targetId);
        const alternativeCleared = !createdAlternative || alternative.ok && alternative.value
          && deleteBoardAlternativeIfUnchanged(marker.targetId, alternative.value).ok;
        const discoveryCleared = !createdDiscovery || deleteBoardDiscovery(marker.targetId).ok;
        const followUpCleared = !createdFollowUp || deleteBoardFollowUp(marker.targetId).ok;
        const learningCleared = !createdLearning || deleteLearningChoice(marker.targetId).ok;
        const boardCleared = !createdBoard || deleteBoardIfUnchanged(createdBoard).ok;
        const journalCleared = alternativeCleared && discoveryCleared && followUpCleared && learningCleared && boardCleared && !previous && clearBoardImportJournal().ok;
        refresh();
        window.dispatchEvent(new Event(draftsEventName));
        failImport(journalCleared
          ? "这个备份还没完整存下来，请重试"
          : "导入未完成，请重新选择同一份备份继续；不会新建另一份");
      };

      let saved = existing.value.find(board => board.id === marker.targetId);
      if (saved && (saved.title !== marker.targetTitle || !sameImportedCourt(saved, categorized))) {
        failImport("上次未完成的画板已被修改，未覆盖。请保留原备份，暂不继续导入");
        return;
      }
      if (!saved) {
        const imported = { ...cloneBoard(categorized, marker.targetTitle), id: marker.targetId };
        const result = saveBoardIfUnchanged(imported, null);
        if (!result.ok) {
          rollback();
          return;
        }
        saved = result.value;
        createdBoard = saved;
      }

      const existingLearning = readLearningChoice(saved.id);
      if (!existingLearning.ok) {
        rollback();
        return;
      }
      if (existingLearning.value) {
        const incoming = parsed.value.learning;
        if (!incoming || JSON.stringify([existingLearning.value.route, existingLearning.value.tacticId, existingLearning.value.skillId])
          !== JSON.stringify([incoming.route, incoming.tacticId, incoming.skillId])) {
          failImport("上次导入的技能选择已变更，未覆盖。请保留原备份，暂不继续导入");
          return;
        }
      } else if (parsed.value.learning) {
        const linked = saveLearningChoice({ ...parsed.value.learning, boardId: saved.id, updatedAt: new Date().toISOString() });
        if (!linked.ok) {
          rollback();
          return;
        }
        createdLearning = true;
      }

      const existingFollowUp = readBoardFollowUp(saved.id);
      if (!existingFollowUp.ok) {
        rollback();
        return;
      }
      if (existingFollowUp.value) {
        const incoming = parsed.value.followUp;
        if (!incoming || JSON.stringify([existingFollowUp.value.frameId, existingFollowUp.value.progress, existingFollowUp.value.skillId,
          existingFollowUp.value.skillLabel, existingFollowUp.value.question, existingFollowUp.value.note, existingFollowUp.value.uncertain])
          !== JSON.stringify([incoming.frameId, incoming.progress, incoming.skillId, incoming.skillLabel, incoming.question, incoming.note, incoming.uncertain])) {
          failImport("上次导入的发现已变更，未覆盖。请保留原备份，暂不继续导入");
          return;
        }
      } else if (parsed.value.followUp) {
        const restored = saveBoardFollowUp({ ...parsed.value.followUp, id: newBoardId("observation"), boardId: saved.id, updatedAt: new Date().toISOString() });
        if (!restored.ok) {
          rollback();
          return;
        }
        createdFollowUp = true;
      }

      const existingDiscovery = readBoardDiscovery(saved.id);
      if (!existingDiscovery.ok) { rollback(); return; }
      if (existingDiscovery.value) {
        const incoming = parsed.value.discovery;
        if (!incoming || JSON.stringify([existingDiscovery.value.frameId, existingDiscovery.value.progress, existingDiscovery.value.note,
          existingDiscovery.value.nextTry, existingDiscovery.value.uncertain])
          !== JSON.stringify([incoming.frameId, incoming.progress, incoming.note, incoming.nextTry, incoming.uncertain])) {
          failImport("上次导入的个人发现已变更，未覆盖。请保留原备份，暂不继续导入");
          return;
        }
      } else if (parsed.value.discovery) {
        const restored = saveBoardDiscovery({ ...parsed.value.discovery, id: newBoardId("discovery"), boardId: saved.id, updatedAt: new Date().toISOString() });
        if (!restored.ok) { rollback(); return; }
        createdDiscovery = true;
      }

      const existingAlternative = readBoardAlternative(saved.id);
      if (!existingAlternative.ok) { rollback(); return; }
      if (existingAlternative.value) {
        const incoming = parsed.value.alternative;
        if (!incoming || JSON.stringify({ ...existingAlternative.value.sourceSnapshot, id: source.id }) !== JSON.stringify(incoming.sourceSnapshot)
          || JSON.stringify({ ...existingAlternative.value.board, id: incoming.id }) !== JSON.stringify(incoming.board)
          || existingAlternative.value.startFrameId !== incoming.startFrameId
          || existingAlternative.value.tacticId !== incoming.tacticId) {
          failImport("上次导入的另一种打法已变更，未覆盖。请保留原备份，暂不继续导入");
          return;
        }
      } else if (parsed.value.alternative) {
        const sourceSnapshot = { ...parsed.value.alternative.sourceSnapshot, id: saved.id };
        const altBoard = { ...parsed.value.alternative.board, id: newBoardId("alternative") };
        const restored = saveBoardAlternativeIfUnchanged({ ...parsed.value.alternative, id: altBoard.id,
          sourceBoardId: saved.id, sourceSnapshot, board: altBoard }, undefined);
        if (!restored.ok) { rollback(); return; }
        createdAlternative = true;
      }

      const cleared = clearBoardImportJournal();
      if (!cleared.ok) {
        refresh();
        window.dispatchEvent(new Event(draftsEventName));
        failImport("画板已存下，但导入续接记录尚未清理。请重新选择同一份备份完成确认");
        return;
      }
      setPendingImportMessage("");
      setPendingImportId("");
      setPendingImportCorrupt(false);
      setPendingImportRepairable(false);
      setStorageFailure(null);
      setStorageStatus("备份已导入为新画板，可以继续修改");
      window.dispatchEvent(new Event(draftsEventName));
      openBoard(saved, true, "备份已导入为新画板，可以继续修改");
    } catch {
      refresh();
      failImport("导入中断，请重新选择同一份备份重试");
    }
  };

  const retryFailure = (opener: HTMLButtonElement) => {
    if (!storageFailure) return;
    if (storageFailure.kind === "load") {
      refresh();
      return;
    }
    if (storageFailure.kind === "restore") {
      if (storageFailure.board) {
        const restored = saveBoardIfUnchanged(storageFailure.board, null);
        if (!restored.ok && restored.conflict !== "created") {
          setStorageFailure({ ...storageFailure, message: `画板仍未恢复，请保留备份后重试。${restored.error}` });
          return;
        }
        setStorageStatus("画板已恢复，请重新确认关联资料");
      }
      refresh();
      return;
    }
    if (storageFailure.kind === "import") {
      importRef.current?.click();
      return;
    }
    requestDraftDeletion(storageFailure.board, opener);
  };

  const retryRecovery = () => {
    const recovered = recoverPendingBoardCopy();
    if (recovered.ok) window.dispatchEvent(new Event(BOARD_COPY_RECOVERY_EVENT));
    refresh();
  };

  const discardUnpublishedCopy = () => {
    const recovered = recoverPendingBoardCopy(undefined,
      { allowUnpublishedCleanup: true, expectedTargetId: copyDiscardTargetId });
    if (recovered.ok) {
      setCopyDiscardError("");
      setCopyDiscardTargetId("");
      window.dispatchEvent(new Event(BOARD_COPY_RECOVERY_EVENT));
    } else setCopyDiscardError(recovered.error);
    refresh();
  };

  const failureAction = storageFailure?.kind === "load"
    ? "重试"
    : storageFailure?.kind === "restore"
      ? "重试恢复"
    : storageFailure?.kind === "import"
      ? "重新选择"
      : "再试一次";
  const visibleDrafts = drafts.filter(board => board.id !== pendingImportId);
  const orphanAlternatives = alternatives.filter(record => record.sourceBoardId !== pendingImportId && !drafts.some(board => board.id === record.sourceBoardId));
  const recoveryBlocked = pendingImportCorrupt || pendingDeleteBlocked || Boolean(pendingCopyMessage);
  const initialLoadFailed = loadState === "error" && visibleDrafts.length === 0;
  const legacyBoardIds = Array.from(new Set([...legacyDiscoveries.map(record => record.boardId), ...legacyFollowUps.map(record => record.boardId)]));
  const legacyRows = legacyBoardIds.map(boardId => {
    const board = drafts.find(item => item.id === boardId);
    const discovery = legacyDiscoveries.find(item => item.boardId === boardId);
    const followUp = legacyFollowUps.find(item => item.boardId === boardId);
    return { boardId, board, discovery, followUp, updatedAt: Math.max(Date.parse(discovery?.updatedAt ?? "") || 0, Date.parse(followUp?.updatedAt ?? "") || 0) };
  }).sort((left, right) => right.updatedAt - left.updatedAt);
  const legacyBeat = (board: BoardDocument | undefined, frameId: string) => {
    const index = board?.frames.findIndex(frame => frame.id === frameId) ?? -1;
    return index >= 0 ? `第 ${index + 1} 拍` : "原拍次已变化";
  };

  return (
    <>
    <MobileScroll className="board-home-scroll board-library-scroll">
      <main className="board-home board-library">
        <section className="board-home-hero board-library-hero">
          <span className="board-kicker"><LayersIcon /> 草稿与模板</span>
          <h2>打开一份画板</h2>
          <p>打开本机草稿，或从发球站位画一条新球路。</p>
          <div className="board-home-primary board-library-primary">
            <button disabled={recoveryBlocked} onClick={() => openBoard({ ...createStarterBoard("我的战术板"), purpose: "tactic" }, false)}>
              <PlusIcon />画一条新球路
            </button>
            <button disabled={recoveryBlocked} onClick={() => importRef.current?.click()}>
              <UploadIcon />导入备份
            </button>
          </div>
          <input
            ref={importRef}
            className="board-hidden-file"
            hidden
            tabIndex={-1}
            aria-hidden="true"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importBoard(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </section>

        {storageFailure && !recoveryBlocked && <div className="board-error-action" role="alert"><span>{storageFailure.message}</span>{storageFailure.kind === "restore" && storageFailure.board && <><button onClick={() => exportBoardRecovery(storageFailure.board!)}>下载画板备份</button><button onClick={exportRawRecovery}>导出原始资料</button></>}<button onClick={event => retryFailure(event.currentTarget)}>{failureAction}</button></div>}
        {recoveryBlocked ? (
          <div className="board-error-action board-library-recovery" role="alert">
            <span>
              {[pendingImportCorrupt ? pendingImportMessage : "", pendingDeleteMessage, pendingCopyMessage].filter(Boolean).join("；")}
              为避免误用未完成画板，暂时不能打开、删除或新建。
              {pendingCopyMessage && "若另一页仍在另存，请先等它完成或关闭，再重试检查。"}
              {pendingImportRepairable && !pendingDeleteBlocked && !pendingCopyMessage
                ? "请重选原备份完成核对；也可先导出原始资料。"
                : "先导出原始资料；"}
              该文件包含本机画板与记录，仅供恢复排查，不能直接导入，请勿公开分享。
              {(storageFailure?.kind === "import" || storageFailure?.kind === "restore")
                && <strong>{storageFailure.message}</strong>}
            </span>
            <div className="board-library-recovery-actions">
              <button onClick={retryRecovery}>重试检查</button>
              {copyCanDiscard && !copyDiscardTargetId
                && <button onClick={() => { setCopyDiscardError(""); setCopyDiscardTargetId(copyCanDiscard); }}>放弃未完成的副本</button>}
              {pendingImportRepairable && !pendingDeleteBlocked && !pendingCopyMessage
                && <button onClick={() => importRef.current?.click()}>选择原备份修复</button>}
              <button onClick={exportRawRecovery}>导出原始资料</button>
            </div>
            {copyDiscardTargetId && copyDiscardTargetId === copyCanDiscard && (
              <div className="board-library-copy-discard" role="group" aria-label="确认放弃未完成的副本">
                <p>请先确认另一页已停止另存。放弃会清理未发布副本的技能选择与练后发现；原画板不会删除。</p>
                <button onClick={() => setCopyDiscardTargetId("")}>取消</button>
                <button onClick={discardUnpublishedCopy}>确认放弃副本</button>
              </div>
            )}
            {copyDiscardError && <p role="alert">{copyDiscardError}</p>}
          </div>
        )
          : !storageFailure && pendingImportMessage && <div className="board-error-action" role="status"><span>{pendingImportMessage}</span><button onClick={() => importRef.current?.click()}>重新选择</button></div>}
        {recoveryExportError && <p className="board-library-status" role="alert">{recoveryExportError}</p>}
        {storageStatus && <p className="board-library-status" role="status" aria-live="polite">{storageStatus}</p>}
        {alternativeLoadError && <p className="board-library-status" role="alert">{alternativeLoadError}</p>}

        <section className="board-home-section board-library-drafts" aria-labelledby="board-library-drafts-title">
          <div className="board-section-heading">
            <div>
              <span>本机草稿</span>
              <h3 id="board-library-drafts-title" ref={draftsHeadingRef} tabIndex={-1}>全部画板</h3>
            </div>
            <small>{loadState === "loading" ? "读取中" : initialLoadFailed ? "未读取" : recoveryBlocked ? `${visibleDrafts.length} 份待确认` : `${visibleDrafts.length} 份`}</small>
          </div>
          {loadState === "loading" && visibleDrafts.length === 0 ? (
            <div className="board-empty">
              <LayersIcon />
              <p>正在读取画板…</p>
            </div>
          ) : initialLoadFailed ? (
            <div className="board-empty">
              <LayersIcon />
              <p>画板还没读出来。重试后再看。</p>
            </div>
          ) : visibleDrafts.length > 0 ? (
            <div className="board-draft-list">
              {visibleDrafts.map((board) => {
                const purpose = getBoardPurpose(board);
                return <article key={board.id}>
                  <button
                    className="board-draft-open"
                    disabled={recoveryBlocked}
                    onClick={() => openBoard(board, true)}
                  >
                    <span className="board-draft-icon"><LayersIcon /></span>
                    <span>
                      <span className="board-draft-title"><strong>{board.title}</strong><em className={`board-purpose-badge is-${purpose}`}>{BOARD_PURPOSE_LABELS[purpose]}</em></span>
                      <small>{board.frames.length} 拍 · {boardDate(board.updatedAt)}</small>
                    </span>
                  </button>
                  <button
                    className="board-draft-delete"
                    aria-label={recoveryBlocked ? `${board.title}待确认，暂时不能删除` : board.id === activeBoardId ? `${board.title}正在打开，暂时不能删除` : `删除${board.title}`}
                    disabled={recoveryBlocked || board.id === activeBoardId}
                    onClick={event => requestDraftDeletion(board, event.currentTarget)}
                  >
                    <TrashIcon />
                  </button>
                </article>;
              })}
            </div>
          ) : (
            <div className="board-empty">
              <FilePlusIcon />
              <p>这里还没有画板。画出第一条球路后，会保存在此浏览器。</p>
              <button disabled={recoveryBlocked} onClick={() => openBoard({ ...createStarterBoard("我的战术板"), purpose: "tactic" }, false)}>画第一拍</button>
            </div>
          )}
        </section>
        {loadState === "ready" && !recoveryBlocked && (legacyRows.length > 0 || legacyLoadError) && <section className="board-home-section board-library-legacy">
          <button className="board-legacy-toggle" aria-expanded={showLegacy} onClick={() => setShowLegacy(value => !value)}>
            <span><strong>以前留下的记录</strong><small>只查看，不会放到球场上</small></span><span>{showLegacy ? "收起旧记录" : "查看旧记录"}</span>
          </button>
          {showLegacy && <div className="board-legacy-content" role="region" aria-label="以前留下的记录">
            {legacyLoadError && <div className="board-legacy-error" role="alert"><p>{legacyLoadError}</p><button onClick={exportRawRecovery}>导出原始资料</button></div>}
            {!legacyLoadError && legacyRows.map(({ boardId, board, discovery, followUp }) => <article key={boardId} className="board-legacy-entry">
              <h4>{board?.title ?? "原画板已不在本机"}</h4>
              {discovery && <div><strong>一分的发现 · {legacyBeat(board, discovery.frameId)}</strong><p>{discovery.note || (discovery.uncertain ? "当时还不确定" : "当时没有留下文字")}</p>{discovery.nextTry && <p>下次想试：{discovery.nextTry}</p>}</div>}
              {followUp && <div><strong>练后发现 · {legacyBeat(board, followUp.frameId)}</strong><small>{followUp.skillLabel}</small><p>{followUp.note || (followUp.uncertain ? "当时还不确定" : "当时没有留下文字")}</p></div>}
            </article>)}
          </div>}
        </section>}
        {orphanAlternatives.length>0&&<section className="board-home-section board-library-drafts" aria-label="原分已不在本机的试法"><div className="board-section-heading"><div><span>另一种打法</span><h3>原分已不在本机</h3></div><small>{orphanAlternatives.length} 份</small></div><div className="board-draft-list">{orphanAlternatives.map(record=><article key={record.id}><button className="board-draft-open" disabled={recoveryBlocked||!openAlternative} onClick={()=>openAlternative?.(record,true)}><span className="board-draft-icon"><LayersIcon/></span><span><span className="board-draft-title"><strong>{record.board.title}</strong></span><small>保留当时起点 · {boardDate(record.updatedAt)}</small></span></button></article>)}</div></section>}
      </main>
    </MobileScroll>
    <BottomSheet
      open={deleteConfirmation !== null}
      onOpenChange={open => { if (!open) closeDeleteConfirmation(); }}
      title="删除画板？"
      description="画板与关联的技能选择、旧记录会从本机删除，无法撤销。"
      snap={.4}
    >
      <div className="board-delete-confirmation">
        <p className="board-delete-confirmation-title">{deleteConfirmation?.title}</p>
        <div className="board-delete-confirmation-actions">
          <button type="button" onClick={closeDeleteConfirmation}>取消</button>
          <button
            type="button"
            className="board-delete-confirmation-confirm"
            disabled={recoveryBlocked || deleteConfirmation?.id === activeBoardId}
            onClick={() => {
              const board = deleteConfirmation;
              if (!board || recoveryBlocked || board.id === activeBoardId) return;
              closeDeleteConfirmation();
              removeDraft(board);
            }}
          >确认删除</button>
        </div>
      </div>
    </BottomSheet>
    </>
  );
}
