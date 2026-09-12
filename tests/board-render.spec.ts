import { expect, test } from "@playwright/test";
import { addFrame, addMark, createStarterBoard, newBoardId, setPath } from "../src/board/model";
import { getBoardGeometry, hitTestBoard, pointOnBoardPath } from "../src/board/render";

test("selected route handles win hit testing when a handle overlaps its actor", () => {
  let board = createStarterBoard();
  const ball = board.actors.find((actor) => actor.kind === "ball")!;
  const from = board.frames[0].poses[ball.id];
  const pathId = newBoardId("path");
  board = setPath(board, 0, { id: pathId, kind: "shot", actorId: ball.id, from, to: [.7, .24], control: [.42, .45] });
  const geometry = getBoardGeometry(393, 512);
  const hit = hitTestBoard(geometry.toCanvas(from), 393, 512, board.frames[0], board.actors, { kind: "element", id: pathId });
  expect(hit).toEqual({ kind: "handle", id: pathId, handle: "from" });
});

test("preceding-beat routes stay read-only until explicitly selected", () => {
  let board = createStarterBoard();
  const ball = board.actors.find((actor) => actor.kind === "ball")!;
  const from = board.frames[0].poses[ball.id];
  const pathId = newBoardId("path");
  board = setPath(board, 0, { id: pathId, kind: "shot", actorId: ball.id, from, to: [.7, .24], control: [.42, .45] });
  board = addFrame(board, 0);
  const geometry = getBoardGeometry(393, 512);
  const path = board.frames[0].paths[0];
  const midpoint = geometry.toCanvas(pointOnBoardPath(path, .5));

  const hit = hitTestBoard(midpoint, 393, 512, board.frames[1], board.actors, null, {
    contextPaths: board.frames[0].paths,
    contextFrameIndex: 0,
  });

  expect(hit).toBeNull();
});

test("selected preceding-beat handles win hit testing over continuation actors", () => {
  let board = createStarterBoard();
  const ball = board.actors.find((actor) => actor.kind === "ball")!;
  const from = board.frames[0].poses[ball.id];
  const pathId = newBoardId("path");
  board = setPath(board, 0, { id: pathId, kind: "shot", actorId: ball.id, from, to: [.7, .24], control: [.42, .45] });
  board = addFrame(board, 0);
  const geometry = getBoardGeometry(393, 512);
  const selection = { kind: "element", id: pathId, frameIndex: 0 } as const;

  const options = { contextPaths: board.frames[0].paths, contextFrameIndex: 0 };
  const controlHit = hitTestBoard(geometry.toCanvas([.42, .45]), 393, 512, board.frames[1], board.actors, selection, options);
  const overlappingBallHit = hitTestBoard(geometry.toCanvas([.7, .24]), 393, 512, board.frames[1], board.actors, selection, options);

  expect(controlHit).toEqual({ kind: "handle", id: pathId, handle: "control", frameIndex: 0 });
  expect(overlappingBallHit).toEqual({ kind: "handle", id: pathId, handle: "to", frameIndex: 0 });
});

test("a selected straight route exposes an implicit midpoint curve handle", () => {
  let board = createStarterBoard();
  const ball = board.actors.find((actor) => actor.kind === "ball")!;
  const from = board.frames[0].poses[ball.id];
  const to = [.7, .24] as [number, number];
  const pathId = newBoardId("path");
  board = setPath(board, 0, { id: pathId, kind: "shot", actorId: ball.id, from, to });
  board = addFrame(board, 0);
  const geometry = getBoardGeometry(393, 512);
  const midpoint = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2] as [number, number];

  const hit = hitTestBoard(
    geometry.toCanvas(midpoint),
    393,
    512,
    board.frames[1],
    board.actors,
    { kind: "element", id: pathId, frameIndex: 0 },
    { contextPaths: board.frames[0].paths, contextFrameIndex: 0 },
  );

  expect(hit).toEqual({ kind: "handle", id: pathId, handle: "control", frameIndex: 0 });
});

test("small target marks retain a 44 CSS pixel hit area on both axes", () => {
  let board = createStarterBoard();
  const targetId = newBoardId("target");
  board = addMark(board, 0, { id: targetId, kind: "target", position: [.5, .5], size: [.01, .01] });
  const geometry = getBoardGeometry(393, 512);
  const center = geometry.toCanvas([.5, .5]);
  const hit = hitTestBoard([center[0] + 21, center[1] + 21], 393, 512, board.frames[0], board.actors);
  expect(hit).toEqual({ kind: "element", id: targetId });
});
