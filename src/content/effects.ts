import type { Moment, Point, Tactic } from "./types";

export type ScoreBouncePhase = "impact" | "bounce" | "scored";

export type ScoreBounceGhost = {
  position: Point;
  lift: number;
  opacity: number;
};

export type ScoreBounceMotion = {
  phase: ScoreBouncePhase;
  rawProgress: number;
  flightProgress: number;
  landing: Point;
  position: Point;
  exit: Point;
  opponent: Point;
  opponentDistance: number;
  reachThreshold: number;
  outsideCourt: boolean;
  lift: number;
  squash: number;
  impactStrength: number;
  ghosts: ScoreBounceGhost[];
};

const COURT_WIDTH_METERS = 10.97;
const COURT_LENGTH_METERS = 23.77;
export const SCORE_BOUNCE_REACH_METERS = 2.5;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const pointLength = ([x, y]: Point) => Math.hypot(x, y);
const pointBetween = (from: Point, to: Point, progress: number): Point => [
  from[0] + (to[0] - from[0]) * progress,
  from[1] + (to[1] - from[1]) * progress,
];
const easedProgress = (progress: number) => progress * progress * (3 - 2 * progress);
const outsideCourt = ([x, y]: Point) => x < 0 || x > 1 || y < 0 || y > 1;
const courtDistanceMeters = (first: Point, second: Point) => Math.hypot(
  (first[0] - second[0]) * COURT_WIDTH_METERS,
  (first[1] - second[1]) * COURT_LENGTH_METERS,
);

function normalizedDirection(direction: Point, fallback: Point): Point {
  const source = pointLength(direction) > .0001 ? direction : fallback;
  const length = pointLength(source);
  return length > .0001 ? [source[0] / length, source[1] / length] : [0, -1];
}

function exitAlongDirection(landing: Point, direction: Point, margin = .04): Point {
  const candidates: number[] = [];
  if (direction[0] > .0001) candidates.push((1 + margin - landing[0]) / direction[0]);
  if (direction[0] < -.0001) candidates.push((-margin - landing[0]) / direction[0]);
  if (direction[1] > .0001) candidates.push((1 + margin - landing[1]) / direction[1]);
  if (direction[1] < -.0001) candidates.push((-margin - landing[1]) / direction[1]);
  const distance = Math.min(...candidates.filter((value) => Number.isFinite(value) && value > 0));
  const safeDistance = Number.isFinite(distance) ? distance : .25;
  return [landing[0] + direction[0] * safeDistance, landing[1] + direction[1] * safeDistance];
}

function scoreMoment(tactic: Tactic): { previous: Moment; landing: Moment; target: Moment } | null {
  if (tactic.excerpt || tactic.frames.length < 3) return null;
  const target = tactic.frames.at(-1)!;
  if (target.ballMotion?.kind !== "score-bounce") return null;
  return {
    previous: tactic.frames.at(-3)!,
    landing: tactic.frames.at(-2)!,
    target,
  };
}

export function getScoreBounceMotion(tactic: Tactic, elapsed: number): ScoreBounceMotion | null {
  const moments = scoreMoment(tactic);
  if (!moments) return null;
  const { previous, landing, target } = moments;
  const fraction = clamp01(elapsed / tactic.duration);
  if (fraction < landing.t) return null;

  const rawProgress = clamp01((fraction - landing.t) / Math.max(.0001, target.t - landing.t));
  const incomingDirection: Point = [landing.ball[0] - previous.ball[0], landing.ball[1] - previous.ball[1]];
  const authoredDirection: Point = target.ballMotion?.direction
    ?? [target.ball[0] - landing.ball[0], target.ball[1] - landing.ball[1]];
  const direction = normalizedDirection(authoredDirection, incomingDirection);
  const exit = exitAlongDirection(landing.ball, direction);

  const flightProgress = clamp01((rawProgress - .14) / .78);
  const position = pointBetween(landing.ball, exit, flightProgress);
  const opponent = pointBetween(landing.opponent, target.opponent, easedProgress(rawProgress));
  const opponentDistance = courtDistanceMeters(position, opponent);
  const hasLeftCourt = outsideCourt(position);
  const isScored = hasLeftCourt && opponentDistance > SCORE_BOUNCE_REACH_METERS;
  const lift = Math.sin(flightProgress * Math.PI);
  const ghosts = [.11, .22, .33].flatMap((lag, index) => {
    const ghostFlight = flightProgress - lag;
    if (ghostFlight <= 0) return [];
    return [{
      position: pointBetween(landing.ball, exit, ghostFlight),
      lift: Math.sin(ghostFlight * Math.PI),
      opacity: .5 - index * .12,
    } satisfies ScoreBounceGhost];
  });

  return {
    phase: rawProgress < .14 ? "impact" : isScored ? "scored" : "bounce",
    rawProgress,
    flightProgress,
    landing: landing.ball,
    position,
    exit,
    opponent,
    opponentDistance,
    reachThreshold: SCORE_BOUNCE_REACH_METERS,
    outsideCourt: hasLeftCourt,
    lift,
    squash: 1 - clamp01(rawProgress / .14),
    impactStrength: 1 - clamp01(rawProgress / .32),
    ghosts,
  };
}
