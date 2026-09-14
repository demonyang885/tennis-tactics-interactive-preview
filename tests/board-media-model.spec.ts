import { expect, test } from "@playwright/test";
import { addFrame, addMark, createStarterBoard, setPath, setSmartRally, updateFrame } from "../src/board/model";
import { prepareBoardForMedia } from "../src/board/media";

test("media playback trims only the generated empty smart-rally tail", () => {
  let board = createStarterBoard("分享测试");
  const ball = board.actors.find((actor) => actor.kind === "ball")!;
  const originalHitter = board.smartRally!.hitterId;
  const path = {
    id: "share-shot",
    kind: "shot" as const,
    actorId: ball.id,
    from: board.frames[0].poses[ball.id],
    to: [.7, .25] as [number, number],
    control: [.48, .52] as [number, number],
  };
  board = setPath(board, 0, path);
  board = addFrame(board, 0);
  const receiver = board.actors.find((actor) => actor.kind === "player" && actor.id !== originalHitter)!;
  board = setSmartRally(board, {
    version: 2,
    frameId: board.frames[1].id,
    phase: "move",
    hitterId: receiver.id,
    actorId: receiver.id,
  });

  const prepared = prepareBoardForMedia(board);

  expect(prepared).not.toBe(board);
  expect(prepared.frames).toHaveLength(1);
  expect(prepared.frames[0].paths).toEqual([path]);
  expect(prepared.smartRally).toBeUndefined();
  expect(board.frames).toHaveLength(2);
  expect(board.smartRally).toBeDefined();

  const zeroDurationSource = updateFrame(board, 0, { duration: 0 });
  const retimedSource = updateFrame(board, 0, { duration: 2 });
  expect(prepareBoardForMedia(zeroDurationSource).frames).toHaveLength(1);
  expect(retimedSource.frames[1].duration).toBe(2);
  expect(prepareBoardForMedia(retimedSource).frames).toHaveLength(1);
});

test("manual empty final frames remain part of exported playback", () => {
  let board = createStarterBoard("手动时间线");
  const ball = board.actors.find((actor) => actor.kind === "ball")!;
  board = setPath(board, 0, {
    id: "manual-shot",
    kind: "shot",
    actorId: ball.id,
    from: board.frames[0].poses[ball.id],
    to: [.7, .25],
  });
  board = addFrame(board, 0);

  expect(prepareBoardForMedia(board)).toBe(board);
  expect(board.frames).toHaveLength(2);
});

test("smart-rally tails with authored marks or timing remain in shared playback", () => {
  let board = createStarterBoard("保留尾拍内容");
  const ball = board.actors.find((actor) => actor.kind === "ball")!;
  const originalHitter = board.smartRally!.hitterId;
  board = setPath(board, 0, {
    id: "authored-tail-shot",
    kind: "shot",
    actorId: ball.id,
    from: board.frames[0].poses[ball.id],
    to: [.7, .25],
  });
  board = addFrame(board, 0);
  const receiver = board.actors.find((actor) => actor.kind === "player" && actor.id !== originalHitter)!;
  board = setSmartRally(board, {
    version: 2,
    frameId: board.frames[1].id,
    phase: "move",
    hitterId: receiver.id,
    actorId: receiver.id,
  });

  const marked = addMark(board, 1, { id: "tail-target", kind: "target", position: [.5, .5] });
  const relabeled = updateFrame(board, 1, { label: "观察接球站位" });
  const retimed = updateFrame(board, 1, { duration: board.frames[1].duration + .5 });

  expect(prepareBoardForMedia(marked)).toBe(marked);
  expect(prepareBoardForMedia(relabeled)).toBe(relabeled);
  expect(prepareBoardForMedia(retimed)).toBe(retimed);
});
