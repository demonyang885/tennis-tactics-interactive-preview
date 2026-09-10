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

export type BoardDocument = {
  version: 1;
  id: string;
  title: string;
  sourceTacticId?: string;
  updatedAt: string;
  actors: BoardActor[];
  frames: BoardFrame[];
  drillId?: string;
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
const DEFAULT_FRAME_DURATION = 1.5;
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
      duration: DEFAULT_FRAME_DURATION,
      poses: {},
      paths: [],
      marks: [],
    }],
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
  };
}

export function getFrameEnd(frame: BoardFrame): Record<string, Point> {
  const poses = copyPoses(frame.poses);
  for (const path of frame.paths) poses[path.actorId] = copyPoint(path.to);
  return poses;
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
  return touch(board, { frames: reflowFrames(frames, frameIndex) });
}

export function deletePath(board: BoardDocument, frameIndex: number, pathId: string): BoardDocument {
  assertFrameIndex(board, frameIndex);
  const frame = board.frames[frameIndex];
  const paths = frame.paths.filter((path) => path.id !== pathId);
  if (paths.length === frame.paths.length) return board;
  const frames = board.frames.slice();
  frames[frameIndex] = { ...frame, paths };
  return touch(board, { frames: reflowFrames(frames, frameIndex) });
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
    duration: source.duration || DEFAULT_FRAME_DURATION,
    poses,
    // Routes are outgoing actions. A copied stage begins at the prior end but
    // deliberately does not replay the source action.
    paths: [],
    marks,
  };
  const frames = board.frames.slice();
  frames.splice(afterIndex + 1, 0, frame);
  return touch(board, { frames: reflowFrames(frames, afterIndex + 1) });
}

export function deleteFrame(board: BoardDocument, frameIndex: number): BoardDocument {
  assertFrameIndex(board, frameIndex);
  if (board.frames.length === 1) return board;
  const frames = board.frames.filter((_, index) => index !== frameIndex);
  const reflowFrom = frameIndex === 0 ? 0 : frameIndex - 1;
  return touch(board, { frames: reflowFrames(frames, reflowFrom) });
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
  const frames = board.frames.slice();
  frames[frameIndex] = { ...frames[frameIndex], ...patch };
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
  return touch(board, { actors: [...board.actors, { ...actor }], frames });
}

export function deleteActor(board: BoardDocument, actorId: string): BoardDocument {
  if (!board.actors.some((actor) => actor.id === actorId)) return board;
  const actors = board.actors.filter((actor) => actor.id !== actorId);
  const frames = board.frames.map((frame) => {
    const poses = Object.fromEntries(Object.entries(frame.poses).filter(([id]) => id !== actorId));
    return { ...frame, poses, paths: frame.paths.filter((path) => path.actorId !== actorId) };
  });
  return touch(board, { actors, frames });
}

export function renameBoard(board: BoardDocument, title: string): BoardDocument {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("畫板名稱不能留空");
  if (normalizedTitle.length > MAX_TITLE_LENGTH) throw new RangeError(`畫板名稱最多 ${MAX_TITLE_LENGTH} 字`);
  return touch(board, { title: normalizedTitle });
}
