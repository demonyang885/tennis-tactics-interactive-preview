import {
  BOARD_COORDINATE_MAX,
  BOARD_COORDINATE_MIN,
  BOARD_MAX_FRAMES,
  type BoardActor,
  type BoardAuthoringMode,
  type BoardDocument,
  type BoardFrame,
  type BoardMark,
  type BoardPath,
  type BoardSmartRally,
  type Point,
} from "./model";

export type BoardResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const BOARD_IMPORT_MAX_CHARACTERS = 2_000_000;
export const BOARD_MAX_ACTORS = 24;
export const BOARD_MAX_MARKS_PER_FRAME = 100;
export const BOARD_MAX_FREEHAND_POINTS = 2_000;
export const BOARD_MAX_TOTAL_FREEHAND_POINTS = 12_000;

const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 120;
const MAX_LABEL_LENGTH = 160;
const MAX_TEXT_LENGTH = 1_000;
const MAX_DURATION_SECONDS = 120;
const MAX_TARGET_SIZE = 1.3;
const COORDINATE_EPSILON = 1e-8;
const FORBIDDEN_IDS = new Set(["__proto__", "prototype", "constructor"]);
const ACTOR_KINDS = new Set(["player", "ball"]);
const PATH_KINDS = new Set(["shot", "move", "feed"]);
const MARK_KINDS = new Set(["target", "cone", "basket", "text", "freehand"]);
const SMART_RALLY_PHASES = new Set(["shot", "move"]);
const AUTHORING_MODES = new Set(["blank-rally"]);

class BoardValidationError extends Error {}

function invalid(message: string): never {
  throw new BoardValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string) {
  if (!isRecord(value)) invalid(`${label}格式不正確`);
  return value;
}

function array(value: unknown, label: string) {
  if (!Array.isArray(value)) invalid(`${label}必須是清單`);
  return value;
}

function requiredString(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string" || !value.trim()) invalid(`${label}不能留空`);
  if (value.length > maximum) invalid(`${label}過長（最多 ${maximum} 字）`);
  return value;
}

function optionalString(value: unknown, label: string, maximum: number) {
  if (value === undefined) return undefined;
  return requiredString(value, label, maximum);
}

function id(value: unknown, label: string) {
  const parsed = requiredString(value, label, MAX_ID_LENGTH);
  if (parsed !== parsed.trim() || FORBIDDEN_IDS.has(parsed)) invalid(`${label}不合法`);
  return parsed;
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${label}必須是有限數值`);
  return value;
}

function point(value: unknown, label: string): Point {
  if (!Array.isArray(value) || value.length !== 2) invalid(`${label}必須是二維座標`);
  const x = finiteNumber(value[0], `${label} x`);
  const y = finiteNumber(value[1], `${label} y`);
  if (x < BOARD_COORDINATE_MIN || x > BOARD_COORDINATE_MAX || y < BOARD_COORDINATE_MIN || y > BOARD_COORDINATE_MAX) {
    invalid(`${label}超出畫板邊界`);
  }
  return [x, y];
}

function size(value: unknown, label: string): Point {
  if (!Array.isArray(value) || value.length !== 2) invalid(`${label}必須是寬高座標`);
  const width = finiteNumber(value[0], `${label}寬度`);
  const height = finiteNumber(value[1], `${label}高度`);
  if (width <= 0 || height <= 0 || width > MAX_TARGET_SIZE || height > MAX_TARGET_SIZE) {
    invalid(`${label}必須大於 0 且不超出畫板尺寸`);
  }
  return [width, height];
}

function samePoint(left: Point, right: Point) {
  return Math.abs(left[0] - right[0]) <= COORDINATE_EPSILON
    && Math.abs(left[1] - right[1]) <= COORDINATE_EPSILON;
}

function parseActor(value: unknown, index: number): BoardActor {
  const source = record(value, `角色 ${index + 1}`);
  const kind = source.kind;
  if (typeof kind !== "string" || !ACTOR_KINDS.has(kind)) invalid(`角色 ${index + 1} 類型不支援`);
  return {
    id: id(source.id, `角色 ${index + 1} ID`),
    label: requiredString(source.label, `角色 ${index + 1} 名稱`, MAX_LABEL_LENGTH),
    kind: kind as BoardActor["kind"],
    ...(source.color === undefined
      ? {}
      : { color: requiredString(source.color, `角色 ${index + 1} 顏色`, 64) }),
  };
}

function parsePath(
  value: unknown,
  frameNumber: number,
  pathNumber: number,
  actorIds: Set<string>,
  poses: Record<string, Point>,
): BoardPath {
  const label = `第 ${frameNumber} 拍路線 ${pathNumber}`;
  const source = record(value, label);
  const kind = source.kind;
  if (typeof kind !== "string" || !PATH_KINDS.has(kind)) invalid(`${label}類型不支援`);
  const actorId = id(source.actorId, `${label}角色 ID`);
  if (!actorIds.has(actorId)) invalid(`${label}引用了不存在的角色`);
  const from = point(source.from, `${label}起點`);
  const pose = poses[actorId];
  if (!pose || !samePoint(from, pose)) invalid(`${label}起點沒有連接角色站位`);
  return {
    id: id(source.id, `${label} ID`),
    kind: kind as BoardPath["kind"],
    actorId,
    from,
    to: point(source.to, `${label}終點`),
    ...(source.control === undefined ? {} : { control: point(source.control, `${label}控制點`) }),
  };
}

function parseMark(value: unknown, frameNumber: number, markNumber: number) {
  const label = `第 ${frameNumber} 拍標示 ${markNumber}`;
  const source = record(value, label);
  const kind = source.kind;
  if (typeof kind !== "string" || !MARK_KINDS.has(kind)) invalid(`${label}類型不支援`);
  let points: Point[] | undefined;
  if (source.points !== undefined) {
    const sourcePoints = array(source.points, `${label}筆畫點`);
    if (sourcePoints.length > BOARD_MAX_FREEHAND_POINTS) {
      invalid(`${label}筆畫點過多（最多 ${BOARD_MAX_FREEHAND_POINTS} 點）`);
    }
    points = sourcePoints.map((item, index) => point(item, `${label}筆畫點 ${index + 1}`));
  }
  if (kind === "freehand" && !points?.length) invalid(`${label}缺少筆畫點`);
  if (kind !== "freehand" && points !== undefined) invalid(`${label}不應包含筆畫點`);

  const parsed: BoardMark = {
    id: id(source.id, `${label} ID`),
    kind: kind as BoardMark["kind"],
    position: point(source.position, `${label}位置`),
    ...(source.size === undefined ? {} : { size: size(source.size, `${label}大小`) }),
    ...(source.text === undefined ? {} : { text: requiredString(source.text, `${label}文字`, MAX_TEXT_LENGTH) }),
    ...(points === undefined ? {} : { points }),
  };
  return parsed;
}

function parseFrame(
  value: unknown,
  index: number,
  actors: BoardActor[],
  elementIds: Set<string>,
  totals: { freehandPoints: number },
): BoardFrame {
  const source = record(value, `第 ${index + 1} 拍`);
  const duration = finiteNumber(source.duration, `第 ${index + 1} 拍時長`);
  if (duration < 0 || duration > MAX_DURATION_SECONDS) {
    invalid(`第 ${index + 1} 拍時長必須介於 0 至 ${MAX_DURATION_SECONDS} 秒`);
  }

  const sourcePoses = record(source.poses, `第 ${index + 1} 拍站位`);
  const actorIds = new Set(actors.map((actor) => actor.id));
  const poseKeys = Object.keys(sourcePoses);
  if (poseKeys.some((actorId) => !actorIds.has(actorId))) invalid(`第 ${index + 1} 拍含有未知角色站位`);
  if (actors.some((actor) => !Object.prototype.hasOwnProperty.call(sourcePoses, actor.id))) {
    invalid(`第 ${index + 1} 拍缺少角色站位`);
  }
  const poses: Record<string, Point> = {};
  for (const actor of actors) poses[actor.id] = point(sourcePoses[actor.id], `第 ${index + 1} 拍「${actor.label}」站位`);

  const sourcePaths = array(source.paths, `第 ${index + 1} 拍路線`);
  if (sourcePaths.length > actors.length) invalid(`第 ${index + 1} 拍路線數量超出角色數量`);
  const paths = sourcePaths.map((item, pathIndex) => parsePath(item, index + 1, pathIndex + 1, actorIds, poses));
  const pathActors = new Set<string>();
  for (const path of paths) {
    if (pathActors.has(path.actorId)) invalid(`第 ${index + 1} 拍每個角色最多只能有一條路線`);
    pathActors.add(path.actorId);
    if (elementIds.has(path.id)) invalid(`元素 ID「${path.id}」重複`);
    elementIds.add(path.id);
  }

  const sourceMarks = array(source.marks, `第 ${index + 1} 拍標示`);
  if (sourceMarks.length > BOARD_MAX_MARKS_PER_FRAME) {
    invalid(`第 ${index + 1} 拍標示過多（最多 ${BOARD_MAX_MARKS_PER_FRAME} 個）`);
  }
  const marks = sourceMarks.map((item, markIndex) => parseMark(item, index + 1, markIndex + 1));
  for (const mark of marks) {
    if (elementIds.has(mark.id)) invalid(`元素 ID「${mark.id}」重複`);
    elementIds.add(mark.id);
    totals.freehandPoints += mark.points?.length ?? 0;
    if (totals.freehandPoints > BOARD_MAX_TOTAL_FREEHAND_POINTS) {
      invalid(`整份畫板筆畫點過多（最多 ${BOARD_MAX_TOTAL_FREEHAND_POINTS} 點）`);
    }
  }

  return {
    id: id(source.id, `第 ${index + 1} 拍 ID`),
    label: requiredString(source.label, `第 ${index + 1} 拍名稱`, MAX_LABEL_LENGTH),
    duration,
    poses,
    paths,
    marks,
  };
}

function parseUpdatedAt(value: unknown) {
  const updatedAt = requiredString(value, "更新時間", 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(updatedAt) || !Number.isFinite(Date.parse(updatedAt))) {
    invalid("更新時間格式不正確");
  }
  return updatedAt;
}

function parseSmartRally(value: unknown, actors: BoardActor[], frames: BoardFrame[]): BoardSmartRally {
  const source = record(value, "智慧回合");
  if (source.version !== 1 && source.version !== 2) invalid("不支援的智慧回合版本");
  const version = source.version;
  const phase = source.phase;
  if (typeof phase !== "string" || !SMART_RALLY_PHASES.has(phase)) invalid("智慧回合階段不支援");
  const frameId = id(source.frameId, "智慧回合拍次 ID");
  const hitterId = id(source.hitterId, "智慧回合擊球者 ID");
  const actorId = id(source.actorId, "智慧回合操作對象 ID");
  if (!frames.some((frame) => frame.id === frameId)) invalid("智慧回合引用了不存在的拍次");
  const players = actors.filter((actor) => actor.kind === "player");
  const balls = actors.filter((actor) => actor.kind === "ball");
  if (players.length !== 2 || balls.length !== 1) invalid("智慧回合需要兩位球員與一顆網球");
  if (!players.some((actor) => actor.id === hitterId)) invalid("智慧回合擊球者必須是球員");
  if (phase === "shot" && actorId !== balls[0].id) invalid("球路階段必須操作網球");
  if (phase === "move" && actorId !== hitterId) invalid("跑位階段必須操作當前擊球者");
  if (version === 2) {
    const frameIndex = frames.findIndex((frame) => frame.id === frameId);
    const frame = frames[frameIndex];
    if (frameIndex !== frames.length - 1) invalid("同步智慧回合必須指向最後一拍");
    if (frame.paths.length > 0) invalid("同步智慧回合的編輯尾拍不能含有路線");
    const hasEarlierPaths = frames.slice(0, frameIndex).some((candidate) => candidate.paths.length > 0);
    const previousHasShot = frameIndex > 0 && frames[frameIndex - 1].paths.some(
      (path) => path.actorId === balls[0].id && (path.kind === "shot" || path.kind === "feed"),
    );
    if (phase === "move" && !previousHasShot) invalid("跑位階段前一拍必須有來球路線");
    if (phase === "shot" && hasEarlierPaths && !previousHasShot) invalid("下一球必須承接前一拍來球");
  }
  return { version, frameId, phase: phase as BoardSmartRally["phase"], hitterId, actorId };
}

function validate(value: unknown): BoardDocument {
  const source = record(value, "畫板文件");
  if (source.version !== 1) invalid("不支援的畫板版本");
  const sourceActors = array(source.actors, "角色");
  if (sourceActors.length > BOARD_MAX_ACTORS) invalid(`角色過多（最多 ${BOARD_MAX_ACTORS} 個）`);
  const actors = sourceActors.map(parseActor);
  const actorIds = new Set<string>();
  for (const actor of actors) {
    if (actorIds.has(actor.id)) invalid(`角色 ID「${actor.id}」重複`);
    actorIds.add(actor.id);
  }

  const sourceFrames = array(source.frames, "拍次");
  if (!sourceFrames.length) invalid("畫板至少需要一拍");
  if (sourceFrames.length > BOARD_MAX_FRAMES) invalid(`畫板最多 ${BOARD_MAX_FRAMES} 拍`);
  const frameIds = new Set<string>();
  const elementIds = new Set<string>();
  const totals = { freehandPoints: 0 };
  const frames = sourceFrames.map((item, index) => parseFrame(item, index, actors, elementIds, totals));
  for (const frame of frames) {
    if (frameIds.has(frame.id)) invalid(`拍次 ID「${frame.id}」重複`);
    frameIds.add(frame.id);
  }

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const previousEnd = { ...previous.poses };
    for (const path of previous.paths) previousEnd[path.actorId] = path.to;
    for (const actor of actors) {
      if (!samePoint(frames[index].poses[actor.id], previousEnd[actor.id])) {
        invalid(`第 ${index + 1} 拍「${actor.label}」站位沒有接上上一拍`);
      }
    }
  }

  const smartRally = source.smartRally === undefined ? undefined : parseSmartRally(source.smartRally, actors, frames);
  const authoringMode = source.authoringMode;
  if (authoringMode !== undefined && (typeof authoringMode !== "string" || !AUTHORING_MODES.has(authoringMode))) {
    invalid("畫板編排模式不支援");
  }

  return {
    version: 1,
    id: id(source.id, "畫板 ID"),
    title: requiredString(source.title, "畫板名稱", MAX_TITLE_LENGTH),
    ...(source.sourceTacticId === undefined
      ? {}
      : { sourceTacticId: optionalString(source.sourceTacticId, "來源戰術 ID", MAX_ID_LENGTH) }),
    updatedAt: parseUpdatedAt(source.updatedAt),
    actors,
    frames,
    ...(source.drillId === undefined
      ? {}
      : { drillId: optionalString(source.drillId, "訓練 ID", MAX_ID_LENGTH) }),
    ...(authoringMode === undefined ? {} : { authoringMode: authoringMode as BoardAuthoringMode }),
    ...(smartRally ? { smartRally } : {}),
  };
}

export function validateBoardDocument(value: unknown): BoardResult<BoardDocument> {
  try {
    return { ok: true, value: validate(value) };
  } catch (error) {
    if (error instanceof BoardValidationError) return { ok: false, error: error.message };
    return { ok: false, error: "無法讀取畫板內容" };
  }
}

export function parseBoardJSON(json: string): BoardResult<BoardDocument> {
  if (typeof json !== "string") return { ok: false, error: "畫板 JSON 必須是文字" };
  if (json.length > BOARD_IMPORT_MAX_CHARACTERS) {
    return { ok: false, error: `畫板檔案過大（最多 ${BOARD_IMPORT_MAX_CHARACTERS.toLocaleString()} 字元）` };
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSON 格式損壞，未匯入任何內容" };
  }
  return validateBoardDocument(value);
}
