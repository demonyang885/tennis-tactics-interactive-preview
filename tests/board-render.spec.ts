import { expect, test } from "@playwright/test";
import { addMark, createStarterBoard, newBoardId, setPath } from "../src/board/model";
import { getBoardGeometry, hitTestBoard } from "../src/board/render";

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

test("small target marks retain a 44 CSS pixel hit area on both axes", () => {
  let board = createStarterBoard();
  const targetId = newBoardId("target");
  board = addMark(board, 0, { id: targetId, kind: "target", position: [.5, .5], size: [.01, .01] });
  const geometry = getBoardGeometry(393, 512);
  const center = geometry.toCanvas([.5, .5]);
  const hit = hitTestBoard([center[0] + 21, center[1] + 21], 393, 512, board.frames[0], board.actors);
  expect(hit).toEqual({ kind: "element", id: targetId });
});
