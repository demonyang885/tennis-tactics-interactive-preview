import { expect, test } from "@playwright/test";

import { createBlankBoard, createStarterBoard, setPath, setSmartRally, updatePath } from "../src/board/model";
import { BOARD_STORAGE_KEY, deleteBoard, readBoards, saveBoard, type BoardStorage } from "../src/board/storage";
import { BOARD_IMPORT_MAX_CHARACTERS } from "../src/board/validate";
import { FIXED_SKILLS } from "../src/learning/model";
import { BOARD_FOLLOW_UP_STORAGE_KEY, readBoardFollowUp, saveBoardFollowUp } from "../src/learning/followUp";
import { BOARD_DISCOVERY_STORAGE_KEY, readBoardDiscovery } from "../src/learning/discovery";
import { BOARD_DELETE_JOURNAL_KEY, recoverPendingBoardDelete, saveBoardDeleteJournal, type BoardDeleteJournal } from "../src/learning/deleteJournal";
import { BOARD_COPY_JOURNAL_KEY, readBoardCopyJournal, recoverPendingBoardCopy, saveBoardCopyJournal } from "../src/learning/copyJournal";
import { BOARD_ALTERNATIVES_STORAGE_KEY, createAlternativeDraft, readBoardAlternative, saveBoardAlternativeIfUnchanged } from "../src/learning/alternative";
import {
  BOARD_LEARNING_STORAGE_KEY,
  createBoardBackupJSON,
  deleteLearningChoice,
  parseBoardBackupJSON,
  readLearningChoice,
  saveLearningChoice,
  saveSkillChoice,
  saveTacticChoice,
} from "../src/learning/storage";

class MemoryStorage implements BoardStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

for (const linked of ["learning", "followUp", "discovery"] as const) {
  test(`delete recovery does not overwrite a newer ${linked} written after its empty read`, () => {
    const storage = new MemoryStorage();
    const board = createStarterBoard("删除恢复并行写入");
    const timestamp = "2026-09-25T09:00:00.000Z";
    const older = linked === "learning"
      ? { version: 1 as const, boardId: board.id, route: "skill" as const, skillId: "recovery" as const, updatedAt: timestamp }
      : linked === "followUp"
        ? { version: 1 as const, id: "old-follow-up", boardId: board.id, frameId: board.frames[0].id, skillId: "recovery" as const, skillLabel: "击球后回位", question: "能不能先回位？", note: "旧发现", uncertain: false, createdAt: timestamp, updatedAt: timestamp }
        : { version: 1 as const, id: "old-discovery", boardId: board.id, frameId: board.frames[0].id, note: "旧发现", nextTry: "再试深球", uncertain: false, createdAt: timestamp, updatedAt: timestamp };
    const newer = linked === "learning"
      ? { ...older, route: "skill" as const, skillId: "next-ball" as const, updatedAt: "2026-09-26T09:00:00.000Z" }
      : { ...older, note: "另一页刚写的新发现", updatedAt: "2026-09-26T09:00:00.000Z" };
    const key = linked === "learning" ? BOARD_LEARNING_STORAGE_KEY
      : linked === "followUp" ? BOARD_FOLLOW_UP_STORAGE_KEY : BOARD_DISCOVERY_STORAGE_KEY;
    expect(saveBoard(board, storage).ok).toBe(true);
    expect(saveBoardDeleteJournal({ version: 1, boardId: board.id, title: board.title, [linked]: older } as BoardDeleteJournal, storage).ok).toBe(true);
    const originalGet = storage.getItem.bind(storage);
    let injected = false;
    storage.getItem = (name) => {
      if (name === key && !injected) {
        injected = true;
        storage.values.set(key, JSON.stringify({ version: 1, records: [newer] }));
        return null;
      }
      return originalGet(name);
    };
    expect(recoverPendingBoardDelete(storage).ok).toBe(false);
    expect(injected).toBe(true);
    expect(storage.getItem(key)).toBe(JSON.stringify({ version: 1, records: [newer] }));
    expect(storage.getItem(BOARD_DELETE_JOURNAL_KEY)).not.toBeNull();
    expect(recoverPendingBoardDelete(storage)).toEqual({ ok: true, value: "restored" });
    const saved = linked === "learning" ? readLearningChoice(board.id, storage)
      : linked === "followUp" ? readBoardFollowUp(board.id, storage) : readBoardDiscovery(board.id, storage);
    expect(saved).toMatchObject({ ok: true, value: newer });
    expect(storage.getItem(BOARD_DELETE_JOURNAL_KEY)).toBeNull();
  });
}

test("keeps a changed alternative separate from the source and inside a restorable v2 backup", () => {
  const storage = new MemoryStorage();
  let source = createStarterBoard("原来的一分");
  const ball = source.actors.find(actor => actor.kind === "ball")!;
  const from = source.frames[0].poses[ball.id];
  source = setSmartRally(setPath(source, 0, { id: "shot-1", kind: "shot", actorId: ball.id, from, to: [.28, .2], control: [.72, .48] }));
  expect(saveBoard(source, storage).ok).toBe(true);
  const originalEnvelope = storage.getItem(BOARD_STORAGE_KEY);
  const draft = createAlternativeDraft(source, source.frames[0].id, "wide-middle");
  expect(draft.ok).toBe(true);
  if (!draft.ok) return;
  expect(saveBoardAlternativeIfUnchanged(draft.value, undefined, storage).ok).toBe(false);
  expect(storage.getItem(BOARD_ALTERNATIVES_STORAGE_KEY)).toBeNull();
  const changed = { ...draft.value, board: updatePath(draft.value.board, 0, "shot-1", { control: undefined }) };
  const saved = saveBoardAlternativeIfUnchanged(changed, undefined, storage);
  expect(saved.ok).toBe(true);
  if (!saved.ok) return;
  expect(storage.getItem(BOARD_STORAGE_KEY)).toBe(originalEnvelope);
  expect(readBoardAlternative(source.id, storage)).toMatchObject({ ok: true, value: { id: saved.value.id, sourceBoardId: source.id } });
  const backup = createBoardBackupJSON(source, storage);
  expect(backup.ok).toBe(true);
  if (backup.ok) expect(parseBoardBackupJSON(backup.value)).toMatchObject({ ok: true, value: { board: { id: source.id }, alternative: { id: saved.value.id, sourceBoardId: source.id } } });
  expect(saveBoardAlternativeIfUnchanged({ ...saved.value, board: draft.value.board }, saved.value, storage).ok).toBe(false);
  expect(storage.getItem(BOARD_ALTERNATIVES_STORAGE_KEY)).not.toBeNull();
  expect(deleteBoard(source.id, storage).ok).toBe(true);
  expect(readBoardAlternative(source.id, storage)).toMatchObject({ ok: true, value: { id: saved.value.id, sourceSnapshot: { id: source.id } } });
});

test("never claims an alternative was saved when its storage write fails", () => {
  const storage = new MemoryStorage();
  let source = createStarterBoard("原分");
  const ball = source.actors.find(actor => actor.kind === "ball")!;
  source = setSmartRally(setPath(source, 0, { id: "shot-1", kind: "shot", actorId: ball.id, from: source.frames[0].poses[ball.id], to: [.3, .22], control: [.7, .48] }));
  const draft = createAlternativeDraft(source, source.frames[0].id, "wide-middle");
  expect(draft.ok).toBe(true);
  if (!draft.ok) return;
  const changed = { ...draft.value, board: updatePath(draft.value.board, 0, "shot-1", { control: undefined }) };
  storage.setItem = (key, value) => {
    if (key === BOARD_ALTERNATIVES_STORAGE_KEY) throw new DOMException("full", "QuotaExceededError");
    storage.values.set(key, value);
  };
  expect(saveBoardAlternativeIfUnchanged(changed, undefined, storage)).toMatchObject({ ok: false, error: expect.stringContaining("尚未保存") });
  expect(storage.getItem(BOARD_ALTERNATIVES_STORAGE_KEY)).toBeNull();
});

test("stores one learning route per board without changing the board document", () => {
  const storage = new MemoryStorage();
  const board = createStarterBoard("这一分");
  const before = JSON.stringify(board);

  const tactic = saveTacticChoice(board.id, "wide-middle", storage);
  expect(tactic.ok).toBe(true);
  expect(readLearningChoice(board.id, storage)).toMatchObject({ ok: true, value: { route: "tactic", tacticId: "wide-middle" } });

  const skill = saveSkillChoice(board.id, FIXED_SKILLS[0].id, storage);
  expect(skill.ok).toBe(true);
  expect(readLearningChoice(board.id, storage)).toMatchObject({ ok: true, value: { route: "skill", skillId: FIXED_SKILLS[0].id } });
  expect(JSON.stringify(board)).toBe(before);
  expect(JSON.parse(storage.values.get(BOARD_LEARNING_STORAGE_KEY)!)).toMatchObject({ version: 1, records: [{ boardId: board.id }] });
});

test("backs up the board and its selected next step while accepting old board-only files", () => {
  const storage = new MemoryStorage();
  const board = createStarterBoard("带下一步的画板");
  expect(saveTacticChoice(board.id, "wide-middle", storage).ok).toBe(true);

  const backup = createBoardBackupJSON(board, storage);
  expect(backup.ok).toBe(true);
  if (!backup.ok) return;
  const restored = parseBoardBackupJSON(backup.value);
  expect(restored).toMatchObject({ ok: true, value: { board: { id: board.id }, learning: { boardId: board.id, tacticId: "wide-middle" } } });

  const legacy = parseBoardBackupJSON(JSON.stringify(board));
  expect(legacy).toMatchObject({ ok: true, value: { board: { id: board.id } } });
});

test("imports a large v0.2 board-only backup that its browser storage could save", () => {
  const storage = new MemoryStorage();
  const base = createBlankBoard("可恢复的旧版大画板");
  const frames = Array.from({ length: 30 }, (_, frameIndex) => ({
    ...base.frames[0],
    id: `frame-${frameIndex}`,
    label: `第 ${frameIndex + 1} 拍`,
    marks: Array.from({ length: 100 }, (_, markIndex) => ({
      id: `mark-${frameIndex}-${markIndex}`,
      kind: "text" as const,
      position: [.5, .5] as [number, number],
      text: "回位".repeat(300),
    })),
  }));
  const board = { ...base, frames };
  expect(saveBoard(board, storage).ok).toBe(true);
  const oldBackup = JSON.stringify(board, null, 2);
  expect(oldBackup.length).toBeGreaterThan(2_000_000);
  expect(parseBoardBackupJSON(oldBackup)).toMatchObject({ ok: true, value: { board: { id: board.id, frames: expect.any(Array) } } });
  const currentBackup = createBoardBackupJSON(board, storage);
  expect(currentBackup.ok).toBe(true);
  if (currentBackup.ok) expect(parseBoardBackupJSON(currentBackup.value).ok).toBe(true);
});

test("bounds both raw and linked backup parsing before JSON decoding", () => {
  const oversized = " ".repeat(BOARD_IMPORT_MAX_CHARACTERS + 1);
  expect(parseBoardBackupJSON(oversized)).toMatchObject({ ok: false, error: expect.stringContaining("过大") });
});

test("never calls an oversized export an editable backup that can be reimported", () => {
  const storage = new MemoryStorage();
  const base = createBlankBoard("备份边界");
  const board = {
    ...base,
    frames: Array.from({ length: 30 }, (_, frameIndex) => ({
      ...base.frames[0],
      id: `frame-${frameIndex}`,
      marks: Array.from({ length: 100 }, (_, markIndex) => ({
        id: `mark-${frameIndex}-${markIndex}`,
        kind: "text" as const,
        position: [.5, .5] as [number, number],
        text: "\u0000".repeat(1_000),
      })),
    })),
  };
  expect(createBoardBackupJSON(board, storage)).toMatchObject({ ok: false, error: expect.stringContaining("过大") });
});

test("removes formatting when that is enough to keep a large backup restorable", () => {
  const storage = new MemoryStorage();
  const base = createBlankBoard("大画板紧凑备份");
  const board = {
    ...base,
    frames: Array.from({ length: 30 }, (_, frameIndex) => ({
      ...base.frames[0],
      id: `frame-${frameIndex}`,
      marks: Array.from({ length: 100 }, (_, markIndex) => ({
        id: `mark-${frameIndex}-${markIndex}`,
        kind: "text" as const,
        position: [.5, .5] as [number, number],
        text: "\u0000".repeat(875),
      })),
    })),
  };
  const pretty = JSON.stringify({ kind: "rallypath-board-backup", version: 1, board }, null, 2);
  expect(pretty.length).toBeGreaterThan(BOARD_IMPORT_MAX_CHARACTERS);
  const backup = createBoardBackupJSON(board, storage);
  expect(backup.ok).toBe(true);
  if (!backup.ok) return;
  expect(backup.value.length).toBeLessThanOrEqual(BOARD_IMPORT_MAX_CHARACTERS);
  expect(parseBoardBackupJSON(backup.value)).toMatchObject({ ok: true, value: { board: { id: board.id } } });
});

test("does not overwrite malformed learning data", () => {
  const storage = new MemoryStorage();
  storage.values.set(BOARD_LEARNING_STORAGE_KEY, "{broken");
  const result = saveSkillChoice("board-1", FIXED_SKILLS[1].id, storage);
  expect(result.ok).toBe(false);
  expect(storage.values.get(BOARD_LEARNING_STORAGE_KEY)).toBe("{broken");
});

test("refuses a 101st learning choice without making the existing 100 unreadable", () => {
  const storage = new MemoryStorage();
  for (let index = 0; index < 100; index += 1) {
    expect(saveSkillChoice(`board-${index}`, "recovery", storage).ok).toBe(true);
  }
  const before = storage.values.get(BOARD_LEARNING_STORAGE_KEY);

  expect(saveSkillChoice("board-100", "next-ball", storage).ok).toBe(false);
  expect(storage.values.get(BOARD_LEARNING_STORAGE_KEY)).toBe(before);
  expect(readLearningChoice("board-0", storage)).toMatchObject({ ok: true, value: { skillId: "recovery" } });
  expect(saveSkillChoice("board-0", "next-ball", storage).ok).toBe(true);
  expect(readLearningChoice("board-0", storage)).toMatchObject({ ok: true, value: { skillId: "next-ball" } });
  expect(deleteLearningChoice("board-1", storage).ok).toBe(true);
  expect(saveSkillChoice("board-100", "next-ball", storage).ok).toBe(true);
  expect(readLearningChoice("board-100", storage)).toMatchObject({ ok: true, value: { skillId: "next-ball" } });
});

test("reads a 101-choice envelope written by an older preview without adding a 102nd", () => {
  const storage = new MemoryStorage();
  const records = Array.from({ length: 101 }, (_, index) => ({
    version: 1 as const,
    boardId: `board-${index}`,
    route: "skill" as const,
    skillId: "recovery" as const,
    updatedAt: "2026-09-25T09:00:00.000Z",
  }));
  const oldValue = JSON.stringify({ version: 1, records });
  storage.values.set(BOARD_LEARNING_STORAGE_KEY, oldValue);

  expect(readLearningChoice("board-100", storage)).toMatchObject({ ok: true, value: { skillId: "recovery" } });
  expect(createBoardBackupJSON({ ...createStarterBoard("旧版的一分"), id: "board-100" }, storage))
    .toMatchObject({ ok: true, value: expect.stringContaining('"boardId": "board-100"') });
  expect(saveSkillChoice("board-101", "next-ball", storage).ok).toBe(false);
  expect(storage.values.get(BOARD_LEARNING_STORAGE_KEY)).toBe(oldValue);
  expect(saveSkillChoice("board-100", "next-ball", storage).ok).toBe(true);
  expect(readLearningChoice("board-100", storage)).toMatchObject({ ok: true, value: { skillId: "next-ball" } });
  expect(deleteLearningChoice("board-0", storage).ok).toBe(true);
  expect(saveSkillChoice("board-101", "next-ball", storage).ok).toBe(false);
  expect(deleteLearningChoice("board-1", storage).ok).toBe(true);
  expect(saveSkillChoice("board-101", "next-ball", storage).ok).toBe(true);

  const unsupported = JSON.stringify({ version: 1, records: [...records, { ...records[0], boardId: "board-101" }] });
  storage.values.set(BOARD_LEARNING_STORAGE_KEY, unsupported);
  expect(readLearningChoice("board-100", storage).ok).toBe(false);
  expect(saveSkillChoice("board-102", "next-ball", storage).ok).toBe(false);
  expect(storage.values.get(BOARD_LEARNING_STORAGE_KEY)).toBe(unsupported);
});

test("preserves a skill snapshot and beat in a backup after the active choice changes", () => {
  const storage = new MemoryStorage();
  const board = createStarterBoard("回来看这一拍");
  const frameId = board.frames[0].id;
  const now = "2026-09-25T09:00:00.000Z";
  expect(saveSkillChoice(board.id, "recovery", storage).ok).toBe(true);
  expect(saveBoardFollowUp({ version: 1, id: "observation-1", boardId: board.id, frameId, progress: .45, skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：击球以后，能不能先回到下一拍的位置？", note: "回得更早", uncertain: false, createdAt: now, updatedAt: now }, storage).ok).toBe(true);
  expect(saveSkillChoice(board.id, "next-ball", storage).ok).toBe(true);
  const observation = readBoardFollowUp(board.id, storage);
  expect(observation).toMatchObject({ ok: true, value: { skillId: "recovery", frameId, note: "回得更早" } });
  const backup = createBoardBackupJSON(board, storage);
  expect(backup.ok).toBe(true);
  if (!backup.ok) return;
  expect(parseBoardBackupJSON(backup.value)).toMatchObject({ ok: true, value: { learning: { skillId: "next-ball" }, followUp: { skillId: "recovery", frameId } } });
  expect(JSON.parse(storage.values.get(BOARD_FOLLOW_UP_STORAGE_KEY)!)).toMatchObject({ records: [{ boardId: board.id }] });
});

test("does not overwrite a damaged practice observation", () => {
  const storage = new MemoryStorage();
  storage.values.set(BOARD_FOLLOW_UP_STORAGE_KEY, "{broken");
  const board = createStarterBoard();
  const now = "2026-09-25T09:00:00.000Z";
  const result = saveBoardFollowUp({ version: 1, id: "observation-1", boardId: board.id, frameId: board.frames[0].id, skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：能不能回位？", note: "", uncertain: true, createdAt: now, updatedAt: now }, storage);
  expect(result.ok).toBe(false);
  expect(storage.values.get(BOARD_FOLLOW_UP_STORAGE_KEY)).toBe("{broken");
});

test("rejects a backup whose selected skill belongs to another board", () => {
  const board = createStarterBoard("我的这一分");
  const serialized = JSON.stringify({
    kind: "rallypath-board-backup",
    version: 1,
    board,
    learning: { version: 1, boardId: "different-board", route: "skill", skillId: "recovery", updatedAt: "2026-09-25T09:00:00.000Z" },
  });
  expect(parseBoardBackupJSON(serialized)).toEqual({ ok: false, error: "备份中的下一步不属于这张画板" });
});

test("keeps v0.3 relationships through the unchanged v0.2 board-store rewrite and a downgrade recovery", () => {
  const storage = new MemoryStorage();
  const board = createStarterBoard("回来看这一分");
  const frameId = board.frames[0].id;
  const now = "2026-09-25T09:00:00.000Z";
  expect(saveBoard(board, storage).ok).toBe(true);
  expect(saveSkillChoice(board.id, "recovery", storage).ok).toBe(true);
  expect(saveBoardFollowUp({ version: 1, id: "observation-1", boardId: board.id, frameId, progress: .45, skillId: "recovery", skillLabel: "击球后回位", question: "这次先看：能不能回位？", note: "回得更早", uncertain: false, createdAt: now, updatedAt: now }, storage).ok).toBe(true);
  const learningBefore = storage.values.get(BOARD_LEARNING_STORAGE_KEY);
  const followUpBefore = storage.values.get(BOARD_FOLLOW_UP_STORAGE_KEY);

  // The published v0.2 board storage and validator are unchanged on this branch.
  const oldBoard = readBoards(storage);
  expect(oldBoard).toMatchObject({ ok: true, value: [{ id: board.id }] });
  if (!oldBoard.ok) return;
  expect(saveBoard({ ...oldBoard.value[0], title: "旧版改过的标题" }, storage).ok).toBe(true);
  expect(storage.values.get(BOARD_LEARNING_STORAGE_KEY)).toBe(learningBefore);
  expect(storage.values.get(BOARD_FOLLOW_UP_STORAGE_KEY)).toBe(followUpBefore);
  expect(JSON.parse(storage.values.get(BOARD_STORAGE_KEY)!)).toMatchObject({ boards: [{ id: board.id, title: "旧版改过的标题" }] });

  expect(deleteBoard(board.id, storage).ok).toBe(true);
  expect(storage.values.has(BOARD_STORAGE_KEY)).toBe(false);
  expect(storage.values.get(BOARD_LEARNING_STORAGE_KEY)).toBe(learningBefore);
  expect(storage.values.get(BOARD_FOLLOW_UP_STORAGE_KEY)).toBe(followUpBefore);
  expect(saveBoard(board, storage).ok).toBe(true);
  expect(readLearningChoice(board.id, storage)).toMatchObject({ ok: true, value: { skillId: "recovery" } });
  expect(readBoardFollowUp(board.id, storage)).toMatchObject({ ok: true, value: { frameId, note: "回得更早" } });
});

test("cleans only an unpublished copy's matching relationship after interruption", () => {
  const storage = new MemoryStorage();
  const source = createStarterBoard("原画板");
  const target = createStarterBoard("副本");
  expect(saveBoard(source, storage).ok).toBe(true);
  const choice = { version: 1 as const, boardId: target.id, route: "skill" as const, skillId: "recovery" as const, updatedAt: "2026-09-26T08:00:00.000Z" };
  expect(saveSkillChoice(source.id, "recovery", storage).ok).toBe(true);
  expect(saveBoardCopyJournal({ version: 1, sourceId: source.id, targetId: target.id, learning: choice }, storage).ok).toBe(true);
  expect(saveLearningChoice(choice, storage).ok).toBe(true);

  expect(recoverPendingBoardCopy(storage).ok).toBe(false);
  expect(readLearningChoice(target.id, storage)).toMatchObject({ ok: true, value: { skillId: "recovery" } });
  expect(storage.values.has(BOARD_COPY_JOURNAL_KEY)).toBe(true);
  expect(recoverPendingBoardCopy(storage, { allowUnpublishedCleanup: true, expectedTargetId: "another-copy" }).ok).toBe(false);
  expect(readLearningChoice(target.id, storage)).toMatchObject({ ok: true, value: { skillId: "recovery" } });
  expect(recoverPendingBoardCopy(storage, { allowUnpublishedCleanup: true })).toEqual({ ok: true, value: "cleaned" });
  expect(readLearningChoice(source.id, storage)).toMatchObject({ ok: true, value: { skillId: "recovery" } });
  expect(readLearningChoice(target.id, storage)).toEqual({ ok: true, value: undefined });
  expect(storage.values.has(BOARD_COPY_JOURNAL_KEY)).toBe(false);
});

test("keeps a published copy and refuses to erase a changed unpublished choice", () => {
  const storage = new MemoryStorage();
  const source = createStarterBoard("原画板");
  const target = createStarterBoard("副本");
  const choice = { version: 1 as const, boardId: target.id, route: "skill" as const, skillId: "recovery" as const, updatedAt: "2026-09-26T08:00:00.000Z" };
  expect(saveBoardCopyJournal({ version: 1, sourceId: source.id, targetId: target.id, learning: choice }, storage).ok).toBe(true);
  expect(saveLearningChoice(choice, storage).ok).toBe(true);
  expect(saveBoard(target, storage).ok).toBe(true);
  expect(recoverPendingBoardCopy(storage)).toEqual({ ok: true, value: "completed" });
  expect(readLearningChoice(target.id, storage)).toMatchObject({ ok: true, value: { skillId: "recovery" } });

  expect(deleteBoard(target.id, storage).ok).toBe(true);
  expect(saveBoardCopyJournal({ version: 1, sourceId: source.id, targetId: target.id, learning: choice }, storage).ok).toBe(true);
  expect(saveSkillChoice(target.id, "next-ball", storage).ok).toBe(true);
  expect(recoverPendingBoardCopy(storage, { allowUnpublishedCleanup: true }).ok).toBe(false);
  expect(readLearningChoice(target.id, storage)).toMatchObject({ ok: true, value: { skillId: "next-ball" } });
  expect(readBoardCopyJournal(storage)).toMatchObject({ ok: true, value: { targetId: target.id } });
});

test("clears a copy marker left before any relationship write but preserves a damaged marker", () => {
  const storage = new MemoryStorage();
  const source = createStarterBoard("原画板");
  const target = createStarterBoard("副本");
  const choice = { version: 1 as const, boardId: target.id, route: "skill" as const, skillId: "recovery" as const, updatedAt: "2026-09-26T08:00:00.000Z" };
  expect(saveBoardCopyJournal({ version: 1, sourceId: source.id, targetId: target.id, learning: choice }, storage).ok).toBe(true);
  expect(recoverPendingBoardCopy(storage).ok).toBe(false);
  expect(recoverPendingBoardCopy(storage, { allowUnpublishedCleanup: true })).toEqual({ ok: true, value: "cleaned" });
  expect(storage.values.has(BOARD_COPY_JOURNAL_KEY)).toBe(false);

  storage.values.set(BOARD_COPY_JOURNAL_KEY, "{broken");
  expect(recoverPendingBoardCopy(storage).ok).toBe(false);
  expect(saveBoardCopyJournal({ version: 1, sourceId: source.id, targetId: target.id, learning: choice }, storage).ok).toBe(false);
  expect(storage.values.get(BOARD_COPY_JOURNAL_KEY)).toBe("{broken");
});
