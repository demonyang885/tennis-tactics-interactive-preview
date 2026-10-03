import { createStarterBoard, type BoardDocument, type Point } from "./model";

export const OPENINGS = [
  { id: "serve-deuce", label: "一区发球", me: [.64, 1.02], opponent: [.28, -.02], server: "me" },
  { id: "serve-ad", label: "二区发球", me: [.36, 1.02], opponent: [.72, -.02], server: "me" },
  { id: "return-deuce", label: "一区接发", me: [.72, 1.02], opponent: [.36, -.02], server: "opponent" },
  { id: "return-ad", label: "二区接发", me: [.28, 1.02], opponent: [.64, -.02], server: "opponent" },
] as const;
export type OpeningId = typeof OPENINGS[number]["id"];

/** Explicit replacement, called only after the editor's authored-content confirmation. */
export function applyOpening(board: BoardDocument, id: OpeningId): BoardDocument {
  const opening = OPENINGS.find(item => item.id === id)!;
  const starter = createStarterBoard(board.title);
  const me = starter.actors.find(actor => actor.label === "我方")!;
  const opponent = starter.actors.find(actor => actor.label === "对手")!;
  const ball = starter.actors.find(actor => actor.kind === "ball")!;
  const server = opening.server === "me" ? me : opponent;
  const serverPoint = opening.server === "me" ? opening.me : opening.opponent;
  const ballPoint: Point = [serverPoint[0], serverPoint[1] + (opening.server === "me" ? -.04 : .04)];
  return {
    ...starter, id: board.id, ...(board.purpose ? { purpose: board.purpose } : {}),
    frames: [{ ...starter.frames[0], label: `第 1 拍 · ${opening.label}`, poses: {
      [me.id]: [...opening.me], [opponent.id]: [...opening.opponent], [ball.id]: ballPoint,
    } }],
    smartRally: { ...starter.smartRally!, hitterId: server.id },
  };
}
