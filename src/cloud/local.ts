import { newBoardId } from "../board/model";
import { BOARD_STORAGE_KEY, readBoards, type BoardStorage } from "../board/storage";
import type { BoardResult } from "../board/validate";
import { BOARD_ALTERNATIVES_STORAGE_KEY, readAllAlternatives } from "../learning/alternative";
import { BOARD_COPY_JOURNAL_KEY } from "../learning/copyJournal";
import { BOARD_DELETE_JOURNAL_KEY } from "../learning/deleteJournal";
import { BOARD_DISCOVERY_STORAGE_KEY, readAllBoardDiscoveries } from "../learning/discovery";
import { BOARD_FOLLOW_UP_STORAGE_KEY, readAllBoardFollowUps } from "../learning/followUp";
import { BOARD_IMPORT_JOURNAL_KEY } from "../learning/importJournal";
import { BOARD_LEARNING_STORAGE_KEY, createBoardBackupJSON, readLearningChoice } from "../learning/storage";
import { canonicalSnapshot, validateCloudSnapshot, type CloudSnapshot } from "./snapshot";

export const CLOUD_META_KEY = "rallypath:cloud-library-meta:v1";
export const CLOUD_APPLY_JOURNAL_KEY = "rallypath:cloud-library-pending:v1";
export const CLOUD_LIBRARY_EVENT = "rallypath-cloud-library-changed";
const LIBRARY_KEYS = [BOARD_STORAGE_KEY, BOARD_LEARNING_STORAGE_KEY, BOARD_FOLLOW_UP_STORAGE_KEY,
  BOARD_DISCOVERY_STORAGE_KEY, BOARD_ALTERNATIVES_STORAGE_KEY] as const;
const TRANSACTION_KEYS: readonly string[] = [...LIBRARY_KEYS, CLOUD_META_KEY];
const JOURNAL_KEYS = [BOARD_IMPORT_JOURNAL_KEY, BOARD_DELETE_JOURNAL_KEY, BOARD_COPY_JOURNAL_KEY, CLOUD_APPLY_JOURNAL_KEY];

export function pendingLocalRecovery(storage: BoardStorage): BoardResult<boolean> {
  try { return { ok: true, value: JOURNAL_KEYS.some(key => storage.getItem(key) !== null) }; }
  catch { return { ok: false, error: "暂时读不到本机恢复记录；未开始同步" }; }
}

export function localRawBackup(storage: BoardStorage): BoardResult<string> {
  try {
    const raw = Object.fromEntries([...TRANSACTION_KEYS, ...JOURNAL_KEYS].map(key => [key, storage.getItem(key)]));
    return { ok: true, value: JSON.stringify({ kind: "rallypath-local-recovery", version: 1, raw }, null, 2) };
  } catch { return { ok: false, error: "无法读取本机原始备份" }; }
}

/** Validate every envelope, including orphaned records, before allowing an upload. */
export function captureLocalSnapshot(storage: BoardStorage): BoardResult<CloudSnapshot> {
  const boards = readBoards(storage);
  if (!boards.ok) return boards;
  const learning = readLearningChoice("", storage);
  if (!learning.ok) return learning;
  const followUps = readAllBoardFollowUps(storage);
  if (!followUps.ok) return followUps;
  const discoveries = readAllBoardDiscoveries(storage);
  if (!discoveries.ok) return discoveries;
  const alternatives = readAllAlternatives(storage);
  if (!alternatives.ok) return alternatives;
  const ids = new Set(boards.value.map(board => board.id));
  try {
    const learningRaw = storage.getItem(BOARD_LEARNING_STORAGE_KEY);
    const learningRecords: { boardId: string }[] = learningRaw === null ? [] : JSON.parse(learningRaw).records;
    if (learningRecords.some(record => !ids.has(record.boardId))
      || followUps.value.some(record => !ids.has(record.boardId))
      || discoveries.value.some(record => !ids.has(record.boardId))
      || alternatives.value.some(record => !ids.has(record.sourceBoardId))) {
      return { ok: false, error: "本机还有未关联到画板的记录；请先保留原始备份，未覆盖这些资料" };
    }
  } catch { return { ok: false, error: "本机记录无法读取；未覆盖原始资料" }; }
  const backups = [];
  for (const board of boards.value) {
    const backup = createBoardBackupJSON(board, storage);
    if (!backup.ok) return backup;
    backups.push(JSON.parse(backup.value));
  }
  return validateCloudSnapshot({ version: 1, boards: backups });
}

function snapshotEnvelopes(snapshot: CloudSnapshot): BoardResult<Map<string, string | null>> {
  const values = new Map<string, string | null>();
  const write = (key: string, field: string, records: unknown[], max: number) => {
    const serialized = JSON.stringify({ version: 1, [field]: records });
    if (serialized.length > max) throw new Error("这份云端备份超过本机储存容量；请先下载 JSON 备份");
    values.set(key, records.length ? serialized : null);
  };
  try {
    write(BOARD_STORAGE_KEY, "boards", snapshot.boards.map(item => item.board), 4_000_000);
    write(BOARD_LEARNING_STORAGE_KEY, "records", snapshot.boards.flatMap(item => item.learning ? [item.learning] : []), 120_000);
    write(BOARD_FOLLOW_UP_STORAGE_KEY, "records", snapshot.boards.flatMap(item => item.followUp ? [item.followUp] : []), 120_000);
    write(BOARD_DISCOVERY_STORAGE_KEY, "records", snapshot.boards.flatMap(item => item.discovery ? [item.discovery] : []), 120_000);
    write(BOARD_ALTERNATIVES_STORAGE_KEY, "records", snapshot.boards.flatMap(item => item.alternative ? [item.alternative] : []), 4_000_000);
    const staged: BoardStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    };
    const validated = captureLocalSnapshot(staged);
    if (!validated.ok) return validated;
    return { ok: true, value: values };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "云端备份无法整理；未更改本机画板" };
  }
}

type RawChange = { key: string; before: string | null; after: string | null };
type ApplyJournal = { version: 1; changes: RawChange[] };

function writeRaw(storage: BoardStorage, key: string, raw: string | null) {
  if (raw === null) storage.removeItem(key);
  else storage.setItem(key, raw);
}

/** Roll back only exact writes from this transaction; preserve later edits verbatim. */
export function recoverCloudApply(storage: BoardStorage): BoardResult<void> {
  try {
    const raw = storage.getItem(CLOUD_APPLY_JOURNAL_KEY);
    if (raw === null) return { ok: true, value: undefined };
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    const journal = value as ApplyJournal;
    if (journal.version !== 1 || !Array.isArray(journal.changes) || journal.changes.length > TRANSACTION_KEYS.length
      || journal.changes.some(change => typeof change !== "object" || change === null
        || !TRANSACTION_KEYS.includes(change.key)
        || !(change.before === null || typeof change.before === "string")
        || !(change.after === null || typeof change.after === "string"))
      || new Set(journal.changes.map(change => change.key)).size !== journal.changes.length) throw new Error();
    for (const change of journal.changes) {
      const current = storage.getItem(change.key);
      if (current !== change.before && current !== change.after) {
        return { ok: false, error: "中断后本机资料又有改动；请先下载原始备份，未覆盖任何后续修改" };
      }
    }
    for (const change of journal.changes.slice().reverse()) {
      if (storage.getItem(change.key) === change.after) writeRaw(storage, change.key, change.before);
    }
    storage.removeItem(CLOUD_APPLY_JOURNAL_KEY);
    return { ok: true, value: undefined };
  } catch { return { ok: false, error: "上次云端同步的本机写入尚未恢复；原始资料与恢复记录已保留" }; }
}

/** All envelope writes have a durable before-image and a synchronous local guard. */
export function applyLocalSnapshot(storage: BoardStorage, expected: CloudSnapshot, next: CloudSnapshot, metadata: string | null): BoardResult<void> {
  const recovery = pendingLocalRecovery(storage);
  if (!recovery.ok) return recovery;
  if (recovery.value) return { ok: false, error: "本机还有未完成的恢复记录，请先完成恢复" };
  // Bind the before-image to the same immutable data we validate. Reading fresh
  // before-images later could accidentally adopt and overwrite another tab's edit.
  let baseline: Map<string, string | null>;
  try { baseline = new Map(TRANSACTION_KEYS.map(key => [key, storage.getItem(key)])); }
  catch { return { ok: false, error: "暂时无法保留本机同步依据；画板未更改" }; }
  const frozenStorage: BoardStorage = {
    getItem: key => baseline.get(key) ?? null,
    setItem: () => { throw new Error("immutable baseline"); },
    removeItem: () => { throw new Error("immutable baseline"); },
  };
  const current = captureLocalSnapshot(frozenStorage);
  if (!current.ok) return current;
  if (canonicalSnapshot(current.value) !== canonicalSnapshot(expected)) {
    return { ok: false, error: "本机画板已在同步期间改变；请重新同步，未覆盖改动" };
  }
  const envelopes = snapshotEnvelopes(next);
  if (!envelopes.ok) return envelopes;
  envelopes.value.set(CLOUD_META_KEY, metadata);
  try {
    if (TRANSACTION_KEYS.some(key => storage.getItem(key) !== baseline.get(key))) {
      return { ok: false, error: "本机画板已在同步期间改变；请重新同步，未覆盖改动" };
    }
    const stillClear = pendingLocalRecovery(storage);
    if (!stillClear.ok) return stillClear;
    if (stillClear.value) return { ok: false, error: "本机恢复记录已改变；未覆盖任何画板" };
    const changes = Array.from(envelopes.value, ([key, after]) => ({ key, before: baseline.get(key) ?? null, after }))
      .filter(change => change.before !== change.after);
    if (!changes.length) return { ok: true, value: undefined };
    storage.setItem(CLOUD_APPLY_JOURNAL_KEY, JSON.stringify({ version: 1, changes } satisfies ApplyJournal));
    try {
      for (const change of changes) {
        if (storage.getItem(change.key) !== change.before) throw new Error("concurrent local edit");
        writeRaw(storage, change.key, change.after);
      }
      storage.removeItem(CLOUD_APPLY_JOURNAL_KEY);
      return { ok: true, value: undefined };
    } catch {
      const recovered = recoverCloudApply(storage);
      return { ok: false, error: recovered.ok
        ? "本机容量或储存暂时不可用；已保留同步前的画板，请重试"
        : recovered.error };
    }
  } catch { return { ok: false, error: "无法保留同步恢复备份；本机画板未更改" }; }
}

/** Cloud copies keep their frame/actor IDs but get fresh board and linked IDs. */
export function retainBothSnapshots(local: CloudSnapshot, remote: CloudSnapshot, suffix = "云端副本"): BoardResult<CloudSnapshot> {
  const copies = remote.boards.filter(item => !local.boards.some(existing => canonicalSnapshot({ version: 1, boards: [existing] })
    === canonicalSnapshot({ version: 1, boards: [item] }))).map(item => {
    const boardId = newBoardId("cloud-board"), now = new Date().toISOString();
    const board = { ...item.board, id: boardId, title: `${item.board.title.slice(0, 72)} · ${suffix}`, updatedAt: now };
    const alternativeId = item.alternative ? newBoardId("cloud-alternative") : undefined;
    return {
      ...item, board,
      ...(item.learning ? { learning: { ...item.learning, boardId } } : {}),
      ...(item.followUp ? { followUp: { ...item.followUp, id: newBoardId("cloud-follow-up"), boardId } } : {}),
      ...(item.discovery ? { discovery: { ...item.discovery, id: newBoardId("cloud-discovery"), boardId } } : {}),
      ...(item.alternative ? { alternative: { ...item.alternative, id: alternativeId!, sourceBoardId: boardId,
        sourceSnapshot: { ...item.alternative.sourceSnapshot, id: boardId },
        board: { ...item.alternative.board, id: alternativeId! } } } : {}),
    };
  });
  const validated = validateCloudSnapshot({ version: 1, boards: [...local.boards, ...copies] });
  if (!validated.ok) return validated;
  const envelopes = snapshotEnvelopes(validated.value);
  return envelopes.ok ? validated : envelopes;
}
