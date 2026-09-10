import { boardFromTactic, boardFromTactics } from "../src/board/adapters";
import { tactics } from "../src/content/library";
import { getBoardDuration, getBoardPose, getFrameEnd } from "../src/board/model";
import { validateBoardDocument } from "../src/board/validate";
import type { Tactic } from "../src/content/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[board-adapters] ${message}`);
}

function pointEquals(a: [number, number] | undefined, b: [number, number]) {
  return Boolean(a && a[0] === b[0] && a[1] === b[1]);
}

const first: Tactic = {
  id: "adapter-first",
  name: "第一套戰術",
  duration: 10,
  frames: [
    { t: 0, ball: [.5, .9], me: [.5, .94], opponent: [.5, .08], caption: "準備開始", loft: 0 },
    { t: .25, ball: [.2, .1], me: [.44, .9], opponent: [.2, .08], caption: "斜線調動", loft: .5 },
    { t: 1, ball: [.65, .86], me: [.65, .9], opponent: [.3, .1], caption: "接上下一拍", loft: 0 },
  ],
};

const second: Tactic = {
  id: "adapter-second",
  name: "第二套戰術",
  duration: 8,
  frames: [
    { t: 0, ball: [.3, .8], me: [.3, .88], opponent: [.7, .12], caption: "第二套準備", loft: 0 },
    { t: .5, ball: [.75, .15], me: [.4, .82], opponent: [.75, .14], caption: "改變方向", loft: .3 },
    { t: 1, ball: [.4, .78], me: [.4, .84], opponent: [.6, .1], caption: "繼續準備", loft: 0 },
  ],
};

const single = boardFromTactic(first);
assert(single.sourceTacticId === first.id, "single board should retain source tactic id");
assert(single.frames.length === first.frames.length, "all source moments should remain editable frames");
assert(single.frames.map((frame) => frame.label).join("|") === first.frames.map((frame) => frame.caption).join("|"), "captions should be preserved");
assert(single.frames[0].duration === 2.5 && single.frames[1].duration === 7.5 && single.frames[2].duration === 0, "source timing should be preserved, including the terminal hold");
assert(pointEquals(getFrameEnd(single.frames[0]).ball, single.frames[1].poses.ball), "ball path should end at the next frame pose");
assert(pointEquals(getFrameEnd(single.frames[0]).me, single.frames[1].poses.me), "player movement should end at the next frame pose");
assert(single.frames[0].paths.filter((path) => path.actorId === "ball" && path.kind === "shot").length === 1, "a moving ball should create one shot path");
assert(single.frames[0].paths.filter((path) => path.actorId === "me" && path.kind === "move").length === 1, "a moving player should create one movement path");

single.frames[0].poses.ball[0] = .99;
assert(first.frames[0].ball[0] === .5, "adapter output must not alias source coordinates");

const combined = boardFromTactics([first, second], "連續戰術");
assert(combined.title === "連續戰術", "requested composition title should be used");
assert(combined.sourceTacticId === undefined, "a composite should not claim one source tactic");
assert(combined.frames.length === first.frames.length + second.frames.length, "composition should preserve every source frame");
assert(combined.frames[first.frames.length - 1].duration === .8, "a changed opening pose should use the explicit bridge duration");
assert(validateBoardDocument(combined).ok, "composite output should pass the board document validator");

for (let index = 0; index < combined.frames.length - 1; index += 1) {
  const end = getFrameEnd(combined.frames[index]);
  const next = combined.frames[index + 1];
  for (const actor of combined.actors) {
    assert(pointEquals(end[actor.id], next.poses[actor.id]), `actor ${actor.id} should remain continuous at frame ${index + 1}`);
  }
}

const blank = boardFromTactics([], "空白練習");
assert(blank.title === "空白練習" && blank.frames.length === 1, "empty composition should safely create a blank board");
assert(validateBoardDocument(blank).ok, "empty composition should produce a valid blank board");

const zeroDuration = boardFromTactic({ ...first, id: "zero-duration", duration: 0 });
assert(getBoardDuration(zeroDuration) === 0, "a zero-duration source should stay finite and preserve its duration");
assert(getBoardPose(zeroDuration, 0).frameIndex === zeroDuration.frames.length - 1, "zero-duration playback should resolve to the terminal pose");

for (const tactic of tactics) {
  const board = boardFromTactic(tactic);
  assert(validateBoardDocument(board).ok, `${tactic.id} should produce a valid board document`);
  assert(board.frames.length === tactic.frames.length, `${tactic.id} should retain all frames`);
  assert(Math.abs(getBoardDuration(board) - tactic.duration) < 1e-9, `${tactic.id} should retain its total duration`);
  assert(new Set(board.frames.map((frame) => frame.id)).size === board.frames.length, `${tactic.id} frame ids should be unique`);
  board.frames.slice(0, -1).forEach((frame, index) => {
    const end = getFrameEnd(frame);
    const next = board.frames[index + 1];
    board.actors.forEach((actor) => {
      assert(pointEquals(end[actor.id], next.poses[actor.id]), `${tactic.id} ${actor.id} should remain continuous at frame ${index + 1}`);
    });
  });
}
