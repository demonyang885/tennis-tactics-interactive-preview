export type Point = [number, number];

export type BoardActor = {
  id: string;
  label: string;
  kind: "player" | "ball";
  color?: string;
};

export type BoardPath = {
  id: string;
  kind: "shot" | "move" | "feed";
  actorId: string;
  from: Point;
  to: Point;
  control?: Point;
};

export type BoardMark = {
  id: string;
  kind: "target" | "cone" | "basket" | "text" | "freehand";
  position: Point;
  size?: Point;
  text?: string;
  points?: Point[];
};

export type BoardFrame = {
  id: string;
  label: string;
  duration: number;
  poses: Record<string, Point>;
  paths: BoardPath[];
  marks: BoardMark[];
};

export type BoardSmartRally = {
  /** Version 2 stores receiver movement in the same beat as the incoming shot. */
  version: 1 | 2;
  frameId: string;
  phase: "shot" | "move";
  hitterId: string;
  actorId: string;
};

export type BoardAuthoringMode = "blank-rally";

export type BoardDocument = {
  version: 1;
  id: string;
  title: string;
  sourceTacticId?: string;
  updatedAt: string;
  actors: BoardActor[];
  frames: BoardFrame[];
  drillId?: string;
  authoringMode?: BoardAuthoringMode;
  smartRally?: BoardSmartRally;
};

export type BoardPlaybackPose = {
  frameIndex: number;
  progress: number;
  poses: Record<string, Point>;
};

export const BOARD_COORDINATE_MIN = -0.15;
export const BOARD_COORDINATE_MAX = 1.15;
export const BOARD_MAX_FRAMES = 60;

const DEFAULT_TITLE = "未命名戰術";
export const BOARD_DEFAULT_FRAME_DURATION = 1.5;
const MAX_ACTORS = 24;
const MAX_MARKS_PER_FRAME = 100;
const MAX_FREEHAND_POINTS = 2_000;
const MAX_TOTAL_FREEHAND_POINTS = 12_000;
const MAX_TEXT_LENGTH = 1_000;
const MAX_LABEL_LENGTH = 160;
const MAX_TITLE_LENGTH = 120;
const MAX_ID_LENGTH = 128;
const FORBIDDEN_IDS = new Set(["__proto__", "prototype", "constructor"]);

const copyPoint = (point: Point): Point => [point[0], point[1]];

function copyPoses(poses: Record<string, Point>): Record<string, Point> {
  return Object.fromEntries(Object.entries(poses).map(([id, point]) => [id, copyPoint(point)]));
}

function copyPath(path: BoardPath): BoardPath {
  return {
    ...path,
    from: copyPoint(path.from),
    to: copyPoint(path.to),
    ...(path.control ? { control: copyPoint(path.control) } : {}),
  };
}

function copyMark(mark: BoardMark): BoardMark {
  return {
    ...mark,
    position: copyPoint(mark.position),
    ...(mark.size ? { size: copyPoint(mark.size) } : {}),
    ...(mark.points ? { points: mark.points.map(copyPoint) } : {}),
  };
}

function copyFrame(frame: BoardFrame): BoardFrame {
  return {
    ...frame,
    poses: copyPoses(frame.poses),
    paths: frame.paths.map(copyPath),
    marks: frame.marks.map(copyMark),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function touch(board: BoardDocument, patch: Partial<BoardDocument>): BoardDocument {
  return { ...board, ...patch, updatedAt: nowIso() };
}

function bounded(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function playbackProgress(progress: number) {
  if (Number.isNaN(progress) || progress === -Infinity) return 0;
  if (progress === Infinity) return 1;
  return bounded(progress, 0, 1);
}

function assertPoint(point: Point, label = "座標"): Point {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
    throw new TypeError(`${label}必須是兩個有限數值`);
  }
  if (point.some((value) => value < BOARD_COORDINATE_MIN || value > BOARD_COORDINATE_MAX)) {
    throw new RangeError(`${label}超出畫板邊界`);
  }
  return copyPoint(point);
}

function assertSize(size: Point, label = "標示大小"): Point {
  if (!Array.isArray(size) || size.length !== 2 || !size.every(Number.isFinite)) {
    throw new TypeError(`${label}必須是兩個有限數值`);
  }
  if (size.some((value) => value <= 0 || value > 1.3)) {
    throw new RangeError(`${label}必須大於 0 且不超出畫板尺寸`);
  }
  return copyPoint(size);
}

function assertIdValue(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}不能留空`);
  if (value !== value.trim() || value.length > MAX_ID_LENGTH || FORBIDDEN_IDS.has(value)) {
    throw new Error(`${label}不合法`);
  }
}

function defaultCopyTitle(title: string) {
  const suffix = " 副本";
  let stem = title.slice(0, MAX_TITLE_LENGTH - suffix.length).trimEnd();
  const lastCode = stem.charCodeAt(stem.length - 1);
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) stem = stem.slice(0, -1);
  return `${stem || DEFAULT_TITLE}${suffix}`.slice(0, MAX_TITLE_LENGTH);
}

function defaultCopyFrameLabel(label: string) {
  const suffix = " 副本";
  let stem = label.slice(0, MAX_LABEL_LENGTH - suffix.length).trimEnd();
  const lastCode = stem.charCodeAt(stem.length - 1);
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) stem = stem.slice(0, -1);
  return `${stem || "拍次"}${suffix}`.slice(0, MAX_LABEL_LENGTH);
}

function renumberDefaultFrameLabels(frames: BoardFrame[]) {
  return frames.map((frame, index) => {
    const match = /^第 \d+ 拍(?: · (.+))?$/.exec(frame.label);
    if (!match) return frame;
    const suffix = match[1] ? ` · ${match[1]}` : "";
    const label = `第 ${index + 1} 拍${suffix}`;
    return label === frame.label ? frame : { ...frame, label };
  });
}

function totalFreehandPoints(board: BoardDocument) {
  return board.frames.reduce((total, frame) => total + frame.marks.reduce(
    (frameTotal, mark) => frameTotal + (mark.kind === "freehand" ? mark.points?.length ?? 0 : 0),
    0,
  ), 0);
}

function assertFrameIndex(board: BoardDocument, frameIndex: number) {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= board.frames.length) {
    throw new RangeError("找不到指定拍次");
  }
}

function assertActor(board: BoardDocument, actorId: string) {
  if (!board.actors.some((actor) => actor.id === actorId)) throw new Error("找不到指定角色");
}

function assertDuration(duration: number) {
  if (!Number.isFinite(duration) || duration < 0 || duration > 120) {
    throw new RangeError("拍次時長必須介於 0 至 120 秒");
  }
}

function assertSmartRally(board: BoardDocument, smartRally: BoardSmartRally) {
  if (smartRally.version !== 1 && smartRally.version !== 2) throw new Error("不支援的智慧回合版本");
  if (smartRally.phase !== "shot" && smartRally.phase !== "move") throw new Error("不支援的智慧回合階段");
  assertIdValue(smartRally.frameId, "智慧回合拍次 ID");
  assertIdValue(smartRally.hitterId, "智慧回合擊球者 ID");
  assertIdValue(smartRally.actorId, "智慧回合操作對象 ID");
  if (!board.frames.some((frame) => frame.id === smartRally.frameId)) throw new Error("智慧回合引用了不存在的拍次");
  const players = board.actors.filter((actor) => actor.kind === "player");
  const balls = board.actors.filter((actor) => actor.kind === "ball");
  if (players.length !== 2 || balls.length !== 1) throw new Error("智慧回合需要兩位球員與一顆網球");
  if (!players.some((actor) => actor.id === smartRally.hitterId)) throw new Error("智慧回合擊球者必須是球員");
  if (smartRally.phase === "shot" && smartRally.actorId !== balls[0].id) throw new Error("球路階段必須操作網球");
  if (smartRally.phase === "move" && smartRally.actorId !== smartRally.hitterId) throw new Error("跑位階段必須操作當前擊球者");
  if (smartRally.version === 2) {
    const frameIndex = board.frames.findIndex((frame) => frame.id === smartRally.frameId);
    const frame = board.frames[frameIndex];
    if (frameIndex !== board.frames.length - 1) throw new Error("同步智慧回合必須指向最後一拍");
    if (frame.paths.length > 0) throw new Error("同步智慧回合的編輯尾拍不能含有路線");
    const hasEarlierPaths = board.frames.slice(0, frameIndex).some((candidate) => candidate.paths.length > 0);
    const previousHasShot = frameIndex > 0 && board.frames[frameIndex - 1].paths.some(
      (path) => path.actorId === balls[0].id && (path.kind === "shot" || path.kind === "feed"),
    );
    if (smartRally.phase === "move" && !previousHasShot) throw new Error("跑位階段前一拍必須有來球路線");
    if (smartRally.phase === "shot" && hasEarlierPaths && !previousHasShot) throw new Error("下一球必須承接前一拍來球");
  }
}

function clearInvalidSmartRally(board: BoardDocument): BoardDocument {
  if (!board.smartRally) return board;
  try {
    assertSmartRally(board, board.smartRally);
    return board;
  } catch {
    const { smartRally: _smartRally, ...manualBoard } = board;
    return manualBoard;
  }
}

function canonicalizePathStarts(frame: BoardFrame): BoardFrame {
  let changed = false;
  const paths = frame.paths.map((path) => {
    const pose = frame.poses[path.actorId];
    if (!pose || (path.from[0] === pose[0] && path.from[1] === pose[1])) return path;
    changed = true;
    return { ...path, from: copyPoint(pose) };
  });
  return changed ? { ...frame, paths } : frame;
}

/**
 * Rebuild every later starting pose from the preceding frame's end. Outgoing
 * path destinations remain authored values; only their linked starts move.
 */
function reflowFrames(frames: BoardFrame[], fromIndex: number): BoardFrame[] {
  if (!frames.length) return frames;
  const nextFrames = frames.slice();
  const start = bounded(Math.trunc(fromIndex), 0, frames.length - 1);
  nextFrames[start] = canonicalizePathStarts(nextFrames[start]);

  for (let index = start + 1; index < nextFrames.length; index += 1) {
    const poses = getFrameEnd(nextFrames[index - 1]);
    nextFrames[index] = canonicalizePathStarts({ ...nextFrames[index], poses });
  }
  return nextFrames;
}

/**
 * Make a frame's start pose authoritative while keeping its link to the prior
 * frame. A preceding action has its destination adjusted; a stationary chain
 * is moved backwards until an action (or the first frame) anchors it.
 */
function setLinkedStartPose(frames: BoardFrame[], frameIndex: number, actorId: string, point: Point) {
  const nextFrames = frames.slice();
  let index = frameIndex;

  while (index >= 0) {
    const frame = nextFrames[index];
    const paths = frame.paths.map((path) => path.actorId === actorId
      ? { ...path, from: copyPoint(point) }
      : path);
    nextFrames[index] = {
      ...frame,
      poses: { ...frame.poses, [actorId]: copyPoint(point) },
      paths,
    };

    if (index === 0) break;
    const previous = nextFrames[index - 1];
    const pathIndex = previous.paths.findIndex((path) => path.actorId === actorId);
    if (pathIndex >= 0) {
      const pathsBefore = previous.paths.slice();
      pathsBefore[pathIndex] = { ...pathsBefore[pathIndex], to: copyPoint(point) };
      nextFrames[index - 1] = { ...previous, paths: pathsBefore };
      break;
    }
    index -= 1;
  }

  return nextFrames;
}

export function newBoardId(prefix = "board") {
  const safePrefix = prefix.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "board";
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${safePrefix}-${randomId}`;
}

export function createBlankBoard(title = DEFAULT_TITLE): BoardDocument {
  const normalizedTitle = title.trim() || DEFAULT_TITLE;
  if (normalizedTitle.length > MAX_TITLE_LENGTH) throw new RangeError(`畫板名稱最多 ${MAX_TITLE_LENGTH} 字`);
  return {
    version: 1,
    id: newBoardId(),
    title: normalizedTitle,
    updatedAt: nowIso(),
    actors: [],
    frames: [{
      id: newBoardId("frame"),
      label: "起始站位",
      duration: BOARD_DEFAULT_FRAME_DURATION,
      poses: {},
      paths: [],
      marks: [],
    }],
  };
}

/**
 * A genuinely empty canvas that may opt into the guided rally once the user
 * has explicitly built the standard two-player, one-ball setup. Keeping this
 * provenance in the document prevents legacy/imported boards from being
 * switched to guided authoring based on their shape alone.
 */
export function createBlankRallyBoard(title = DEFAULT_TITLE): BoardDocument {
  const board = createBlankBoard(title);
  return {
    ...board,
    authoringMode: "blank-rally",
    frames: [{ ...board.frames[0], label: "第 1 拍 · 起始站位" }],
  };
}

export function isBoardContentEmpty(board: BoardDocument) {
  const frame = board.frames[0];
  return board.authoringMode === "blank-rally"
    && board.sourceTacticId === undefined
    && board.drillId === undefined
    && board.smartRally === undefined
    && board.actors.length === 0
    && board.frames.length === 1
    && frame?.label === "第 1 拍 · 起始站位"
    && frame.duration === BOARD_DEFAULT_FRAME_DURATION
    && Object.keys(frame.poses).length === 0
    && frame.paths.length === 0
    && frame.marks.length === 0;
}

/**
 * Clear a board back to the empty state of the same guided editor.
 *
 * The board keeps its identity and title so auto-save updates the current
 * draft. Source-backed metadata is intentionally removed because the cleared
 * canvas no longer represents that tactic or drill. Keeping blank-rally
 * provenance lets a standard two-player, one-ball setup resume the exact same
 * smart authoring flow as the starter board.
 */
export function clearBoardContent(board: BoardDocument): BoardDocument {
  if (isBoardContentEmpty(board)) return board;
  const empty = createBlankRallyBoard(board.title);
  return {
    ...empty,
    id: board.id,
    updatedAt: nowIso(),
  };
}

/** A ready-to-draw board for the primary entry flow. */
export function createStarterBoard(title = "我的战术板"): BoardDocument {
  let board = createBlankRallyBoard(title);
  const me: BoardActor = { id: newBoardId("player"), label: "我方", kind: "player", color: "#3e8ad6" };
  const opponent: BoardActor = { id: newBoardId("player"), label: "对手", kind: "player", color: "#dc4151" };
  const ball: BoardActor = { id: newBoardId("ball"), label: "网球", kind: "ball", color: "#d8ef72" };
  board = addActor(board, me, [.64, .98]);
  board = addActor(board, opponent, [.30, .07]);
  board = addActor(board, ball, [.64, .96]);
  board = updateFrame(board, 0, { label: "第 1 拍 · 起始站位" });
  const ballPoint = board.frames[0].poses[ball.id];
  const hitter = [me, opponent].reduce((nearest, player) => {
    const distance = Math.hypot(board.frames[0].poses[player.id][0] - ballPoint[0], board.frames[0].poses[player.id][1] - ballPoint[1]);
    const nearestDistance = Math.hypot(board.frames[0].poses[nearest.id][0] - ballPoint[0], board.frames[0].poses[nearest.id][1] - ballPoint[1]);
    return distance < nearestDistance ? player : nearest;
  });
  return setSmartRally(board, {
    version: 2,
    frameId: board.frames[0].id,
    phase: "shot",
    hitterId: hitter.id,
    actorId: ball.id,
  });
}

/** Whether the document is already at the canonical ready-to-serve position. */
export function isStarterBoardState(board: BoardDocument) {
  if (
    board.authoringMode !== "blank-rally"
    || board.sourceTacticId !== undefined
    || board.drillId !== undefined
    || board.actors.length !== 3
    || board.frames.length !== 1
  ) return false;

  const me = board.actors.find((actor) => actor.kind === "player" && actor.label === "我方");
  const opponent = board.actors.find((actor) => actor.kind === "player" && actor.label === "对手");
  const ball = board.actors.find((actor) => actor.kind === "ball" && actor.label === "网球");
  const frame = board.frames[0];
  if (!me || !opponent || !ball || !frame || frame.paths.length || frame.marks.length) return false;

  const samePoint = (point: Point | undefined, expected: Point) => !!point
    && Math.abs(point[0] - expected[0]) < 1e-6
    && Math.abs(point[1] - expected[1]) < 1e-6;

  return frame.label === "第 1 拍 · 起始站位"
    && samePoint(frame.poses[me.id], [.64, .98])
    && samePoint(frame.poses[opponent.id], [.30, .07])
    && samePoint(frame.poses[ball.id], [.64, .96])
    && board.smartRally?.version === 2
    && board.smartRally.frameId === frame.id
    && board.smartRally.phase === "shot"
    && board.smartRally.hitterId === me.id
    && board.smartRally.actorId === ball.id;
}

/** Restore the current draft identity to the canonical two-player serve setup. */
export function restoreStarterBoard(board: BoardDocument): BoardDocument {
  if (isStarterBoardState(board)) return board;
  const starter = createStarterBoard(board.title);
  return {
    ...starter,
    id: board.id,
    updatedAt: nowIso(),
  };
}

export function cloneBoard(board: BoardDocument, title?: string): BoardDocument {
  const fallbackTitle = defaultCopyTitle(board.title);
  const normalizedTitle = title?.trim() || fallbackTitle;
  if (normalizedTitle.length > MAX_TITLE_LENGTH) throw new RangeError(`畫板名稱最多 ${MAX_TITLE_LENGTH} 字`);
  return {
    ...board,
    id: newBoardId(),
    title: normalizedTitle,
    updatedAt: nowIso(),
    actors: board.actors.map((actor) => ({ ...actor })),
    frames: board.frames.map(copyFrame),
    ...(board.smartRally ? { smartRally: { ...board.smartRally } } : {}),
  };
}

/** Set or clear the serialized smart-rally cursor after an atomic editor action. */
export function setSmartRally(board: BoardDocument, smartRally?: BoardSmartRally): BoardDocument {
  if (smartRally === undefined) {
    if (!board.smartRally) return board;
    const { smartRally: _smartRally, ...manualBoard } = board;
    return { ...manualBoard, updatedAt: nowIso() };
  }
  assertSmartRally(board, smartRally);
  return touch(board, { smartRally: { ...smartRally } });
}

/** Arm a provenance-marked blank canvas only after it becomes a standard board. */
export function armBlankRally(board: BoardDocument): BoardDocument {
  if (board.authoringMode !== "blank-rally" || board.smartRally) return board;
  const players = board.actors.filter((actor) => actor.kind === "player");
  const balls = board.actors.filter((actor) => actor.kind === "ball");
  if (players.length !== 2 || balls.length !== 1) return board;
  const frame = board.frames.at(-1);
  const ball = balls[0];
  const ballPoint = frame?.poses[ball.id];
  if (!frame || !ballPoint || players.some((player) => !frame.poses[player.id]) || frame.paths.length > 0) return board;
  const frameIndex = board.frames.length - 1;
  const hasEarlierPaths = board.frames.slice(0, frameIndex).some((candidate) => candidate.paths.length > 0);
  const previousHasShot = frameIndex > 0 && board.frames[frameIndex - 1].paths.some(
    (path) => path.actorId === ball.id && (path.kind === "shot" || path.kind === "feed"),
  );
  // Provenance allows guidance, but it must never rewrite an authored manual
  // timeline. Only arm when the same v2 cursor invariants already hold.
  if (hasEarlierPaths && !previousHasShot) return board;
  const hitter = players.reduce((nearest, player) => {
    const distance = Math.hypot(frame.poses[player.id][0] - ballPoint[0], frame.poses[player.id][1] - ballPoint[1]);
    const nearestDistance = Math.hypot(frame.poses[nearest.id][0] - ballPoint[0], frame.poses[nearest.id][1] - ballPoint[1]);
    return distance < nearestDistance ? player : nearest;
  });
  return setSmartRally(board, {
    version: 2,
    frameId: frame.id,
    phase: "shot",
    hitterId: hitter.id,
    actorId: ball.id,
  });
}

function normalizeLegacyEmptyBlankRally(board: BoardDocument): BoardDocument {
  const frame = board.frames[0];
  const isLegacyEmpty = board.frames.length === 1
    && board.actors.length === 0
    && frame?.label === "起始站位"
    && frame.duration === BOARD_DEFAULT_FRAME_DURATION
    && Object.keys(frame.poses).length === 0
    && frame.paths.length === 0
    && frame.marks.length === 0;
  if (!isLegacyEmpty) return board;
  return touch(board, {
    authoringMode: "blank-rally",
    frames: [{ ...frame, label: "第 1 拍 · 起始站位" }],
  });
}

/**
 * Conservatively upgrades drafts created by the former “我的空白战术” entry.
 * The exact untouched default title is the only legacy provenance available;
 * source-backed, imported/renamed and non-standard documents stay manual.
 */
export function prepareBlankRallyBoard(board: BoardDocument): BoardDocument {
  if (board.authoringMode === "blank-rally") return armBlankRally(normalizeLegacyEmptyBlankRally(board));
  if (board.title !== "我的空白战术"
    || board.sourceTacticId !== undefined
    || board.drillId !== undefined
    || board.smartRally !== undefined) return board;

  const frameIndex = board.frames.length - 1;
  const frame = board.frames[frameIndex];
  const players = board.actors.filter((actor) => actor.kind === "player");
  const balls = board.actors.filter((actor) => actor.kind === "ball");
  const isUntouchedEmpty = board.frames.length === 1
    && board.actors.length === 0
    && frame.label === "起始站位"
    && Object.keys(frame.poses).length === 0
    && frame.paths.length === 0
    && frame.marks.length === 0;
  if (isUntouchedEmpty) return normalizeLegacyEmptyBlankRally(board);
  if (players.length !== 2 || balls.length !== 1) return board;

  const marked = touch(board, { authoringMode: "blank-rally" });
  const authoredPaths = board.frames.flatMap((candidate) => candidate.paths);
  if (authoredPaths.length === 0) return armBlankRally(marked);

  const ball = balls[0];
  const shot = frame.paths[0];
  if (authoredPaths.length !== 1 || frame.paths.length !== 1 || shot.kind !== "shot" || shot.actorId !== ball.id) return board;
  const hitter = players.reduce((nearest, player) => {
    const distance = Math.hypot(frame.poses[player.id][0] - shot.from[0], frame.poses[player.id][1] - shot.from[1]);
    const nearestDistance = Math.hypot(frame.poses[nearest.id][0] - shot.from[0], frame.poses[nearest.id][1] - shot.from[1]);
    return distance < nearestDistance ? player : nearest;
  });
  const receiver = players.find((player) => player.id !== hitter.id);
  if (!receiver) return board;
  const withTail = addFrame(marked, frameIndex, false);
  return setSmartRally(withTail, {
    version: 2,
    frameId: withTail.frames[frameIndex + 1].id,
    phase: "move",
    hitterId: receiver.id,
    actorId: receiver.id,
  });
}

export function getFrameEnd(frame: BoardFrame): Record<string, Point> {
  const poses = copyPoses(frame.poses);
  for (const path of frame.paths) poses[path.actorId] = copyPoint(path.to);
  return poses;
}

/** Whether the final v2 frame is still the untouched smart-authoring scaffold. */
export function isUntouchedSmartTail(board: BoardDocument): boolean {
  if (board.frames.length < 2 || board.smartRally?.version !== 2) return false;
  const tail = board.frames.at(-1)!;
  const previous = board.frames.at(-2)!;
  if (board.smartRally.frameId !== tail.id
    || tail.paths.length > 0
    || tail.marks.length > 0
    || tail.label !== `第 ${board.frames.length} 拍`
    || tail.duration !== (previous.duration || BOARD_DEFAULT_FRAME_DURATION)) return false;
  const expectedPoses = getFrameEnd(previous);
  const actualKeys = Object.keys(tail.poses);
  const expectedKeys = Object.keys(expectedPoses);
  return actualKeys.length === expectedKeys.length && actualKeys.every(actorId => {
    const actual = tail.poses[actorId], expected = expectedPoses[actorId];
    return !!actual && !!expected && actual[0] === expected[0] && actual[1] === expected[1];
  });
}

export function getFramePose(frame: BoardFrame, progress01: number): Record<string, Point> {
  const progress = playbackProgress(progress01);
  const poses = copyPoses(frame.poses);
  const remaining = 1 - progress;

  for (const path of frame.paths) {
    if (!path.control) {
      poses[path.actorId] = [
        path.from[0] * remaining + path.to[0] * progress,
        path.from[1] * remaining + path.to[1] * progress,
      ];
      continue;
    }
    poses[path.actorId] = [
      remaining * remaining * path.from[0] + 2 * remaining * progress * path.control[0] + progress * progress * path.to[0],
      remaining * remaining * path.from[1] + 2 * remaining * progress * path.control[1] + progress * progress * path.to[1],
    ];
  }
  return poses;
}

export function getBoardDuration(board: BoardDocument) {
  return board.frames.reduce((total, frame) => total + Math.max(0, Number.isFinite(frame.duration) ? frame.duration : 0), 0);
}

export function getBoardPose(board: BoardDocument, elapsedSeconds: number): BoardPlaybackPose {
  if (!board.frames.length) throw new Error("畫板沒有可播放的拍次");
  const totalDuration = getBoardDuration(board);
  let elapsed = Number.isNaN(elapsedSeconds) || elapsedSeconds === -Infinity ? 0 : elapsedSeconds;
  if (elapsedSeconds === Infinity) elapsed = totalDuration;
  elapsed = bounded(elapsed, 0, totalDuration);

  if (elapsed >= totalDuration) {
    const frameIndex = board.frames.length - 1;
    return { frameIndex, progress: 1, poses: getFramePose(board.frames[frameIndex], 1) };
  }

  let frameStart = 0;
  for (let frameIndex = 0; frameIndex < board.frames.length; frameIndex += 1) {
    const frame = board.frames[frameIndex];
    const frameEnd = frameStart + Math.max(0, frame.duration);
    if (elapsed < frameEnd) {
      const progress = frame.duration > 0 ? (elapsed - frameStart) / frame.duration : 1;
      return { frameIndex, progress, poses: getFramePose(frame, progress) };
    }
    frameStart = frameEnd;
  }

  const frameIndex = board.frames.length - 1;
  return { frameIndex, progress: 1, poses: getFramePose(board.frames[frameIndex], 1) };
}

/**
 * Move a guided receiver route from the editing tail into the preceding
 * incoming-shot beat. Playback already advances every route in one frame with
 * a shared progress value, so this data placement makes the ball and receiver
 * start and finish together without changing manual or template timelines.
 */
export function synchronizeMoveWithPreviousShot(
  board: BoardDocument,
  frameIndex: number,
  movePathId: string,
): BoardDocument {
  assertFrameIndex(board, frameIndex);
  if (frameIndex === 0) return board;

  const frame = board.frames[frameIndex];
  const move = frame.paths.find((path) => path.id === movePathId);
  const actor = move ? board.actors.find((candidate) => candidate.id === move.actorId) : undefined;
  const previous = board.frames[frameIndex - 1];
  const ballIds = new Set(board.actors.filter((candidate) => candidate.kind === "ball").map((candidate) => candidate.id));
  const hasIncomingShot = previous.paths.some((path) => ballIds.has(path.actorId) && (path.kind === "shot" || path.kind === "feed"));

  if (!move || move.kind !== "move" || actor?.kind !== "player" || !hasIncomingShot) return board;
  if (previous.paths.some((path) => path.actorId === move.actorId)) return board;

  const previousStart = previous.poses[move.actorId];
  if (!previousStart) return board;
  const synchronizedMove = copyPath({ ...move, from: previousStart });
  const frames = board.frames.slice();
  frames[frameIndex - 1] = { ...previous, paths: [...previous.paths, synchronizedMove] };
  frames[frameIndex] = { ...frame, paths: frame.paths.filter((path) => path.id !== movePathId) };
  return touch(board, { frames: reflowFrames(frames, frameIndex - 1) });
}

/**
 * Upgrade only explicitly-versioned guided drafts from the former delayed
 * movement layout. Manual, imported, source-backed and template boards have no
 * v1 smart cursor and are therefore never inferred or rewritten.
 */
export function prepareSynchronizedRallyBoard(board: BoardDocument): BoardDocument {
  if (board.smartRally?.version !== 1) return board;
  const ballIds = new Set(board.actors.filter((actor) => actor.kind === "ball").map((actor) => actor.id));
  const tailIndex = board.frames.length - 1;
  if (board.smartRally.frameId !== board.frames[tailIndex]?.id) return board;
  const firstShotIndex = board.frames.findIndex((frame) => frame.paths.some((path) => ballIds.has(path.actorId) && path.kind === "shot"));
  const canonicalLegacyShape = board.frames.every((frame, frameIndex) => {
    if (frame.paths.some((path) => path.kind === "feed" || (ballIds.has(path.actorId) ? path.kind !== "shot" : path.kind !== "move"))) return false;
    const shots = frame.paths.filter((path) => ballIds.has(path.actorId));
    if (frameIndex === tailIndex) return shots.length === 0;
    if (firstShotIndex < 0 || frameIndex < firstShotIndex) return frame.paths.length === 0;
    return shots.length === 1;
  });
  const tail = board.frames[tailIndex];
  const expectedTailMove = tail.paths.some((path) => path.kind === "move" && path.actorId === board.smartRally?.hitterId);
  const phaseMatchesTail = board.smartRally.phase === "move"
    ? !expectedTailMove
    : (tailIndex === 0 && tail.paths.length === 0) || expectedTailMove;
  const hasCanonicalShotRange = firstShotIndex >= 0
    || (tailIndex === 0 && tail.paths.length === 0 && board.smartRally.phase === "shot");
  if (!canonicalLegacyShape || !hasCanonicalShotRange || !phaseMatchesTail) return board;

  const candidates = board.frames.flatMap((frame, frameIndex) => {
    if (frameIndex === 0) return [];
    const previous = board.frames[frameIndex - 1];
    const hasIncomingShot = previous.paths.some((path) => ballIds.has(path.actorId) && (path.kind === "shot" || path.kind === "feed"));
    if (!hasIncomingShot) return [];
    return frame.paths
      .filter((path) => path.kind === "move")
      .map((path) => ({ frameIndex, path }));
  });

  // A player already moving in the incoming-shot beat is ambiguous. Keep the
  // old document intact instead of replacing a deliberate manual route.
  if (candidates.some(({ frameIndex, path }) => board.frames[frameIndex - 1].paths.some((candidate) => candidate.actorId === path.actorId))) {
    return board;
  }

  let migrated = board;
  for (const { frameIndex, path } of candidates) {
    const next = synchronizeMoveWithPreviousShot(migrated, frameIndex, path.id);
    if (next === migrated) return board;
    migrated = next;
  }
  return setSmartRally(migrated, { ...board.smartRally, version: 2 });
}

export function moveActor(board: BoardDocument, frameIndex: number, actorId: string, point: Point): BoardDocument {
  assertFrameIndex(board, frameIndex);
  assertActor(board, actorId);
  const nextPoint = assertPoint(point);
  const linked = setLinkedStartPose(board.frames, frameIndex, actorId, nextPoint);
  return touch(board, { frames: reflowFrames(linked, frameIndex) });
}

export function setPath(board: BoardDocument, frameIndex: number, path: BoardPath): BoardDocument {
  assertFrameIndex(board, frameIndex);
  assertActor(board, path.actorId);
  assertPoint(path.from, "路線起點");
  assertPoint(path.to, "路線終點");
  if (path.control) assertPoint(path.control, "曲線控制點");
  assertIdValue(path.id, "路線 ID");
  if (!(["shot", "move", "feed"] as const).includes(path.kind)) throw new Error("不支援的路線類型");
  if (board.frames.some((item, index) => index !== frameIndex
    && (item.paths.some((candidate) => candidate.id === path.id) || item.marks.some((candidate) => candidate.id === path.id)))) {
    throw new Error("路線 ID 已存在");
  }

  const frame = board.frames[frameIndex];
  if (frame.marks.some((mark) => mark.id === path.id)) throw new Error("路線 ID 已存在");
  const from = frame.poses[path.actorId];
  if (!from) throw new Error("角色在此拍次沒有站位");
  const nextPath: BoardPath = {
    ...path,
    from: copyPoint(from),
    to: copyPoint(path.to),
    ...(path.control ? { control: copyPoint(path.control) } : {}),
  };
  const paths = frame.paths.filter((item) => item.id !== path.id && item.actorId !== path.actorId);
  const frames = board.frames.slice();
  frames[frameIndex] = { ...frame, paths: [...paths, nextPath] };
  return touch(board, { frames: reflowFrames(frames, frameIndex) });
}

export function updatePath(
  board: BoardDocument,
  frameIndex: number,
  pathId: string,
  patch: Partial<Omit<BoardPath, "id">>,
): BoardDocument {
  assertFrameIndex(board, frameIndex);
  const originalFrame = board.frames[frameIndex];
  const original = originalFrame.paths.find((path) => path.id === pathId);
  if (!original) return board;
  const actorId = patch.actorId ?? original.actorId;
  assertActor(board, actorId);
  if (patch.from) assertPoint(patch.from, "路線起點");
  if (patch.to) assertPoint(patch.to, "路線終點");
  if (patch.control) assertPoint(patch.control, "曲線控制點");
  if (patch.kind && !(["shot", "move", "feed"] as const).includes(patch.kind)) throw new Error("不支援的路線類型");

  let frames = board.frames.slice();
  if (patch.from) frames = setLinkedStartPose(frames, frameIndex, actorId, patch.from);
  const frame = frames[frameIndex];
  const start = frame.poses[actorId];
  if (!start) throw new Error("角色在此拍次沒有站位");
  const updated: BoardPath = {
    ...original,
    ...patch,
    actorId,
    from: copyPoint(start),
    to: copyPoint(patch.to ?? original.to),
  };
  if (updated.control) updated.control = copyPoint(updated.control);
  const paths = frame.paths
    .filter((path) => path.id === pathId || path.actorId !== actorId)
    .map((path) => path.id === pathId ? updated : path);
  frames[frameIndex] = { ...frame, paths };
  return clearInvalidSmartRally(touch(board, { frames: reflowFrames(frames, frameIndex) }));
}

export function deletePath(board: BoardDocument, frameIndex: number, pathId: string): BoardDocument {
  assertFrameIndex(board, frameIndex);
  const frame = board.frames[frameIndex];
  const paths = frame.paths.filter((path) => path.id !== pathId);
  if (paths.length === frame.paths.length) return board;
  const frames = board.frames.slice();
  frames[frameIndex] = { ...frame, paths };
  return clearInvalidSmartRally(touch(board, { frames: reflowFrames(frames, frameIndex) }));
}

export function addFrame(board: BoardDocument, afterIndex: number, duplicate = false): BoardDocument {
  assertFrameIndex(board, afterIndex);
  if (board.frames.length >= BOARD_MAX_FRAMES) throw new RangeError(`畫板最多 ${BOARD_MAX_FRAMES} 拍`);
  const source = board.frames[afterIndex];
  const poses = getFrameEnd(source);
  const marks = duplicate
    ? source.marks.map((mark) => ({ ...copyMark(mark), id: newBoardId("mark") }))
    : [];
  const frame: BoardFrame = {
    id: newBoardId("frame"),
    label: duplicate ? defaultCopyFrameLabel(source.label) : `第 ${afterIndex + 2} 拍`,
    duration: source.duration || BOARD_DEFAULT_FRAME_DURATION,
    poses,
    // Routes are outgoing actions. A copied stage begins at the prior end but
    // deliberately does not replay the source action.
    paths: [],
    marks,
  };
  const frames = board.frames.slice();
  frames.splice(afterIndex + 1, 0, frame);
  return touch(board, { frames: renumberDefaultFrameLabels(reflowFrames(frames, afterIndex + 1)) });
}

export function deleteFrame(board: BoardDocument, frameIndex: number): BoardDocument {
  assertFrameIndex(board, frameIndex);
  if (board.frames.length === 1) return board;
  const deletedFrameId = board.frames[frameIndex].id;
  const frames = board.frames.filter((_, index) => index !== frameIndex);
  const reflowFrom = frameIndex === 0 ? 0 : frameIndex - 1;
  const next = touch(board, { frames: renumberDefaultFrameLabels(reflowFrames(frames, reflowFrom)) });
  if (next.smartRally?.frameId !== deletedFrameId) return clearInvalidSmartRally(next);
  const { smartRally: _smartRally, ...manualBoard } = next;
  return manualBoard;
}

export function updateFrame(
  board: BoardDocument,
  frameIndex: number,
  patch: { label?: string; duration?: number },
): BoardDocument {
  assertFrameIndex(board, frameIndex);
  if (patch.duration !== undefined) assertDuration(patch.duration);
  if (patch.label !== undefined && !patch.label.trim()) throw new Error("拍次名稱不能留空");
  if (patch.label !== undefined && patch.label.length > MAX_LABEL_LENGTH) throw new RangeError(`拍次名稱最多 ${MAX_LABEL_LENGTH} 字`);
  const shouldCarryDurationIntoSmartTail = patch.duration !== undefined
    && frameIndex === board.frames.length - 2
    && isUntouchedSmartTail(board);
  const frames = board.frames.slice();
  frames[frameIndex] = { ...frames[frameIndex], ...patch };
  if (shouldCarryDurationIntoSmartTail) {
    frames[frameIndex + 1] = { ...frames[frameIndex + 1], duration: patch.duration || BOARD_DEFAULT_FRAME_DURATION };
  }
  return touch(board, { frames });
}

export function addMark(board: BoardDocument, frameIndex: number, mark: BoardMark): BoardDocument {
  assertFrameIndex(board, frameIndex);
  assertPoint(mark.position, "標示位置");
  if (mark.size) assertSize(mark.size);
  if (mark.points) mark.points.forEach((point) => assertPoint(point, "筆畫座標"));
  assertIdValue(mark.id, "標示 ID");
  if (!(["target", "cone", "basket", "text", "freehand"] as const).includes(mark.kind)) throw new Error("不支援的標示類型");
  if (mark.kind === "freehand" && !mark.points?.length) throw new Error("自由筆標示缺少筆畫點");
  if (mark.kind !== "freehand" && mark.points !== undefined) throw new Error("此標示不應包含筆畫點");
  if ((mark.points?.length ?? 0) > MAX_FREEHAND_POINTS) throw new RangeError(`單筆自由畫最多 ${MAX_FREEHAND_POINTS} 點`);
  if (totalFreehandPoints(board) + (mark.kind === "freehand" ? mark.points?.length ?? 0 : 0) > MAX_TOTAL_FREEHAND_POINTS) {
    throw new RangeError(`整份畫板自由畫最多 ${MAX_TOTAL_FREEHAND_POINTS} 點`);
  }
  if ((mark.text?.length ?? 0) > MAX_TEXT_LENGTH) throw new RangeError(`標示文字最多 ${MAX_TEXT_LENGTH} 字`);
  if (mark.text !== undefined && !mark.text.trim()) throw new Error("標示文字不能留空");
  if (board.frames[frameIndex].marks.length >= MAX_MARKS_PER_FRAME) throw new RangeError(`每拍最多 ${MAX_MARKS_PER_FRAME} 個標示`);
  if (board.frames.some((frame) => frame.marks.some((item) => item.id === mark.id) || frame.paths.some((item) => item.id === mark.id))) {
    throw new Error("標示 ID 已存在");
  }
  const frames = board.frames.slice();
  const frame = frames[frameIndex];
  frames[frameIndex] = { ...frame, marks: [...frame.marks, copyMark(mark)] };
  return touch(board, { frames });
}

function moveFreehand(mark: BoardMark, requestedPosition: Point) {
  if (mark.kind !== "freehand" || !mark.points?.length) {
    return { position: copyPoint(requestedPosition), points: mark.points?.map(copyPoint) };
  }
  const xs = mark.points.map((point) => point[0]);
  const ys = mark.points.map((point) => point[1]);
  const requestedDx = requestedPosition[0] - mark.position[0];
  const requestedDy = requestedPosition[1] - mark.position[1];
  const dx = bounded(requestedDx, BOARD_COORDINATE_MIN - Math.min(...xs), BOARD_COORDINATE_MAX - Math.max(...xs));
  const dy = bounded(requestedDy, BOARD_COORDINATE_MIN - Math.min(...ys), BOARD_COORDINATE_MAX - Math.max(...ys));
  return {
    position: [mark.position[0] + dx, mark.position[1] + dy] as Point,
    points: mark.points.map((point) => [point[0] + dx, point[1] + dy] as Point),
  };
}

export function updateMark(
  board: BoardDocument,
  frameIndex: number,
  markId: string,
  patch: Partial<Omit<BoardMark, "id">>,
): BoardDocument {
  assertFrameIndex(board, frameIndex);
  const frame = board.frames[frameIndex];
  const markIndex = frame.marks.findIndex((mark) => mark.id === markId);
  if (markIndex < 0) return board;
  if (patch.position) assertPoint(patch.position, "標示位置");
  if (patch.size) assertSize(patch.size);
  if (patch.points) patch.points.forEach((point) => assertPoint(point, "筆畫座標"));
  if (patch.kind && !(["target", "cone", "basket", "text", "freehand"] as const).includes(patch.kind)) throw new Error("不支援的標示類型");
  if ((patch.points?.length ?? 0) > MAX_FREEHAND_POINTS) throw new RangeError(`單筆自由畫最多 ${MAX_FREEHAND_POINTS} 點`);
  if ((patch.text?.length ?? 0) > MAX_TEXT_LENGTH) throw new RangeError(`標示文字最多 ${MAX_TEXT_LENGTH} 字`);
  if (patch.text !== undefined && !patch.text.trim()) throw new Error("標示文字不能留空");

  const original = frame.marks[markIndex];
  const translated = patch.position && patch.points === undefined
    ? moveFreehand(original, patch.position)
    : undefined;
  const updated: BoardMark = {
    ...original,
    ...patch,
    position: translated?.position ?? copyPoint(patch.position ?? original.position),
  };
  if (patch.size) updated.size = copyPoint(patch.size);
  else if (original.size) updated.size = copyPoint(original.size);
  if (translated?.points) updated.points = translated.points;
  else if (patch.points) updated.points = patch.points.map(copyPoint);
  else if (original.points) updated.points = original.points.map(copyPoint);
  if (updated.kind === "freehand" && !updated.points?.length) throw new Error("自由筆標示缺少筆畫點");
  if (updated.kind !== "freehand") delete updated.points;
  const currentPointCount = original.kind === "freehand" ? original.points?.length ?? 0 : 0;
  const updatedPointCount = updated.kind === "freehand" ? updated.points?.length ?? 0 : 0;
  if (totalFreehandPoints(board) - currentPointCount + updatedPointCount > MAX_TOTAL_FREEHAND_POINTS) {
    throw new RangeError(`整份畫板自由畫最多 ${MAX_TOTAL_FREEHAND_POINTS} 點`);
  }

  const marks = frame.marks.slice();
  marks[markIndex] = updated;
  const frames = board.frames.slice();
  frames[frameIndex] = { ...frame, marks };
  return touch(board, { frames });
}

export function deleteMark(board: BoardDocument, frameIndex: number, markId: string): BoardDocument {
  assertFrameIndex(board, frameIndex);
  const frame = board.frames[frameIndex];
  const marks = frame.marks.filter((mark) => mark.id !== markId);
  if (marks.length === frame.marks.length) return board;
  const frames = board.frames.slice();
  frames[frameIndex] = { ...frame, marks };
  return touch(board, { frames });
}

export function addActor(board: BoardDocument, actor: BoardActor, point: Point): BoardDocument {
  assertIdValue(actor.id, "角色 ID");
  if (!actor.label.trim()) throw new Error("角色名稱不能留空");
  if (actor.kind !== "player" && actor.kind !== "ball") throw new Error("不支援的角色類型");
  if (board.actors.some((item) => item.id === actor.id)) throw new Error("角色 ID 已存在");
  if (board.actors.length >= MAX_ACTORS) throw new RangeError(`畫板最多 ${MAX_ACTORS} 個角色`);
  if (actor.label.length > MAX_LABEL_LENGTH) throw new RangeError(`角色名稱最多 ${MAX_LABEL_LENGTH} 字`);
  const nextPoint = assertPoint(point, "角色位置");
  const frames = board.frames.map((frame) => ({
    ...frame,
    poses: { ...frame.poses, [actor.id]: copyPoint(nextPoint) },
  }));
  const next = touch(board, { actors: [...board.actors, { ...actor }], frames });
  if (!next.smartRally) return next;
  const { smartRally: _smartRally, ...manualBoard } = next;
  return manualBoard;
}

export function deleteActor(board: BoardDocument, actorId: string): BoardDocument {
  if (!board.actors.some((actor) => actor.id === actorId)) return board;
  const actors = board.actors.filter((actor) => actor.id !== actorId);
  const frames = board.frames.map((frame) => {
    const poses = Object.fromEntries(Object.entries(frame.poses).filter(([id]) => id !== actorId));
    return { ...frame, poses, paths: frame.paths.filter((path) => path.actorId !== actorId) };
  });
  const next = touch(board, { actors, frames });
  if (!next.smartRally) return next;
  const { smartRally: _smartRally, ...manualBoard } = next;
  return manualBoard;
}

export function renameBoard(board: BoardDocument, title: string): BoardDocument {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("畫板名稱不能留空");
  if (normalizedTitle.length > MAX_TITLE_LENGTH) throw new RangeError(`畫板名稱最多 ${MAX_TITLE_LENGTH} 字`);
  return touch(board, { title: normalizedTitle });
}
