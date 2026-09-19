import { getBoardDisplayPreferences, type BoardSurface } from "./display";
import { getFramePose, type BoardActor, type BoardDocument, type BoardFrame, type BoardMark, type BoardPath, type BoardShotPace, type Point } from "./model";

export type BoardSelection = { kind: "actor"; id: string } | { kind: "element"; id: string; frameIndex?: number };
export type BoardHit = BoardSelection | { kind: "handle"; id: string; handle: "from" | "to" | "control"; frameIndex?: number };
export type BoardHitTestOptions = {
  contextPaths?: BoardPath[];
  contextFrameIndex?: number;
};
export type BoardRenderOptions = {
  progress?: number;
  playingProgress?: number;
  playing?: boolean;
  selection?: BoardSelection | null;
  showLegend?: boolean;
  /** Hide labels and text marks in compact read-only previews. */
  showLabels?: boolean;
  /** Paths from the preceding beat that preserve the completed action while authoring. */
  contextPaths?: BoardPath[];
  /** Source frame for an editable preceding-beat selection. */
  contextFrameIndex?: number;
  /** Visual surface only. It never changes timing or coordinates. */
  surface?: BoardSurface;
  /** Mirrored positioning bands below the regulation lines. */
  showZones?: boolean;
  /** Optional learning labels for the positioning bands. */
  showZoneLabels?: boolean;
  /** Actor names are independent from authored text marks. */
  showActorLabels?: boolean;
  /** Temporary endpoint feedback while a ball route is charging. */
  charge?: { pathId: string; point: Point; pace: BoardShotPace; progress: number; marquee: number } | null;
};

type SurfacePalette = {
  surround: string;
  court: string;
  courtAccent: string;
  line: string;
  net: string;
  handle: string;
};

export const BOARD_SURFACE_PALETTES: Record<BoardSurface, SurfacePalette> = {
  hard: { surround: "#08442f", court: "#28684b", courtAccent: "rgba(38,111,88,.28)", line: "#f1f5ed", net: "#b8c8bd", handle: "#235d45" },
  clay: { surround: "#713b2d", court: "#b86647", courtAccent: "rgba(128,62,42,.22)", line: "#fff4e9", net: "#d8c5b9", handle: "#8e4b37" },
  grass: { surround: "#1c472b", court: "#4f7b3f", courtAccent: "rgba(32,88,46,.25)", line: "#f3f5e9", net: "#c3d0be", handle: "#396431" },
};

const COLORS = {
  shot: "#d8ef72", feed: "#f5d693", move: "#9fc9ef", selected: "#ffffff", text: "#eef5ea",
};
const PACE_LABELS: Record<BoardShotPace, string> = { control: "Control", drive: "Drive", "put-away": "Put away" };
const ZONES = {
  defense: "rgba(48,124,168,.26)",
  rally: "rgba(32,151,158,.30)",
  angle: "rgba(3,67,64,.36)",
  pressure: "rgba(151,205,80,.34)",
  attack: "rgba(226,170,67,.38)",
  net: "rgba(222,108,97,.42)",
};
const FONT = '-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif';
const bound = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function getBoardGeometry(width: number, height: number) {
  // Fit the full tactical range, including the run-off areas behind both
  // baselines. The regulation rectangle stays normalized to 0...1 so every
  // existing board keeps the same coordinates.
  const ratio = 1.93;
  // Keep a small playable run-off behind each baseline without letting the
  // defensive band consume the portrait board. This gives the regulation
  // court more of the available screen while preserving off-court movement.
  const runOff = .08;
  const topInset = 8, bottomInset = 8;
  const availableHeight = Math.max(1, height - topInset - bottomInset);
  const courtHeight = Math.max(1, Math.min(availableHeight / (1 + runOff * 2), (width - 28) * ratio));
  const courtWidth = courtHeight / ratio;
  const tacticalHeight = courtHeight * (1 + runOff * 2);
  const court = {
    x: (width - courtWidth) / 2,
    y: topInset + (availableHeight - tacticalHeight) / 2 + courtHeight * runOff,
    width: courtWidth,
    height: courtHeight,
  };
  return {
    court,
    runOff,
    toCanvas: (point: Point): Point => [court.x + point[0] * court.width, court.y + point[1] * court.height],
    fromCanvas: (point: Point): Point => [(point[0] - court.x) / court.width, (point[1] - court.y) / court.height],
    clampPoint: (point: Point): Point => [bound(point[0], -.15, 1.15), bound(point[1], -.15, 1.15)],
  };
}

type Geometry = ReturnType<typeof getBoardGeometry>;

export function pointOnBoardPath(path: Pick<BoardPath, "from" | "to" | "control">, progress: number): Point {
  const t = bound(progress, 0, 1), u = 1 - t;
  if (!path.control) return [path.from[0] * u + path.to[0] * t, path.from[1] * u + path.to[1] * t];
  return [u * u * path.from[0] + 2 * u * t * path.control[0] + t * t * path.to[0], u * u * path.from[1] + 2 * u * t * path.control[1] + t * t * path.to[1]];
}

function line(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, width = 1.5) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.moveTo(...from); ctx.lineTo(...to); ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, at: Point, radius: number, fill: string, stroke?: string, lineWidth = 2) {
  ctx.beginPath(); ctx.arc(at[0], at[1], radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function label(ctx: CanvasRenderingContext2D, text: string, at: Point, size = 12, align: CanvasTextAlign = "center", stroke = "#153e2e") {
  ctx.save(); ctx.font = `600 ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.strokeText(text, ...at);
  ctx.fillStyle = COLORS.text; ctx.fillText(text, ...at); ctx.restore();
}

function fillBand(ctx: CanvasRenderingContext2D, geometry: Geometry, from: number, to: number, color: string) {
  const single = (10.97 - 8.23) / (2 * 10.97);
  const [left, top] = geometry.toCanvas([single, from]);
  const [right, bottom] = geometry.toCanvas([1 - single, to]);
  ctx.fillStyle = color;
  ctx.fillRect(left, top, right - left, bottom - top);
}

function zoneDivider(ctx: CanvasRenderingContext2D, geometry: Geometry, y: number, color: string) {
  const single = (10.97 - 8.23) / (2 * 10.97);
  ctx.save(); ctx.setLineDash([6, 5]);
  line(ctx, geometry.toCanvas([single, y]), geometry.toCanvas([1 - single, y]), color, 1.15);
  ctx.restore();
}

function drawPositioningZones(ctx: CanvasRenderingContext2D, geometry: Geometry, showLabels: boolean, palette: SurfacePalette) {
  const single = (10.97 - 8.23) / (2 * 10.97);
  const service = (23.77 / 2 - 6.4) / 23.77;
  const rallyEnd = .16;
  const attackEnd = .39;
  const mirror = (value: number) => 1 - value;
  const drawHalf = (top: boolean) => {
    const y = (value: number) => top ? value : mirror(value);
    const defenseStart = -geometry.runOff;
    fillBand(ctx, geometry, Math.min(y(defenseStart), y(0)), Math.max(y(defenseStart), y(0)), ZONES.defense);
    fillBand(ctx, geometry, Math.min(y(0), y(rallyEnd)), Math.max(y(0), y(rallyEnd)), ZONES.rally);
    fillBand(ctx, geometry, Math.min(y(rallyEnd), y(service)), Math.max(y(rallyEnd), y(service)), ZONES.pressure);
    fillBand(ctx, geometry, Math.min(y(service), y(attackEnd)), Math.max(y(service), y(attackEnd)), ZONES.attack);
    fillBand(ctx, geometry, Math.min(y(attackEnd), y(.5)), Math.max(y(attackEnd), y(.5)), ZONES.net);

    const leftBase = geometry.toCanvas([single, y(0)]), leftInner = geometry.toCanvas([.31, y(rallyEnd)]), leftOuter = geometry.toCanvas([single, y(rallyEnd)]);
    const rightBase = geometry.toCanvas([1 - single, y(0)]), rightInner = geometry.toCanvas([.69, y(rallyEnd)]), rightOuter = geometry.toCanvas([1 - single, y(rallyEnd)]);
    ctx.fillStyle = ZONES.angle;
    ctx.beginPath(); ctx.moveTo(...leftBase); ctx.lineTo(...leftInner); ctx.lineTo(...leftOuter); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(...rightBase); ctx.lineTo(...rightInner); ctx.lineTo(...rightOuter); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.setLineDash([5, 5]);
    line(ctx, leftBase, leftInner, "rgba(191,224,232,.72)", 1.15);
    line(ctx, rightBase, rightInner, "rgba(191,224,232,.72)", 1.15);
    ctx.restore();

    zoneDivider(ctx, geometry, y(rallyEnd), "rgba(212,236,91,.72)");
    zoneDivider(ctx, geometry, y(attackEnd), "rgba(245,151,73,.72)");

    if (!showLabels) return;
    const zoneLabel = (text: string, point: Point, size = 10) => label(ctx, text, geometry.toCanvas(point), size, "center", palette.surround);
    zoneLabel("DEFENSE", [.5, y(defenseStart / 2)], 10);
    zoneLabel("RALLY", [.5, y(.082)], 10);
    zoneLabel("ANGLE", [.19, y(.09)], 8.5);
    zoneLabel("ANGLE", [.81, y(.09)], 8.5);
    zoneLabel("PRESSURE", [.5, y((rallyEnd + service) / 2)], 9.5);
    zoneLabel("ATTACK", [.5, y((service + attackEnd) / 2)], 9.5);
    zoneLabel("NET / FINISH", [.5, y((attackEnd + .5) / 2)], 9.2);
  };
  drawHalf(true);
  drawHalf(false);
}

function drawSurfaceTexture(ctx: CanvasRenderingContext2D, geometry: Geometry, surface: BoardSurface, palette: SurfacePalette) {
  const { court } = geometry;
  ctx.save(); ctx.beginPath(); ctx.rect(court.x, court.y, court.width, court.height); ctx.clip();
  ctx.strokeStyle = palette.courtAccent;
  if (surface === "grass") {
    const stripe = Math.max(12, court.height / 20);
    ctx.lineWidth = stripe;
    for (let y = court.y + stripe / 2, index = 0; y < court.y + court.height; y += stripe, index += 1) {
      if (index % 2 === 0) line(ctx, [court.x, y], [court.x + court.width, y], palette.courtAccent, stripe);
    }
  } else {
    ctx.lineWidth = .7;
    const gap = surface === "clay" ? 13 : 21;
    for (let y = court.y + gap; y < court.y + court.height; y += gap) {
      line(ctx, [court.x, y], [court.x + court.width, y], palette.courtAccent, .7);
    }
  }
  ctx.restore();
}

function drawCourt(ctx: CanvasRenderingContext2D, geometry: Geometry, surface: BoardSurface, showZones: boolean, showZoneLabels: boolean) {
  const { court, toCanvas: px } = geometry;
  const palette = BOARD_SURFACE_PALETTES[surface];
  ctx.fillStyle = palette.court; ctx.fillRect(court.x, court.y, court.width, court.height);
  drawSurfaceTexture(ctx, geometry, surface, palette);
  if (showZones) drawPositioningZones(ctx, geometry, showZoneLabels, palette);
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1.65; ctx.strokeRect(court.x, court.y, court.width, court.height);
  const single = (10.97 - 8.23) / (2 * 10.97), service = (23.77 / 2 - 6.4) / 23.77;
  line(ctx, px([single, 0]), px([single, 1]), palette.line);
  line(ctx, px([1 - single, 0]), px([1 - single, 1]), palette.line);
  line(ctx, px([single, service]), px([1 - single, service]), palette.line);
  line(ctx, px([single, 1 - service]), px([1 - single, 1 - service]), palette.line);
  line(ctx, px([.5, service]), px([.5, 1 - service]), palette.line);
  line(ctx, px([.5, 0]), px([.5, .015]), palette.line);
  line(ctx, px([.5, .985]), px([.5, 1]), palette.line);
  line(ctx, px([-.045, .5]), px([1.045, .5]), palette.net, 3.5);
  line(ctx, px([-.045, .487]), px([-.045, .513]), palette.line, 3.5);
  line(ctx, px([1.045, .487]), px([1.045, .513]), palette.line, 3.5);
}

function drawArrow(ctx: CanvasRenderingContext2D, tip: Point, tangent: Point, color: string, size = 8) {
  const angle = Math.atan2(tip[1] - tangent[1], tip[0] - tangent[0]);
  ctx.save(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(tip[0] - Math.cos(angle - .55) * size, tip[1] - Math.sin(angle - .55) * size);
  ctx.lineTo(...tip); ctx.lineTo(tip[0] - Math.cos(angle + .55) * size, tip[1] - Math.sin(angle + .55) * size);
  ctx.lineWidth = 2.6; ctx.strokeStyle = color; ctx.stroke(); ctx.restore();
}

function tracePath(ctx: CanvasRenderingContext2D, path: BoardPath, geometry: Geometry, progress = 1) {
  ctx.beginPath(); ctx.moveTo(...geometry.toCanvas(path.from));
  const segments = Math.max(2, Math.ceil(36 * progress));
  for (let i = 1; i <= segments; i++) ctx.lineTo(...geometry.toCanvas(pointOnBoardPath(path, progress * i / segments)));
}

function drawPath(ctx: CanvasRenderingContext2D, path: BoardPath, geometry: Geometry, progress: number, playing: boolean, selected: boolean, opacity = 1) {
  const color = path.kind === "move" ? COLORS.move : path.kind === "feed" ? COLORS.feed : COLORS.shot;
  const paceWidth = path.pace === "put-away" ? 3.7 : path.pace === "drive" ? 3.2 : 2.8;
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = color;
  ctx.setLineDash(path.kind === "move" ? [5, 5] : []); ctx.lineWidth = path.kind === "move" ? 2.2 : paceWidth;
  if (selected) { ctx.save(); ctx.globalAlpha = .24 * opacity; ctx.lineWidth = 9; tracePath(ctx, path, geometry); ctx.stroke(); ctx.restore(); }
  ctx.globalAlpha = (playing ? .2 : .9) * opacity; tracePath(ctx, path, geometry); ctx.stroke();
  if (playing && progress > 0) { ctx.globalAlpha = 1; tracePath(ctx, path, geometry, progress); ctx.stroke(); }
  ctx.globalAlpha = (playing ? .4 : 1) * opacity;
  drawArrow(ctx, geometry.toCanvas(path.to), geometry.toCanvas(pointOnBoardPath(path, .94)), color);
  ctx.restore();
}

function paceColor(path: BoardPath) {
  if (path.pace === "put-away") return "#ee5b4c";
  if (path.pace === "drive") return "#f0d84c";
  return "#45c987";
}

/**
 * A small moving light turns the semantic pace into something a young player
 * can read at a glance. The dot follows the same progress used by playback,
 * so a shorter frame duration visibly means a faster shot rather than merely
 * changing the route's colour.
 */
function drawMarqueeDot(ctx: CanvasRenderingContext2D, path: BoardPath, geometry: Geometry, progress: number) {
  const color = paceColor(path), dotProgress = bound(progress, 0, 1);
  const at = geometry.toCanvas(pointOnBoardPath(path, dotProgress));
  const radius = path.pace === "put-away" ? 6.8 : path.pace === "drive" ? 6.2 : 5.7;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(at[0], at[1], 0, at[0], at[1], radius * 3.2);
  glow.addColorStop(0, "rgba(255,255,255,.98)");
  glow.addColorStop(.18, color);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(at[0], at[1], radius * 3.2, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, at, radius, color, "rgba(255,255,255,.95)", 1.6);
  ctx.restore();
}

function markBounds(mark: BoardMark, geometry: Geometry) {
  const at = geometry.toCanvas(mark.position);
  const width = Math.max(14, (mark.size?.[0] ?? .28) * geometry.court.width);
  const height = Math.max(14, (mark.size?.[1] ?? .12) * geometry.court.height);
  return { at, width, height, left: at[0] - width / 2, top: at[1] - height / 2 };
}

function drawMark(ctx: CanvasRenderingContext2D, mark: BoardMark, geometry: Geometry, selected: boolean, showLabels: boolean) {
  const { at, width, height, left, top } = markBounds(mark, geometry);
  ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (mark.kind === "target") {
    ctx.fillStyle = "rgba(217,239,129,.15)"; ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = selected ? "#fff" : "#d8ec9a"; ctx.lineWidth = selected ? 2 : 1.5; ctx.setLineDash([4, 4]);
    ctx.strokeRect(left, top, width, height); ctx.setLineDash([]);
    if (showLabels) label(ctx, mark.text || "目標區", at, 12);
  } else if (mark.kind === "cone") {
    ctx.fillStyle = "#f2a161"; ctx.strokeStyle = "#fff1cf"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(at[0], at[1] - 9); ctx.lineTo(at[0] + 7, at[1] + 5); ctx.lineTo(at[0] - 7, at[1] + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    line(ctx, [at[0] - 9, at[1] + 7], [at[0] + 9, at[1] + 7], "#f2a161", 3);
  } else if (mark.kind === "basket") {
    ctx.fillStyle = "#375b48"; ctx.fillRect(at[0] - 9, at[1] - 7, 18, 13);
    ctx.strokeStyle = "#e4eacb"; ctx.lineWidth = 1.5; ctx.strokeRect(at[0] - 9, at[1] - 7, 18, 13);
    for (const dx of [-5, 0, 5]) circle(ctx, [at[0] + dx, at[1] - 4], 2.3, COLORS.shot);
    line(ctx, [at[0] - 6, at[1] + 6], [at[0] - 8, at[1] + 13], "#e4eacb");
    line(ctx, [at[0] + 6, at[1] + 6], [at[0] + 8, at[1] + 13], "#e4eacb");
  } else if (mark.kind === "text" && showLabels) {
    label(ctx, mark.text || "提示", at, 13);
  } else if (mark.kind === "freehand" && mark.points?.length) {
    ctx.beginPath(); ctx.moveTo(...geometry.toCanvas(mark.points[0]));
    for (const point of mark.points.slice(1)) ctx.lineTo(...geometry.toCanvas(point));
    ctx.strokeStyle = "#fff2c3"; ctx.lineWidth = 2.4; ctx.stroke();
  }
  if (selected && mark.kind !== "target") {
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    if (mark.kind === "freehand" && mark.points?.length) {
      const points = mark.points.map(geometry.toCanvas), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      ctx.strokeRect(Math.min(...xs) - 7, Math.min(...ys) - 7, Math.max(...xs) - Math.min(...xs) + 14, Math.max(...ys) - Math.min(...ys) + 14);
    } else if (mark.kind === "text") {
      ctx.font = `600 13px ${FONT}`; const textWidth = ctx.measureText(mark.text || "提示").width;
      ctx.strokeRect(at[0] - textWidth / 2 - 6, at[1] - 12, textWidth + 12, 24);
    } else ctx.strokeRect(at[0] - 15, at[1] - 15, 30, 32);
  }
  ctx.restore();
}

function drawHandles(ctx: CanvasRenderingContext2D, path: BoardPath, geometry: Geometry, palette: SurfacePalette) {
  const control: Point = path.control ?? [(path.from[0] + path.to[0]) / 2, (path.from[1] + path.to[1]) / 2];
  ctx.save(); ctx.setLineDash([3, 4]);
  if (path.control) {
    line(ctx, geometry.toCanvas(path.from), geometry.toCanvas(path.control), "rgba(255,255,255,.45)", 1);
    line(ctx, geometry.toCanvas(path.control), geometry.toCanvas(path.to), "rgba(255,255,255,.45)", 1);
  }
  ctx.setLineDash([]);
  circle(ctx, geometry.toCanvas(path.from), 6, palette.handle, "#fff", 2.5);
  circle(ctx, geometry.toCanvas(path.to), 7, COLORS.shot, "#fff", 2.5);
  const at = geometry.toCanvas(control); ctx.fillStyle = palette.handle; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(at[0], at[1] - 7); ctx.lineTo(at[0] + 7, at[1]); ctx.lineTo(at[0], at[1] + 7); ctx.lineTo(at[0] - 7, at[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawChargeFeedback(
  ctx: CanvasRenderingContext2D,
  geometry: Geometry,
  frame: BoardFrame,
  charge: NonNullable<BoardRenderOptions["charge"]>,
) {
  const at = geometry.toCanvas(charge.point);
  const path = frame.paths.find(item => item.id === charge.pathId);
  ctx.save();
  ctx.lineCap = "round";
  if (path) {
    drawMarqueeDot(ctx, { ...path, pace: charge.pace }, geometry, charge.marquee);
    const statusPoint = geometry.toCanvas(pointOnBoardPath(path, .82));
    label(ctx, PACE_LABELS[charge.pace], [statusPoint[0], statusPoint[1] - 13], 8.5, "center", "rgba(4,32,23,.95)");
  } else {
    circle(ctx, at, 7 + charge.progress * 2, "rgba(216,239,114,.18)", "rgba(255,255,255,.92)", 1.5);
  }
  ctx.restore();
}

function drawLegend(ctx: CanvasRenderingContext2D, width: number, height: number, hasFeed: boolean) {
  const entries = hasFeed ? [["球路", COLORS.shot], ["跑位", COLORS.move], ["餵球", COLORS.feed]] : [["球路", COLORS.shot], ["跑位", COLORS.move]];
  const gap = 88, start = (width - entries.length * gap) / 2;
  ctx.save(); ctx.font = `600 13px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  entries.forEach(([text, color], index) => {
    const x = start + index * gap + 5, y = height - 15;
    ctx.setLineDash(text === "跑位" ? [4, 4] : []); line(ctx, [x, y], [x + 25, y], color, 2);
    drawArrow(ctx, [x + 25, y], [x + 15, y], color, 6); ctx.setLineDash([]);
    ctx.fillStyle = COLORS.text; ctx.fillText(text, x + 32, y);
  }); ctx.restore();
}

/** Draw in CSS pixels; the caller owns the backing-store DPR transform. */
export function renderBoard(ctx: CanvasRenderingContext2D, width: number, height: number, frame: BoardFrame, actors: BoardActor[], options: BoardRenderOptions = {}) {
  if (width <= 0 || height <= 0) return;
  const preferences = getBoardDisplayPreferences();
  const surface = options.surface ?? preferences.surface;
  const palette = BOARD_SURFACE_PALETTES[surface];
  const showZones = options.showZones ?? preferences.showZones;
  const showZoneLabels = options.showZoneLabels ?? preferences.showZoneLabels;
  const geometry = getBoardGeometry(width, height), progress = bound(options.progress ?? options.playingProgress ?? 0, 0, 1);
  const selected = options.playing ? null : options.selection;
  ctx.save(); ctx.clearRect(0, 0, width, height); ctx.fillStyle = palette.surround; ctx.fillRect(0, 0, width, height);
  drawCourt(ctx, geometry, surface, showZones, showZoneLabels);
  for (const path of options.contextPaths ?? []) {
    // The preceding beat must remain legible on a small court. Movement stays
    // slightly quieter so the newest ball route remains the primary signal.
    const isSelected = selected?.kind === "element" && selected.id === path.id
      && (selected.frameIndex === undefined || selected.frameIndex === options.contextFrameIndex);
    drawPath(ctx, path, geometry, 1, false, isSelected, path.kind === "move" ? .82 : .94);
  }
  for (const mark of frame.marks) drawMark(ctx, mark, geometry, selected?.kind === "element" && selected.id === mark.id, options.showLabels !== false);
  for (const path of frame.paths) drawPath(ctx, path, geometry, progress, !!options.playing, selected?.kind === "element" && selected.id === path.id);
  const poses = getFramePose(frame, progress);
  for (const actor of [...actors].sort((a, b) => Number(a.kind === "ball") - Number(b.kind === "ball"))) {
    const pose = poses[actor.id]; if (!pose) continue;
    const at = geometry.toCanvas(pose), isBall = actor.kind === "ball", radius = isBall ? 5.5 : 10.5;
    if (selected?.kind === "actor" && selected.id === actor.id) circle(ctx, at, radius + 6, "rgba(255,255,255,.13)", "rgba(255,255,255,.85)", 1.5);
    circle(ctx, at, radius, actor.color ?? (isBall ? COLORS.shot : "#58a5ec"), palette.line, isBall ? 1.7 : 2.2);
    if (!isBall && (options.showActorLabels ?? options.showLabels !== false) && actor.label) {
      const dy = pose[1] < .5 ? 26 : -31;
      label(ctx, actor.label, [at[0], bound(at[1] + dy, 12, height - 38)], 13, "center", palette.surround);
    }
  }
  if (selected?.kind === "element") {
    const path = frame.paths.find(item => item.id === selected.id)
      ?? (selected.frameIndex === undefined || selected.frameIndex === options.contextFrameIndex
        ? options.contextPaths?.find(item => item.id === selected.id)
        : undefined);
    if (path) drawHandles(ctx, path, geometry, palette);
  }
  if (options.charge) drawChargeFeedback(ctx, geometry, frame, options.charge);
  if (options.showLegend !== false) drawLegend(ctx, width, height, frame.paths.some(path => path.kind === "feed") || !!options.contextPaths?.some(path => path.kind === "feed"));
  ctx.restore();
}

function pointToSegment(point: Point, from: Point, to: Point) {
  const dx = to[0] - from[0], dy = to[1] - from[1], length = dx * dx + dy * dy;
  const t = length ? bound(((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / length, 0, 1) : 0;
  return distance(point, [from[0] + t * dx, from[1] + t * dy]);
}

function distanceToPath(point: Point, path: BoardPath, geometry: Geometry) {
  let minimum = Infinity, previous = geometry.toCanvas(path.from);
  for (let i = 1; i <= 40; i++) { const next = geometry.toCanvas(pointOnBoardPath(path, i / 40)); minimum = Math.min(minimum, pointToSegment(point, previous, next)); previous = next; }
  return minimum;
}

/** Selection handles take priority, then actors, then visible objects and routes. */
export function hitTestBoard(
  pixel: Point,
  width: number,
  height: number,
  frame: BoardFrame,
  actors: BoardActor[],
  selection?: BoardSelection | null,
  options: BoardHitTestOptions = {},
): BoardHit | null {
  const { contextPaths = [], contextFrameIndex } = options;
  const geometry = getBoardGeometry(width, height);
  const minimumTouchRadius = 22;
  if (selection?.kind === "element") {
    const path = frame.paths.find(item => item.id === selection.id)
      ?? (selection.frameIndex === undefined || selection.frameIndex === contextFrameIndex
        ? contextPaths.find(item => item.id === selection.id)
        : undefined);
    if (path) {
      const midpoint: Point = [(path.from[0] + path.to[0]) / 2, (path.from[1] + path.to[1]) / 2];
      const handlePoints = { from: path.from, to: path.to, control: path.control ?? midpoint };
      const handles = (["from", "to", "control"] as const).map(handle => ({ handle, distance: distance(pixel, geometry.toCanvas(handlePoints[handle])) })).sort((a, b) => a.distance - b.distance);
      if (handles[0] && handles[0].distance <= 24) return {
        kind: "handle",
        id: path.id,
        handle: handles[0].handle,
        ...(frame.paths.includes(path) || contextFrameIndex === undefined ? {} : { frameIndex: contextFrameIndex }),
      };
    }
  }
  const actorHit = actors.flatMap(actor => frame.poses[actor.id] ? [{ actor, distance: distance(pixel, geometry.toCanvas(frame.poses[actor.id])) }] : [])
    .filter(item => item.distance <= 24)
    .sort((a, b) => Number(selection?.kind === "actor" && selection.id === b.actor.id) - Number(selection?.kind === "actor" && selection.id === a.actor.id) || a.distance - b.distance)[0];
  if (actorHit) return { kind: "actor", id: actorHit.actor.id };
  for (const mark of [...frame.marks].reverse()) {
    const { at, width: mw, height: mh } = markBounds(mark, geometry);
    let hit = false;
    if (mark.kind === "target") hit = Math.abs(pixel[0] - at[0]) <= Math.max(minimumTouchRadius, mw / 2 + 8) && Math.abs(pixel[1] - at[1]) <= Math.max(minimumTouchRadius, mh / 2 + 8);
    else if (mark.kind === "text") hit = Math.abs(pixel[0] - at[0]) <= Math.max(minimumTouchRadius, (mark.text || "提示").length * 7) && Math.abs(pixel[1] - at[1]) <= minimumTouchRadius;
    else if (mark.kind === "freehand" && mark.points?.length) {
      const points = mark.points.map(geometry.toCanvas);
      hit = points.length === 1 ? distance(pixel, points[0]) <= minimumTouchRadius : points.slice(1).some((point, index) => pointToSegment(pixel, points[index], point) <= minimumTouchRadius);
    } else hit = distance(pixel, at) <= 22;
    if (hit) return { kind: "element", id: mark.id };
  }
  const pathHit = frame.paths.map(path => ({ path, distance: distanceToPath(pixel, path, geometry) })).filter(item => item.distance <= minimumTouchRadius).sort((a, b) => a.distance - b.distance)[0];
  if (pathHit) return { kind: "element", id: pathHit.path.id };
  const contextPathHit = contextFrameIndex === undefined
    ? null
    : contextPaths.map(path => ({ path, distance: distanceToPath(pixel, path, geometry) }))
      .filter(item => item.distance <= minimumTouchRadius)
      .sort((a, b) => a.distance - b.distance)[0];
  if (contextPathHit) return { kind: "element", id: contextPathHit.path.id, frameIndex: contextFrameIndex };
  return null;
}

function wrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines = 2) {
  let lineText = "", lineNumber = 0;
  for (const char of text) {
    if (ctx.measureText(lineText + char).width > width && lineText) {
      ctx.fillText(lineText, x, y + lineNumber * lineHeight); lineText = char; lineNumber++;
      if (lineNumber >= maxLines) return;
    } else lineText += char;
  }
  if (lineText) ctx.fillText(lineText, x, y + lineNumber * lineHeight);
}

/** A readable 3× PNG with title, current phase and ball/movement legend. */
export async function exportBoardPng(board: BoardDocument, frameIndex = 0): Promise<Blob> {
  const frame = board.frames[bound(frameIndex, 0, board.frames.length - 1)];
  if (!frame) throw new Error("沒有可匯出的拍次");
  const width = 420, boardHeight = 640, headerHeight = 105, footerHeight = 60, scale = 3;
  const canvas = document.createElement("canvas"); canvas.width = width * scale; canvas.height = (headerHeight + boardHeight + footerHeight) * scale;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("無法建立畫板圖片");
  ctx.scale(scale, scale); ctx.fillStyle = "#f7f8f4"; ctx.fillRect(0, 0, width, headerHeight + boardHeight + footerHeight);
  ctx.fillStyle = "#173d2c"; ctx.textBaseline = "top"; ctx.font = `700 21px ${FONT}`;
  wrappedText(ctx, board.title, 24, 20, width - 48, 27);
  ctx.font = `500 13px ${FONT}`; ctx.fillStyle = "#567060";
  ctx.fillText(`第 ${board.frames.indexOf(frame) + 1} / ${board.frames.length} 拍 · ${frame.label}`, 24, 78, width - 48);
  ctx.save(); ctx.translate(0, headerHeight); renderBoard(ctx, width, boardHeight, frame, board.actors, { progress: 0, showLegend: true }); ctx.restore();
  ctx.fillStyle = "#173d2c"; ctx.font = `600 13px ${FONT}`; ctx.fillText("戰術畫板", 24, headerHeight + boardHeight + 16);
  ctx.fillStyle = "#637464"; ctx.font = `400 12px ${FONT}`; ctx.fillText("看清球路，練好下一拍", 24, headerHeight + boardHeight + 36);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("無法匯出畫板圖片")), "image/png"));
}
