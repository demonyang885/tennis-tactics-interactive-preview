import { isPendingResponsePath, type BoardDocument } from "./model";
import type { BoardSelection } from "./render";

export const BOARD_EDITOR_VIEW_STORAGE_KEY = "rallypath:board-editor-view:v1";

export type BoardEditorView = {
  frameIndex: number;
  selection: BoardSelection | null;
  automaticRouteSelection: boolean;
};

type StoredSelection =
  | { kind: "actor"; id: string }
  | { kind: "element"; id: string; frameId: string }
  | null;
type StoredView = { boardId: string; frameId: string; selection: StoredSelection; automaticRouteSelection?: boolean };

const MAX_RECORDS = 50;
const MAX_ID_LENGTH = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function parseSelection(value: unknown): StoredSelection {
  if (!isRecord(value) || !isId(value.id)) return null;
  if (value.kind === "actor") return { kind: "actor", id: value.id };
  if (value.kind === "element" && isId(value.frameId)) {
    return { kind: "element", id: value.id, frameId: value.frameId };
  }
  return null;
}

function readRecords(storage: Pick<Storage, "getItem">): StoredView[] {
  try {
    const serialized = storage.getItem(BOARD_EDITOR_VIEW_STORAGE_KEY);
    if (!serialized) return [];
    const envelope: unknown = JSON.parse(serialized);
    if (!isRecord(envelope) || envelope.version !== 1 || !Array.isArray(envelope.records)) return [];
    const records: StoredView[] = [];
    // The end of the array holds the most recently written views.
    for (const candidate of envelope.records.slice(-MAX_RECORDS)) {
      if (!isRecord(candidate) || !isId(candidate.boardId) || !isId(candidate.frameId)) continue;
      const duplicate = records.findIndex(record => record.boardId === candidate.boardId);
      if (duplicate >= 0) records.splice(duplicate, 1);
      records.push({ boardId: candidate.boardId, frameId: candidate.frameId, selection: parseSelection(candidate.selection),
        automaticRouteSelection: candidate.automaticRouteSelection === true });
    }
    return records;
  } catch {
    return [];
  }
}

/** Match the explicit v2 cursor that makes the preceding beat editable. */
function isSmartTail(board: BoardDocument, frameIndex: number): boolean {
  const smart = board.smartRally, frame = board.frames[frameIndex];
  if (!smart || smart.version !== 2 || !frame || frameIndex !== board.frames.length - 1
    || smart.frameId !== frame.id
    || !frame.paths.every(path => isPendingResponsePath(path, board.frames[frameIndex - 1], smart.hitterId, board.actors))) return false;
  const players = board.actors.filter(actor => actor.kind === "player");
  const balls = board.actors.filter(actor => actor.kind === "ball");
  const actor = board.actors.find(candidate => candidate.id === smart.actorId);
  if (players.length !== 2 || balls.length !== 1 || !players.some(player => player.id === smart.hitterId)
    || !actor || !frame.poses[actor.id]) return false;
  const previousHasShot = frameIndex > 0 && board.frames[frameIndex - 1].paths.some(path =>
    path.actorId === balls[0].id && (path.kind === "shot" || path.kind === "feed"));
  if (smart.phase === "move") return previousHasShot && actor.kind === "player" && actor.id === smart.hitterId;
  return smart.phase === "shot" && actor.kind === "ball"
    && (!board.frames.slice(0, frameIndex).some(candidate => candidate.paths.length > 0) || previousHasShot);
}

function resolveSelection(board: BoardDocument, frameIndex: number, selection: StoredSelection): BoardSelection | null {
  if (!selection) return null;
  const frame = board.frames[frameIndex];
  if (selection.kind === "actor") {
    return board.actors.some(actor => actor.id === selection.id) && frame.poses[selection.id]
      ? { kind: "actor", id: selection.id } : null;
  }
  const sourceIndex = board.frames.findIndex(candidate => candidate.id === selection.frameId);
  const source = board.frames[sourceIndex];
  if (!source) return null;
  if (sourceIndex === frameIndex) {
    return source.paths.some(path => path.id === selection.id) || source.marks.some(mark => mark.id === selection.id)
      ? { kind: "element", id: selection.id } : null;
  }
  return sourceIndex === frameIndex - 1 && isSmartTail(board, frameIndex)
    && source.paths.some(path => path.id === selection.id)
    ? { kind: "element", id: selection.id, frameIndex: sourceIndex } : null;
}

/** Device-local editing focus; absent or deleted frames fall back to normal opening. */
export function readBoardEditorView(board: BoardDocument): BoardEditorView | null {
  if (typeof window === "undefined") return null;
  try {
    const record = readRecords(window.localStorage).find(candidate => candidate.boardId === board.id);
    if (!record) return null;
    const frameIndex = board.frames.findIndex(frame => frame.id === record.frameId);
    if (frameIndex < 0) return null;
    const selection = resolveSelection(board, frameIndex, record.selection);
    return { frameIndex, selection, automaticRouteSelection: record.automaticRouteSelection === true
      && selection?.kind === "element" && selection.frameIndex !== undefined };
  } catch {
    return null;
  }
}

/** Keep stable IDs only, without modifying tactic content or playback settings. */
export function writeBoardEditorView(board: BoardDocument, frameIndex: number, selection: BoardSelection | null, automaticRouteSelection = false): void {
  if (typeof window === "undefined" || !Number.isInteger(frameIndex)) return;
  const frame = board.frames[frameIndex];
  if (!frame || !isId(board.id) || !isId(frame.id)) return;
  let storedSelection: StoredSelection = null;
  if (selection?.kind === "actor" && isId(selection.id)) {
    storedSelection = { kind: "actor", id: selection.id };
  } else if (selection?.kind === "element" && isId(selection.id)) {
    const source = board.frames[selection.frameIndex ?? frameIndex];
    if (source && isId(source.id)) storedSelection = { kind: "element", id: selection.id, frameId: source.id };
  }
  // A deleted object clears focus while preserving the still-valid frame.
  if (!resolveSelection(board, frameIndex, storedSelection)) storedSelection = null;
  try {
    const storage = window.localStorage;
    const records = readRecords(storage).filter(record => record.boardId !== board.id);
    records.push({ boardId: board.id, frameId: frame.id, selection: storedSelection,
      automaticRouteSelection: automaticRouteSelection && storedSelection?.kind === "element" });
    storage.setItem(BOARD_EDITOR_VIEW_STORAGE_KEY, JSON.stringify({ version: 1, records: records.slice(-MAX_RECORDS) }));
  } catch {
    // Optional resume preferences must never interrupt board editing.
  }
}
