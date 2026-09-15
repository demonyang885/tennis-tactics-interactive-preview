import type { Tactic } from "../content/types";
import { getDrillForTactic } from "./drills";
import {
  createBlankBoard,
  newBoardId,
  BOARD_MAX_FRAMES,
  type BoardActor,
  type BoardDocument,
  type BoardFrame,
  type BoardPath,
  type Point,
} from "./model";

const COMPOSITION_BRIDGE_DURATION = 0.8;

const BOARD_ACTORS: BoardActor[] = [
  { id: "me", label: "我方", kind: "player", color: "#216caf" },
  { id: "opponent", label: "对手", kind: "player", color: "#c8182b" },
  { id: "ball", label: "球", kind: "ball", color: "#c1ff00" },
];

const point = (value: Point): Point => [value[0], value[1]];
const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

function assertConvertibleTactic(tactic: Tactic) {
  if (!tactic.frames.length) throw new Error(`戰術「${tactic.name || tactic.id}」沒有可轉換的拍次`);
  if (!Number.isFinite(tactic.duration) || tactic.duration < 0) throw new Error(`戰術「${tactic.name || tactic.id}」的播放時間無效`);
  if (tactic.frames[0].t !== 0 || tactic.frames.at(-1)?.t !== 1) {
    throw new Error(`戰術「${tactic.name || tactic.id}」的時間軸必須由 0 到 1`);
  }

  let previousTime = -Infinity;
  tactic.frames.forEach((moment, index) => {
    if (!Number.isFinite(moment.t) || moment.t < 0 || moment.t > 1 || (index > 0 && moment.t <= previousTime)) {
      throw new Error(`戰術「${tactic.name || tactic.id}」第 ${index + 1} 拍的時間無效`);
    }
    previousTime = moment.t;
    ([moment.me, moment.opponent, moment.ball] as Point[]).forEach((position) => {
      if (position.length !== 2 || position.some((value) => !Number.isFinite(value) || value < -.15 || value > 1.15)) {
        throw new Error(`戰術「${tactic.name || tactic.id}」第 ${index + 1} 拍的站位無效`);
      }
    });
  });
}

function actorPath(
  id: string,
  kind: BoardPath["kind"],
  actorId: string,
  from: Point,
  to: Point,
): BoardPath | undefined {
  if (samePoint(from, to)) return undefined;
  return { id, kind, actorId, from: point(from), to: point(to) };
}

function framesFromTactic(tactic: Tactic, tacticIndex: number): BoardFrame[] {
  assertConvertibleTactic(tactic);

  return tactic.frames.map((moment, momentIndex) => {
    const next = tactic.frames[momentIndex + 1];
    const prefix = `t${tacticIndex + 1}-f${momentIndex + 1}`;
    const paths = next
      ? [
          actorPath(`${prefix}-ball`, "shot", "ball", moment.ball, next.ball),
          actorPath(`${prefix}-me`, "move", "me", moment.me, next.me),
          actorPath(`${prefix}-opponent`, "move", "opponent", moment.opponent, next.opponent),
        ].filter((path): path is BoardPath => Boolean(path))
      : [];

    return {
      id: prefix,
      label: moment.caption,
      duration: next ? (next.t - moment.t) * tactic.duration : 0,
      poses: {
        me: point(moment.me),
        opponent: point(moment.opponent),
        ball: point(moment.ball),
      },
      paths,
      marks: [],
    };
  });
}

function bridgeFrames(previous: BoardFrame, next: BoardFrame, boundaryIndex: number): BoardFrame {
  const bridgePaths = BOARD_ACTORS.map((actor) => {
    const from = previous.poses[actor.id];
    const to = next.poses[actor.id];
    if (!from || !to) return undefined;
    return actorPath(
      `bridge-${boundaryIndex}-${actor.id}`,
      actor.kind === "ball" ? "feed" : "move",
      actor.id,
      from,
      to,
    );
  }).filter((path): path is BoardPath => Boolean(path));

  if (!bridgePaths.length) return previous;
  return {
    ...previous,
    duration: COMPOSITION_BRIDGE_DURATION,
    paths: bridgePaths,
  };
}

function composedTitle(tactics: Tactic[], requestedTitle?: string) {
  const title = requestedTitle?.trim();
  return title || tactics.map((tactic) => tactic.name).join(" → ") || "我的戰術";
}

/** Create an editable copy of one validated library tactic. */
export function boardFromTactic(tactic: Tactic): BoardDocument {
  const frames = framesFromTactic(tactic, 0);
  if (frames.length > BOARD_MAX_FRAMES) throw new Error(`戰術畫板最多支援 ${BOARD_MAX_FRAMES} 個拍次`);
  const drill = getDrillForTactic(tactic.id);

  return {
    version: 1,
    id: newBoardId("board"),
    title: tactic.name,
    purpose: "tactic",
    sourceTacticId: tactic.id,
    updatedAt: new Date().toISOString(),
    actors: BOARD_ACTORS.map((actor) => ({ ...actor })),
    frames,
    ...(drill ? { drillId: drill.id } : {}),
  };
}

/**
 * Compose tactics without mutating the source content. A short explicit bridge
 * replaces each preceding terminal hold when the next opening pose differs,
 * keeping every following frame continuous without changing source timings.
 */
export function boardFromTactics(tactics: Tactic[], title?: string): BoardDocument {
  if (!tactics.length) return { ...createBlankBoard(composedTitle(tactics, title)), purpose: "tactic" };

  const frameCount = tactics.reduce((total, tactic) => total + tactic.frames.length, 0);
  if (frameCount > BOARD_MAX_FRAMES) throw new Error(`戰術畫板最多支援 ${BOARD_MAX_FRAMES} 個拍次`);

  const frames: BoardFrame[] = [];
  tactics.forEach((tactic, tacticIndex) => {
    const nextFrames = framesFromTactic(tactic, tacticIndex);
    if (frames.length && nextFrames.length) {
      const previousIndex = frames.length - 1;
      frames[previousIndex] = bridgeFrames(frames[previousIndex], nextFrames[0], tacticIndex);
    }
    frames.push(...nextFrames);
  });

  return {
    version: 1,
    id: newBoardId("board"),
    title: composedTitle(tactics, title),
    purpose: "tactic",
    updatedAt: new Date().toISOString(),
    actors: BOARD_ACTORS.map((actor) => ({ ...actor })),
    frames,
  };
}
