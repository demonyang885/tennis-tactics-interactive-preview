import type { Moment, Point, Tactic } from "./types";

export type ThumbnailRoute = { from: Point; to: Point; sourceFrameIndex: number };
export type TacticThumbnailPlan = {
  shots: ThumbnailRoute[];
  me: Point;
  opponent: Point;
  meMove?: ThumbnailRoute;
  opponentMove?: ThumbnailRoute;
};

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const copyPoint = (point: Point): Point => [point[0], point[1]];

function routes(frames: Moment[], key: "ball" | "me" | "opponent"): ThumbnailRoute[] {
  return frames.slice(0, -1).map((frame, index) => ({
    from: copyPoint(frame[key]),
    to: copyPoint(frames[index + 1][key]),
    sourceFrameIndex: index,
  })).filter(route => distance(route.from, route.to) > .035);
}

/** Keep only real, visually distinct strokes from the teaching animation. */
export function getTacticThumbnailPlan(tactic: Tactic): TacticThumbnailPlan {
  const ballRoutes = routes(tactic.frames, "ball");
  const ourShots = ballRoutes.filter(route => route.from[1] > .5 && route.to[1] < .5);
  const candidates = ourShots.length ? ourShots : ballRoutes;
  const last = candidates.at(-1);
  const first = candidates[0];
  const shots = last ? first !== last && distance(first.to, last.to) > .24 ? [first, last] : [last] : [];
  const keyMoment = tactic.frames[last?.sourceFrameIndex ?? 0] ?? tactic.frames[0];
  // Movement immediately before contact explains the decision better than an
  // unrelated run at the start of a multi-shot pattern.
  const preceding = (route: ThumbnailRoute) => !last || route.sourceFrameIndex <= last.sourceFrameIndex
    && route.sourceFrameIndex >= Math.max(0, last.sourceFrameIndex - 2);
  const strongest = (key: "me" | "opponent") => routes(tactic.frames, key)
    .filter(route => preceding(route) && distance(route.from, route.to) > .12)
    .sort((a, b) => distance(b.from, b.to) - distance(a.from, a.to))[0];
  const meMove = strongest("me"), opponentMove = strongest("opponent");
  const dominantMove = meMove && opponentMove
    ? distance(meMove.from, meMove.to) >= distance(opponentMove.from, opponentMove.to) ? "me" : "opponent"
    : meMove ? "me" : opponentMove ? "opponent" : null;
  return {
    shots,
    me: copyPoint(keyMoment?.me ?? [.5, .9]),
    opponent: copyPoint(keyMoment?.opponent ?? [.5, .1]),
    ...(dominantMove === "me" ? { meMove } : {}),
    ...(dominantMove === "opponent" ? { opponentMove } : {}),
  };
}

/** A combination thumbnail shows a genuine key stroke from each opening stage. */
export function getCombinationThumbnailPlan(stageTactics: Tactic[]): TacticThumbnailPlan {
  const plans = stageTactics.slice(0, 2).map(getTacticThumbnailPlan);
  const first = plans[0];
  if (!first) return { shots: [], me: [.5, .9], opponent: [.5, .1] };
  const shots = plans.map(plan => plan.shots.at(-1)).filter((route): route is ThumbnailRoute => Boolean(route));
  return { shots, me: first.me, opponent: first.opponent, ...(first.meMove ? { meMove: first.meMove } : {}), ...(first.opponentMove ? { opponentMove: first.opponentMove } : {}) };
}
