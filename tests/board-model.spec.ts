import { expect, test } from "@playwright/test";
import {
  addActor,
  addFrame,
  addMark,
  armBlankRally,
  cloneBoard,
  createBlankBoard,
  createBlankRallyBoard,
  createStarterBoard,
  deleteActor,
  deleteFrame,
  deletePath,
  getBoardDuration,
  getBoardPose,
  getFrameEnd,
  getFramePose,
  moveActor,
  newBoardId,
  prepareBlankRallyBoard,
  prepareSynchronizedRallyBoard,
  setPath,
  setSmartRally,
  synchronizeMoveWithPreviousShot,
  updateFrame,
  updateMark,
  updatePath,
  type BoardDocument,
  type Point,
} from "../src/board/model";
import { BOARD_STORAGE_KEY, deleteBoard, readBoards, saveBoard, type BoardStorage } from "../src/board/storage";
import { parseBoardJSON, validateBoardDocument } from "../src/board/validate";

class MemoryStorage implements BoardStorage {
  values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  failDelete = false;

  getItem(key: string) {
    if (this.failRead) throw new Error("read blocked");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("quota reached");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    if (this.failDelete) throw new Error("delete blocked");
    this.values.delete(key);
  }
}

function playableBoard() {
  let board = createBlankBoard("連續回合");
  board = addActor(board, { id: "me", label: "我方", kind: "player" }, [0.25, 0.82]);
  board = addActor(board, { id: "ball", label: "球", kind: "ball" }, [0.35, 0.7]);
  board = setPath(board, 0, {
    id: "shot-1",
    kind: "shot",
    actorId: "ball",
    // Commands canonicalize an authored route to the actor's actual pose.
    from: [0.2, 0.2],
    to: [0.75, 0.25],
    control: [0.58, 0.42],
  });
  return addFrame(board, 0);
}

function delayedReceiverBoard(version: 1 | 2 = 1) {
  let board = createStarterBoard("延迟跑位草稿");
  const ball = board.actors.find((actor) => actor.kind === "ball")!;
  const receiver = board.actors.find((actor) => actor.label === "对手")!;
  board = updateFrame(board, 0, { duration: 2.4 });
  board = setPath(board, 0, {
    id: "incoming-shot",
    kind: "shot",
    actorId: ball.id,
    from: board.frames[0].poses[ball.id],
    to: [.72, .24],
    control: [.78, .58],
  });
  board = addFrame(board, 0);
  board = updateFrame(board, 1, { duration: .6 });
  board = setPath(board, 1, {
    id: "delayed-receiver-move",
    kind: "move",
    actorId: receiver.id,
    from: board.frames[1].poses[receiver.id],
    to: [.64, .34],
    control: [.44, .20],
  });
  board = setSmartRally(board, {
    version,
    frameId: board.frames[1].id,
    phase: "shot",
    hitterId: receiver.id,
    actorId: ball.id,
  });
  return { board, ball, receiver };
}

test("starter board opens at the right-side serve positions", () => {
  const board = createStarterBoard("即用画板");
  expect(board.title).toBe("即用画板");
  expect(board.actors.filter((actor) => actor.kind === "player")).toHaveLength(2);
  expect(board.actors.filter((actor) => actor.kind === "ball")).toHaveLength(1);
  const me = board.actors.find((actor) => actor.label === "我方")!;
  const opponent = board.actors.find((actor) => actor.label === "对手")!;
  const ball = board.actors.find((actor) => actor.kind === "ball")!;
  const mePoint = board.frames[0].poses[me.id];
  const opponentPoint = board.frames[0].poses[opponent.id];
  const ballPoint = board.frames[0].poses[ball.id];
  expect(mePoint).toEqual([.64, .98]);
  expect(opponentPoint).toEqual([.30, .07]);
  expect(ballPoint).toEqual([.64, .96]);
  expect(Math.hypot(mePoint[0] - ballPoint[0], mePoint[1] - ballPoint[1])).toBeCloseTo(.02);
  expect(validateBoardDocument(board)).toEqual({ ok: true, value: board });
});

test("starter board serializes an explicit smart-rally cursor and legacy boards stay manual", () => {
  const manual = createBlankBoard("手动画板");
  expect(manual.smartRally).toBeUndefined();

  const starter = createStarterBoard("智慧画板");
  const players = starter.actors.filter((actor) => actor.kind === "player");
  const ball = starter.actors.find((actor) => actor.kind === "ball")!;
  const ballPoint = starter.frames[0].poses[ball.id];
  const nearest = [...players].sort((left, right) => {
    const distance = (actor: typeof left) => Math.hypot(starter.frames[0].poses[actor.id][0] - ballPoint[0], starter.frames[0].poses[actor.id][1] - ballPoint[1]);
    return distance(left) - distance(right);
  })[0];
  expect(starter.smartRally).toEqual({
    version: 2,
    frameId: starter.frames[0].id,
    phase: "shot",
    hitterId: nearest.id,
    actorId: ball.id,
  });

  const routed = setPath(starter, 0, {
    id: "opening-shot",
    kind: "shot",
    actorId: ball.id,
    from: starter.frames[0].poses[ball.id],
    to: [.70, .24],
  });
  const nextFrame = addFrame(routed, 0);
  const receiver = players.find((player) => player.id !== nearest.id)!;
  const moving = setSmartRally(nextFrame, {
    version: 2,
    frameId: nextFrame.frames[1].id,
    phase: "move",
    hitterId: receiver.id,
    actorId: receiver.id,
  });
  const parsed = parseBoardJSON(JSON.stringify(moving));
  expect(parsed).toEqual({ ok: true, value: moving });

  const storage = new MemoryStorage();
  const saved = saveBoard(moving, storage);
  const reread = readBoards(storage);
  expect(saved.ok).toBe(true);
  expect(reread.ok).toBe(true);
  if (saved.ok && reread.ok) expect(reread.value[0].smartRally).toEqual(saved.value.smartRally);

  const copy = cloneBoard(moving);
  expect(copy.smartRally).toEqual(moving.smartRally);
  expect(copy.smartRally).not.toBe(moving.smartRally);
  expect(setSmartRally(copy).smartRally).toBeUndefined();
});

test("only provenance-marked blank boards opt into smart continuation at the standard setup", () => {
  const actors = [
    { id: "me", label: "我方", kind: "player" as const, point: [.64, .98] as Point },
    { id: "opponent", label: "对手", kind: "player" as const, point: [.30, .07] as Point },
    { id: "ball", label: "网球", kind: "ball" as const, point: [.64, .96] as Point },
  ];
  const build = (blank: BoardDocument) => actors.reduce(
    (board, actor) => addActor(board, { id: actor.id, label: actor.label, kind: actor.kind }, actor.point),
    blank,
  );

  const legacy = build(createBlankBoard("旧空白草稿"));
  expect(armBlankRally(legacy)).toBe(legacy);
  expect(legacy.smartRally).toBeUndefined();

  const optedIn = build(createBlankRallyBoard("连续空白画板"));
  const armed = armBlankRally(optedIn);
  expect(armed.authoringMode).toBe("blank-rally");
  expect(armed.smartRally).toEqual({
    version: 2,
    frameId: armed.frames[0].id,
    phase: "shot",
    hitterId: "me",
    actorId: "ball",
  });
  expect(parseBoardJSON(JSON.stringify(armed))).toEqual({ ok: true, value: armed });

  const nonstandard = addActor(optedIn, { id: "extra", label: "加练球员", kind: "player" }, [.5, .5]);
  expect(armBlankRally(nonstandard)).toBe(nonstandard);
  expect(nonstandard.smartRally).toBeUndefined();
});

test("prepares only recognizable legacy default blank drafts and repairs a missing shot tail", () => {
  const empty = createBlankBoard("我的空白战术");
  const preparedEmpty = prepareBlankRallyBoard(empty);
  expect(preparedEmpty.authoringMode).toBe("blank-rally");
  expect(preparedEmpty.smartRally).toBeUndefined();
  expect(prepareBlankRallyBoard(preparedEmpty)).toBe(preparedEmpty);

  let setup = createBlankBoard("我的空白战术");
  setup = addActor(setup, { id: "me", label: "我方", kind: "player" }, [.64, .98]);
  setup = addActor(setup, { id: "opponent", label: "对手", kind: "player" }, [.30, .07]);
  setup = addActor(setup, { id: "ball", label: "网球", kind: "ball" }, [.64, .96]);
  const preparedSetup = prepareBlankRallyBoard(setup);
  expect(preparedSetup.authoringMode).toBe("blank-rally");
  expect(preparedSetup.smartRally).toMatchObject({ phase: "shot", hitterId: "me", actorId: "ball" });

  const legacyWithEmptyBeat = addFrame(setup, 0);
  const routed = setPath(legacyWithEmptyBeat, 1, {
    id: "legacy-first-shot",
    kind: "shot",
    actorId: "ball",
    from: [.64, .96],
    to: [.72, .24],
  });
  const repaired = prepareBlankRallyBoard(routed);
  expect(repaired.authoringMode).toBe("blank-rally");
  expect(repaired.frames).toHaveLength(3);
  expect(repaired.frames[0].paths).toEqual([]);
  expect(repaired.frames[1].paths).toEqual(routed.frames[1].paths);
  expect(repaired.frames[2].poses.ball).toEqual([.72, .24]);
  expect(repaired.frames[2].paths).toEqual([]);
  expect(repaired.smartRally).toEqual({
    version: 2,
    frameId: repaired.frames[2].id,
    phase: "move",
    hitterId: "opponent",
    actorId: "opponent",
  });
  expect(prepareBlankRallyBoard(repaired)).toBe(repaired);
  expect(validateBoardDocument(repaired)).toEqual({ ok: true, value: repaired });
  const serialized = parseBoardJSON(JSON.stringify(repaired));
  expect(serialized.ok).toBe(true);
  if (serialized.ok) {
    expect(serialized.value.smartRally).toMatchObject({
      frameId: serialized.value.frames.at(-1)!.id,
      phase: "move",
      hitterId: "opponent",
      actorId: "opponent",
    });
  }
  const storage = new MemoryStorage();
  expect(saveBoard(repaired, storage).ok).toBe(true);
  const reread = readBoards(storage);
  expect(reread.ok).toBe(true);
  if (reread.ok) {
    expect(reread.value[0].smartRally).toMatchObject({
      frameId: reread.value[0].frames.at(-1)!.id,
      phase: "move",
      hitterId: "opponent",
      actorId: "opponent",
    });
  }

  const renamedImport = { ...empty, title: "我的空白战术（导入）" };
  expect(prepareBlankRallyBoard(renamedImport)).toBe(renamedImport);
  const sourceBacked = { ...empty, sourceTacticId: "serve-wide" };
  expect(prepareBlankRallyBoard(sourceBacked)).toBe(sourceBacked);
  const partial = addActor(empty, { id: "solo", label: "我方", kind: "player" }, [.5, .8]);
  expect(prepareBlankRallyBoard(partial)).toBe(partial);
});

test("synchronizes a receiver move with the preceding shot and carries the end pose across the boundary", () => {
  const { board, ball, receiver } = delayedReceiverBoard(1);
  const originalJson = JSON.stringify(board);
  const synchronized = synchronizeMoveWithPreviousShot(board, 1, "delayed-receiver-move");

  expect(synchronized).not.toBe(board);
  expect(JSON.stringify(board)).toBe(originalJson);
  expect(synchronized.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(synchronized.frames[1].paths).toEqual([]);

  const incoming = synchronized.frames[0].paths.find((path) => path.id === "incoming-shot")!;
  const movement = synchronized.frames[0].paths.find((path) => path.id === "delayed-receiver-move")!;
  expect(movement.actorId).toBe(receiver.id);
  expect(movement.from).toEqual(synchronized.frames[0].poses[receiver.id]);
  expect(synchronized.frames[1].poses[receiver.id]).toEqual(movement.to);
  expect(synchronized.frames[1].poses[ball.id]).toEqual(incoming.to);

  // The incoming beat lasts 2.4 seconds. Both curves must therefore be at
  // exactly 50% after 1.2 seconds, regardless of the next beat's .6s length.
  const midpoint = getBoardPose(synchronized, 1.2);
  expect(midpoint).toMatchObject({ frameIndex: 0, progress: .5 });
  expect(midpoint.poses[ball.id][0]).toBeCloseTo(.73, 5);
  expect(midpoint.poses[ball.id][1]).toBeCloseTo(.59, 5);
  expect(midpoint.poses[receiver.id][0]).toBeCloseTo(.455, 5);
  expect(midpoint.poses[receiver.id][1]).toBeCloseTo(.2025, 5);

  const withReturn = setPath(synchronized, 1, {
    id: "return-shot",
    kind: "shot",
    actorId: ball.id,
    from: [0, 0],
    to: [.34, .78],
  });
  expect(withReturn.frames[1].paths[0].from).toEqual(incoming.to);

  const justBefore = getBoardPose(withReturn, 2.4 - 1e-6);
  expect(justBefore.frameIndex).toBe(0);
  expect(justBefore.poses[receiver.id][0]).toBeCloseTo(movement.to[0], 4);
  expect(justBefore.poses[receiver.id][1]).toBeCloseTo(movement.to[1], 4);
  const atBoundary = getBoardPose(withReturn, 2.4);
  expect(atBoundary).toMatchObject({ frameIndex: 1, progress: 0 });
  expect(atBoundary.poses[receiver.id]).toEqual(movement.to);
  expect(atBoundary.poses[ball.id]).toEqual(incoming.to);
  const afterBoundary = getBoardPose(withReturn, 2.7);
  expect(afterBoundary.frameIndex).toBe(1);
  expect(afterBoundary.progress).toBeCloseTo(.5, 10);
  expect(afterBoundary.poses[receiver.id]).toEqual(movement.to);
  expect(afterBoundary.poses[ball.id][0]).toBeCloseTo(.53, 5);
  expect(afterBoundary.poses[ball.id][1]).toBeCloseTo(.51, 5);
  expect(validateBoardDocument(withReturn)).toEqual({ ok: true, value: withReturn });
});

test("conservatively migrates delayed v1 rallies and leaves ambiguous or unmarked boards untouched", () => {
  const { board: legacy, receiver } = delayedReceiverBoard(1);
  const legacyJson = JSON.stringify(legacy);
  expect(parseBoardJSON(legacyJson)).toEqual({ ok: true, value: legacy });

  const migrated = prepareSynchronizedRallyBoard(legacy);
  expect(migrated).not.toBe(legacy);
  expect(JSON.stringify(legacy)).toBe(legacyJson);
  expect(migrated.smartRally?.version).toBe(2);
  expect(migrated.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(migrated.frames[1].paths).toEqual([]);
  expect(migrated.frames[1].poses[receiver.id]).toEqual([.64, .34]);
  expect(validateBoardDocument(migrated)).toEqual({ ok: true, value: migrated });
  expect(prepareSynchronizedRallyBoard(migrated)).toBe(migrated);

  const manual = setSmartRally(legacy);
  expect(prepareSynchronizedRallyBoard(manual)).toBe(manual);
  expect(prepareSynchronizedRallyBoard(migrated)).toBe(migrated);

  const conflicted = setPath(legacy, 0, {
    id: "existing-receiver-route",
    kind: "move",
    actorId: receiver.id,
    from: legacy.frames[0].poses[receiver.id],
    to: [.38, .12],
  });
  const conflictedJson = JSON.stringify(conflicted);
  expect(synchronizeMoveWithPreviousShot(conflicted, 1, "delayed-receiver-move")).toBe(conflicted);
  expect(prepareSynchronizedRallyBoard(conflicted)).toBe(conflicted);
  expect(JSON.stringify(conflicted)).toBe(conflictedJson);
  expect(conflicted.smartRally?.version).toBe(1);
  expect(conflicted.frames[0].paths.find((path) => path.id === "existing-receiver-route")?.to).toEqual([.38, .12]);
  expect(conflicted.frames[1].paths.find((path) => path.id === "delayed-receiver-move")).toBeDefined();
  expect(validateBoardDocument(conflicted)).toEqual({ ok: true, value: conflicted });
});

test("migrates a canonical v1 rally that starts after leading empty setup frames", () => {
  let legacy = createStarterBoard("旧版前置空拍");
  const ball = legacy.actors.find((actor) => actor.kind === "ball")!;
  const receiver = legacy.actors.find((actor) => actor.label === "对手")!;
  legacy = addFrame(legacy, 0);
  legacy = setPath(legacy, 1, {
    id: "late-first-shot",
    kind: "shot",
    actorId: ball.id,
    from: legacy.frames[1].poses[ball.id],
    to: [.70, .24],
  });
  legacy = addFrame(legacy, 1);
  legacy = setPath(legacy, 2, {
    id: "late-receiver-move",
    kind: "move",
    actorId: receiver.id,
    from: legacy.frames[2].poses[receiver.id],
    to: [.62, .32],
  });
  legacy = setSmartRally(legacy, {
    version: 1,
    frameId: legacy.frames[2].id,
    phase: "shot",
    hitterId: receiver.id,
    actorId: ball.id,
  });

  const migrated = prepareSynchronizedRallyBoard(legacy);
  expect(migrated).not.toBe(legacy);
  expect(migrated.smartRally?.version).toBe(2);
  expect(migrated.frames[0].paths).toEqual([]);
  expect(migrated.frames[1].paths.map((path) => path.id).sort()).toEqual([
    "late-first-shot",
    "late-receiver-move",
  ]);
  expect(migrated.frames[2].paths).toEqual([]);
  expect(migrated.frames[2].poses[ball.id]).toEqual([.70, .24]);
  expect(migrated.frames[2].poses[receiver.id]).toEqual([.62, .32]);
  expect(validateBoardDocument(migrated)).toEqual({ ok: true, value: migrated });
});

test("does not migrate v1 rallies with a missing shot or a tail phase mismatch", () => {
  const { board: canonical, ball, receiver } = delayedReceiverBoard(1);

  // Once the first shot appears, every non-tail beat in the old guided shape
  // must contain exactly one shot. An empty gap is not safe to infer through.
  const missingShot = addFrame(canonical, 0);
  expect(missingShot.frames.map((frame) => frame.paths.map((path) => path.kind))).toEqual([
    ["shot"],
    [],
    ["move"],
  ]);
  expect(prepareSynchronizedRallyBoard(missingShot)).toBe(missingShot);
  expect(missingShot.smartRally?.version).toBe(1);

  // A tail that already contains the expected receiver move must be waiting
  // for a shot. A v1 cursor that still says "move" is internally ambiguous.
  const movePhaseWithTailMove = setSmartRally(canonical, {
    version: 1,
    frameId: canonical.frames[1].id,
    phase: "move",
    hitterId: receiver.id,
    actorId: receiver.id,
  });
  expect(prepareSynchronizedRallyBoard(movePhaseWithTailMove)).toBe(movePhaseWithTailMove);
  expect(movePhaseWithTailMove.smartRally?.version).toBe(1);

  // Conversely, a shot cursor without its expected tail move must not be
  // upgraded merely because the preceding frames look like a rally.
  const shotPhaseWithoutTailMove = deletePath(canonical, 1, "delayed-receiver-move");
  expect(shotPhaseWithoutTailMove.smartRally).toMatchObject({
    version: 1,
    phase: "shot",
    actorId: ball.id,
  });
  expect(prepareSynchronizedRallyBoard(shotPhaseWithoutTailMove)).toBe(shotPhaseWithoutTailMove);

  const misplacedCursor = structuredClone(canonical) as BoardDocument;
  misplacedCursor.smartRally!.frameId = misplacedCursor.frames[0].id;
  expect(validateBoardDocument(misplacedCursor).ok).toBe(true);
  expect(prepareSynchronizedRallyBoard(misplacedCursor)).toBe(misplacedCursor);
  expect(validateBoardDocument(missingShot)).toEqual({ ok: true, value: missingShot });
  expect(validateBoardDocument(movePhaseWithTailMove)).toEqual({ ok: true, value: movePhaseWithTailMove });
  expect(validateBoardDocument(shotPhaseWithoutTailMove)).toEqual({ ok: true, value: shotPhaseWithoutTailMove });
});

test("smart-rally metadata rejects broken references and clears when its actor or frame is removed", () => {
  const starter = createStarterBoard();
  const missingFrame = structuredClone(starter) as BoardDocument;
  missingFrame.smartRally!.frameId = "missing-frame";
  expect(validateBoardDocument(missingFrame)).toMatchObject({ ok: false });

  const wrongActor = structuredClone(starter) as BoardDocument;
  wrongActor.smartRally!.actorId = wrongActor.smartRally!.hitterId;
  expect(validateBoardDocument(wrongActor)).toMatchObject({ ok: false });

  const occupiedV2Tail = structuredClone(starter) as BoardDocument;
  occupiedV2Tail.frames[0].paths.push({
    id: "unexpected-tail-shot",
    kind: "shot",
    actorId: occupiedV2Tail.smartRally!.actorId,
    from: occupiedV2Tail.frames[0].poses[occupiedV2Tail.smartRally!.actorId],
    to: [.7, .24],
  });
  expect(validateBoardDocument(occupiedV2Tail)).toMatchObject({ ok: false });

  const moveWithoutIncomingShot = structuredClone(starter) as BoardDocument;
  const receiver = moveWithoutIncomingShot.actors.find((actor) => actor.kind === "player" && actor.id !== moveWithoutIncomingShot.smartRally!.hitterId)!;
  moveWithoutIncomingShot.smartRally = { ...moveWithoutIncomingShot.smartRally!, phase: "move", hitterId: receiver.id, actorId: receiver.id };
  expect(validateBoardDocument(moveWithoutIncomingShot)).toMatchObject({ ok: false });

  const ball = starter.actors.find((actor) => actor.kind === "ball")!;
  let withIncoming = setPath(starter, 0, {
    id: "smart-incoming-shot",
    kind: "shot",
    actorId: ball.id,
    from: starter.frames[0].poses[ball.id],
    to: [.70, .24],
  });
  withIncoming = addFrame(withIncoming, 0);
  withIncoming = setSmartRally(withIncoming, {
    version: 2,
    frameId: withIncoming.frames[1].id,
    phase: "move",
    hitterId: receiver.id,
    actorId: receiver.id,
  });
  const withoutIncoming = deletePath(withIncoming, 0, "smart-incoming-shot");
  expect(withoutIncoming.smartRally).toBeUndefined();
  expect(validateBoardDocument(withoutIncoming).ok).toBe(true);

  const withReceiverMove = setPath(withIncoming, 1, {
    id: "smart-receiver-move",
    kind: "move",
    actorId: receiver.id,
    from: withIncoming.frames[1].poses[receiver.id],
    to: [.62, .32],
  });
  const synchronized = synchronizeMoveWithPreviousShot(withReceiverMove, 1, "smart-receiver-move");
  const waitingForReturn = setSmartRally(synchronized, {
    version: 2,
    frameId: synchronized.frames[1].id,
    phase: "shot",
    hitterId: receiver.id,
    actorId: ball.id,
  });
  const returnWithoutIncoming = deletePath(waitingForReturn, 0, "smart-incoming-shot");
  expect(returnWithoutIncoming.frames[0].paths).toContainEqual(expect.objectContaining({ id: "smart-receiver-move" }));
  expect(returnWithoutIncoming.smartRally).toBeUndefined();
  expect(validateBoardDocument(returnWithoutIncoming).ok).toBe(true);

  const withoutHitter = deleteActor(starter, starter.smartRally!.hitterId);
  expect(withoutHitter.smartRally).toBeUndefined();
  expect(validateBoardDocument(withoutHitter).ok).toBe(true);

  const withSecond = addFrame(starter, 0);
  const onSecond = setSmartRally(withSecond, { ...starter.smartRally!, frameId: withSecond.frames[1].id, actorId: ball.id });
  expect(deleteFrame(onSecond, 1).smartRally).toBeUndefined();
});

test("outgoing paths interpolate and appended frames begin at the prior end", () => {
  const board = playableBoard();
  const first = board.frames[0];

  expect(first.paths[0].from).toEqual(first.poses.ball);
  expect(getFramePose(first, 0).ball).toEqual([0.35, 0.7]);
  expect(getFramePose(first, 1).ball).toEqual([0.75, 0.25]);
  expect(getFrameEnd(first).ball).toEqual([0.75, 0.25]);
  expect(board.frames[1].poses).toEqual(getFrameEnd(first));
  expect(validateBoardDocument(board)).toEqual({ ok: true, value: board });

  const midpoint = getBoardPose(board, first.duration / 2);
  expect(midpoint.frameIndex).toBe(0);
  expect(midpoint.progress).toBeCloseTo(0.5);
  expect(midpoint.poses.ball[0]).toBeGreaterThan(0.35);
  expect(getBoardDuration(board)).toBe(first.duration + board.frames[1].duration);
});

test("edits are immutable and reflow both linked starts and later frames", () => {
  const original = playableBoard();
  const originalJson = JSON.stringify(original);
  const moved = moveActor(original, 1, "ball", [0.68, 0.3]);

  expect(JSON.stringify(original)).toBe(originalJson);
  expect(original.frames[0].paths[0].to).toEqual([0.75, 0.25]);
  expect(moved.frames[0].paths[0].to).toEqual([0.68, 0.3]);
  expect(moved.frames[1].poses.ball).toEqual([0.68, 0.3]);

  const routed = setPath(moved, 1, {
    id: "shot-2",
    kind: "feed",
    actorId: "ball",
    from: [0.68, 0.3],
    to: [0.42, 0.78],
  });
  const withThird = addFrame(routed, 1);
  const adjusted = updatePath(withThird, 1, "shot-2", { to: [0.5, 0.72] });
  expect(adjusted.frames[2].poses.ball).toEqual([0.5, 0.72]);
  expect(validateBoardDocument(adjusted).ok).toBe(true);

  const removed = deletePath(adjusted, 1, "shot-2");
  expect(removed.frames[2].poses.ball).toEqual(removed.frames[1].poses.ball);
  expect(deleteFrame(createBlankBoard(), 0).frames).toHaveLength(1);
});

test("freehand movement translates every absolute point without mutating input", () => {
  const base = createBlankBoard();
  const withMark = addMark(base, 0, {
    id: "stroke-1",
    kind: "freehand",
    position: [0.2, 0.2],
    points: [[0.1, 0.1], [0.3, 0.3]],
  });
  const moved = updateMark(withMark, 0, "stroke-1", { position: [0.4, 0.5] });

  expect(withMark.frames[0].marks[0].points).toEqual([[0.1, 0.1], [0.3, 0.3]]);
  expect(moved.frames[0].marks[0].position).toEqual([0.4, 0.5]);
  const movedPoints = moved.frames[0].marks[0].points;
  expect(movedPoints?.[0][0]).toBeCloseTo(0.3);
  expect(movedPoints?.[0][1]).toBeCloseTo(0.4);
  expect(movedPoints?.[1][0]).toBeCloseTo(0.5);
  expect(movedPoints?.[1][1]).toBeCloseTo(0.6);
});

test("command limits prevent documents that would only fail later during save", () => {
  const longTitle = "战".repeat(120);
  const copy = cloneBoard(createBlankBoard(longTitle));
  expect(copy.title.length).toBeLessThanOrEqual(120);
  expect(copy.title.endsWith("副本")).toBe(true);

  const longFrameLabel = "拍".repeat(160);
  const labelled = updateFrame(createBlankBoard(), 0, { label: longFrameLabel });
  const duplicated = addFrame(labelled, 0, true);
  expect(duplicated.frames[1].label.length).toBeLessThanOrEqual(160);
  expect(duplicated.frames[1].label.endsWith("副本")).toBe(true);
  expect(validateBoardDocument(duplicated).ok).toBe(true);

  expect(() => addMark(createBlankBoard(), 0, {
    id: "empty-text",
    kind: "text",
    position: [0.5, 0.5],
    text: "",
  })).toThrow(/不能留空/);

  let drawing = createBlankBoard();
  const twoThousandPoints = Array.from({ length: 2_000 }, () => [0.5, 0.5] as [number, number]);
  for (let index = 0; index < 6; index += 1) {
    drawing = addMark(drawing, 0, {
      id: `stroke-${index}`,
      kind: "freehand",
      position: [0.5, 0.5],
      points: twoThousandPoints,
    });
  }
  expect(validateBoardDocument(drawing).ok).toBe(true);
  expect(() => addMark(drawing, 0, {
    id: "one-too-many",
    kind: "freehand",
    position: [0.5, 0.5],
    points: [[0.5, 0.5]],
  })).toThrow(/12000/);
});

test("clone and delete actor deeply isolate document-owned data and references", () => {
  const source = playableBoard();
  const copy = cloneBoard(source, "另一份");
  expect(copy.id).not.toBe(source.id);
  expect(copy.title).toBe("另一份");
  expect(copy.frames).toEqual(source.frames);
  expect(copy.frames).not.toBe(source.frames);
  expect(copy.frames[0].poses).not.toBe(source.frames[0].poses);
  expect(copy.frames[0].paths[0]).not.toBe(source.frames[0].paths[0]);

  const withoutBall = deleteActor(source, "ball");
  expect(withoutBall.actors.map((actor) => actor.id)).toEqual(["me"]);
  expect(withoutBall.frames.every((frame) => frame.poses.ball === undefined)).toBe(true);
  expect(withoutBall.frames.every((frame) => frame.paths.every((path) => path.actorId !== "ball"))).toBe(true);
  expect(validateBoardDocument(withoutBall).ok).toBe(true);
  expect(newBoardId("frame")).toMatch(/^frame-/);
});

test("validator rejects broken references, discontinuity, non-finite and excessive data", () => {
  const valid = playableBoard();
  const missingActor = structuredClone(valid) as BoardDocument;
  missingActor.frames[0].paths[0].actorId = "ghost";
  expect(validateBoardDocument(missingActor)).toMatchObject({ ok: false });

  const discontinuous = structuredClone(valid) as BoardDocument;
  discontinuous.frames[1].poses.ball = [0.2, 0.2];
  expect(validateBoardDocument(discontinuous)).toMatchObject({ ok: false });

  const infinite = structuredClone(valid) as BoardDocument;
  infinite.frames[0].poses.me = [Number.POSITIVE_INFINITY, 0.5];
  expect(validateBoardDocument(infinite)).toMatchObject({ ok: false });

  const tooManyFrames = structuredClone(valid) as BoardDocument;
  tooManyFrames.frames = Array.from({ length: 61 }, (_, index) => ({
    ...structuredClone(valid.frames[1]),
    id: `frame-${index}`,
  }));
  expect(validateBoardDocument(tooManyFrames)).toMatchObject({ ok: false });
});

test("JSON parsing is bounded, versioned, validated and strips unknown fields", () => {
  const board = playableBoard();
  const parsed = parseBoardJSON(JSON.stringify({ ...board, injected: "ignored" }));
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect("injected" in parsed.value).toBe(false);

  expect(parseBoardJSON("{broken")).toEqual({ ok: false, error: "JSON 格式損壞，未匯入任何內容" });
  expect(parseBoardJSON(JSON.stringify({ ...board, version: 2 }))).toMatchObject({ ok: false });
  expect(parseBoardJSON(" ".repeat(2_000_001))).toMatchObject({ ok: false });
});

test("storage round-trips validated drafts and only reports success after writes", () => {
  const storage = new MemoryStorage();
  const board = playableBoard();
  const saved = saveBoard(board, storage);
  expect(saved.ok).toBe(true);
  expect(storage.values.has(BOARD_STORAGE_KEY)).toBe(true);

  const read = readBoards(storage);
  expect(read.ok).toBe(true);
  if (saved.ok && read.ok) expect(read.value).toEqual([saved.value]);

  expect(deleteBoard(board.id, storage)).toEqual({ ok: true, value: undefined });
  expect(readBoards(storage)).toEqual({ ok: true, value: [] });

  const failedStorage = new MemoryStorage();
  failedStorage.failWrite = true;
  const failed = saveBoard(board, failedStorage);
  expect(failed).toMatchObject({ ok: false });
  if (!failed.ok) expect(failed.error).toContain("quota reached");
  expect(failedStorage.values.size).toBe(0);
});

test("storage refuses corrupt existing data instead of overwriting it", () => {
  const storage = new MemoryStorage();
  storage.values.set(BOARD_STORAGE_KEY, "not-json");
  const original = storage.values.get(BOARD_STORAGE_KEY);

  expect(readBoards(storage)).toMatchObject({ ok: false });
  expect(saveBoard(createBlankBoard(), storage)).toMatchObject({ ok: false });
  expect(storage.values.get(BOARD_STORAGE_KEY)).toBe(original);
});
