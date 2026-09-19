import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ResetIcon } from "@radix-ui/react-icons";

import { prepareBoardForMedia } from "../board/media";
import { createStarterBoard, getBoardDuration, getBoardPose, type BoardDocument } from "../board/model";
import { renderBoard } from "../board/render";

const AUTO_PLAY_DELAY_MS = 400;
const PLAYBACK_FRAME_INTERVAL_MS = 1000 / 30;
const MAX_HOME_PREVIEW_SECONDS = 10;
const FLOW_CURRENT_SELECTOR = ".flow-screen";

export type HomeBoardPlaybackState = "idle" | "playing" | "paused" | "finished";

export type HomeBoardPlaybackProps = {
  /** The newest real saved board that contains at least one playable path. */
  board: BoardDocument | null;
  /** Whether the current surface is allowed to animate. */
  active: boolean;
  /** Opens the original editable document, not the trimmed playback copy. */
  onOpenBoard: (board: BoardDocument, persisted: boolean) => void;
  /** Keep replay available for surfaces that have room for an extra control. */
  showReplay?: boolean;
  className?: string;
};

function hasPlayablePath(board: BoardDocument) {
  return board.frames.some((frame) => frame.paths.some((path) => (
    path.kind === "shot" || path.kind === "feed" || path.kind === "move"
  )));
}

function updatedAtValue(board: BoardDocument) {
  const value = Date.parse(board.updatedAt);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/**
 * Choose the newest usable saved board without assuming the input order.
 * Untouched smart-authoring tails are removed before checking for real paths.
 */
export function findLatestPlayableBoard(boards: readonly BoardDocument[]): BoardDocument | null {
  let newest: BoardDocument | null = null;
  let newestUpdatedAt = Number.NEGATIVE_INFINITY;

  boards.forEach((board) => {
    const playbackBoard = prepareBoardForMedia(board);
    if (!hasPlayablePath(playbackBoard)) return;
    const updatedAt = updatedAtValue(board);
    if (newest === null || updatedAt > newestUpdatedAt) {
      newest = board;
      newestUpdatedAt = updatedAt;
    }
  });

  return newest;
}

function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomeBoardPlayback({ board, active, onOpenBoard, showReplay = true, className = "" }: HomeBoardPlaybackProps) {
  const fallbackBoard = useMemo(() => createStarterBoard("我的战术板"), []);
  const savedPlaybackBoard = useMemo(() => board ? prepareBoardForMedia(board) : null, [board]);
  const isSavedBoard = !!savedPlaybackBoard && hasPlayablePath(savedPlaybackBoard);
  const sourceBoard = isSavedBoard && board ? board : fallbackBoard;
  const playbackBoard = isSavedBoard && savedPlaybackBoard ? savedPlaybackBoard : fallbackBoard;
  const duration = useMemo(() => getBoardDuration(playbackBoard), [playbackBoard]);
  const playbackRate = duration > MAX_HOME_PREVIEW_SECONDS ? duration / MAX_HOME_PREVIEW_SECONDS : 1;
  const canPlay = isSavedBoard && duration > 0;
  const boardKey = isSavedBoard && board ? `${board.id}:${board.updatedAt}` : "starter";
  const actorsWithoutLabels = useMemo(
    () => playbackBoard.actors.map((actor) => ({ ...actor, label: "" })),
    [playbackBoard.actors],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsedRef = useRef(canPlay ? 0 : duration);
  const requestRef = useRef<number | null>(null);
  const delayRef = useRef<number | null>(null);
  const runRef = useRef(0);
  const explicitReplayRef = useRef(false);
  const mountedRef = useRef(true);
  const waitingRef = useRef(false);
  const resumeWhenVisibleRef = useRef(false);
  const previousSessionActiveRef = useRef(false);
  const previousSurfaceVisibleRef = useRef(false);
  const previousBoardKeyRef = useRef("");

  const [playbackState, setPlaybackState] = useState<HomeBoardPlaybackState>("idle");
  const [flowCurrent, setFlowCurrent] = useState(true);
  const [intersecting, setIntersecting] = useState(true);
  const [visible, setVisible] = useState(isDocumentVisible);
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);
  const [replayRequest, setReplayRequest] = useState(0);
  const playbackStateRef = useRef<HomeBoardPlaybackState>("idle");

  const publishPlaybackState = useCallback((state: HomeBoardPlaybackState) => {
    playbackStateRef.current = state;
    if (mountedRef.current) setPlaybackState(state);
  }, []);

  const cancelScheduledPlayback = useCallback(() => {
    runRef.current += 1;
    if (requestRef.current !== null) {
      window.cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    if (delayRef.current !== null) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }
  }, []);

  const drawAt = useCallback((elapsedSeconds: number) => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return;
    const pose = getBoardPose(playbackBoard, elapsedSeconds);
    const frame = playbackBoard.frames[pose.frameIndex];
    if (!frame) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    // Draw with the same upright coordinate system as the editor. The canvas
    // backing store follows this stage's real dimensions, so the court stays
    // sharp and no portrait image is stretched into a thumbnail.
    renderBoard(context, width, height, frame, actorsWithoutLabels, {
      progress: pose.progress,
      playing: canPlay,
      showLegend: false,
      showLabels: false,
    });
  }, [actorsWithoutLabels, canPlay, playbackBoard]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const drawCurrent = () => drawAt(elapsedRef.current);
    drawCurrent();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(drawCurrent);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [drawAt]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const screen = root.closest<HTMLElement>(FLOW_CURRENT_SELECTOR);
    if (!screen) {
      setFlowCurrent(true);
      return;
    }

    const sync = () => setFlowCurrent(screen.dataset.flowCurrent === "true");
    sync();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(sync);
    observer.observe(screen, { attributes: true, attributeFilter: ["data-flow-current"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setIntersecting(!!entry?.isIntersecting && entry.intersectionRatio >= 0.2),
      { threshold: [0, 0.2] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setVisible(isDocumentVisible());
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    const wasWaiting = waitingRef.current;
    cancelScheduledPlayback();
    waitingRef.current = false;
    const run = runRef.current;
    const explicitReplay = explicitReplayRef.current;
    const sessionActive = active && flowCurrent;
    const surfaceVisible = intersecting && visible;
    const sessionBecameActive = sessionActive && !previousSessionActiveRef.current;
    const surfaceBecameVisible = surfaceVisible && !previousSurfaceVisibleRef.current;
    const boardChanged = previousBoardKeyRef.current !== boardKey;
    const shouldResume = playbackStateRef.current === "playing"
      || playbackStateRef.current === "paused"
      || wasWaiting
      || resumeWhenVisibleRef.current;

    previousSessionActiveRef.current = sessionActive;
    previousSurfaceVisibleRef.current = surfaceVisible;
    previousBoardKeyRef.current = boardKey;

    if (!canPlay) {
      explicitReplayRef.current = false;
      elapsedRef.current = duration;
      drawAt(duration);
      resumeWhenVisibleRef.current = false;
      publishPlaybackState("idle");
      return;
    }

    if (!sessionActive) {
      explicitReplayRef.current = false;
      elapsedRef.current = 0;
      drawAt(0);
      resumeWhenVisibleRef.current = false;
      publishPlaybackState("idle");
      return;
    }

    if (!surfaceVisible) {
      if (boardChanged || explicitReplay) elapsedRef.current = 0;
      resumeWhenVisibleRef.current = boardChanged || explicitReplay || shouldResume;
      drawAt(elapsedRef.current);
      if (playbackStateRef.current === "playing") publishPlaybackState("paused");
      return;
    }

    if (explicitReplay) {
      explicitReplayRef.current = false;
      elapsedRef.current = 0;
    }

    if (reduceMotion && !explicitReplay) {
      elapsedRef.current = duration;
      drawAt(duration);
      resumeWhenVisibleRef.current = false;
      publishPlaybackState("finished");
      return;
    }

    const restart = explicitReplay || boardChanged || sessionBecameActive;
    const resume = !restart && surfaceBecameVisible && shouldResume;
    if (!restart && !resume) return;

    resumeWhenVisibleRef.current = false;
    if (restart) elapsedRef.current = 0;
    drawAt(elapsedRef.current);
    if (restart && !explicitReplay) publishPlaybackState("idle");

    const start = () => {
      if (runRef.current !== run || !mountedRef.current) return;
      waitingRef.current = false;
      const startedAt = performance.now();
      const cycleStartedAt = startedAt;
      const cycleInitialElapsed = elapsedRef.current;
      let lastDrawnAt = Number.NEGATIVE_INFINITY;
      publishPlaybackState("playing");

      const tick = (now: number) => {
        if (runRef.current !== run || !mountedRef.current) return;
        if (now - lastDrawnAt >= PLAYBACK_FRAME_INTERVAL_MS) {
          const elapsed = Math.min(duration, Math.max(0, cycleInitialElapsed + ((now - cycleStartedAt) / 1000) * playbackRate));
          elapsedRef.current = elapsed;
          drawAt(elapsed);
          lastDrawnAt = now;
          if (elapsed >= duration) {
            requestRef.current = null;
            publishPlaybackState("finished");
            return;
          }
        }
        requestRef.current = window.requestAnimationFrame(tick);
      };

      requestRef.current = window.requestAnimationFrame(tick);
    };

    if (explicitReplay || resume) start();
    else {
      waitingRef.current = true;
      delayRef.current = window.setTimeout(start, AUTO_PLAY_DELAY_MS);
    }

    return cancelScheduledPlayback;
  }, [active, boardKey, canPlay, cancelScheduledPlayback, drawAt, duration, flowCurrent, intersecting, playbackRate, publishPlaybackState, reduceMotion, replayRequest, visible]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelScheduledPlayback();
    };
  }, [cancelScheduledPlayback]);

  const replay = () => {
    if (!canPlay) return;
    explicitReplayRef.current = true;
    setReplayRequest((request) => request + 1);
  };

  const classes = ["home-board-playback", className].filter(Boolean).join(" ");

  return <div
    ref={rootRef}
    className={classes}
    data-board-id={isSavedBoard ? sourceBoard.id : "starter"}
    data-has-saved-board={isSavedBoard ? "true" : "false"}
    data-playback-state={playbackState}
  >
    <button
      ref={stageRef}
      type="button"
      className="home-board-playback-stage"
      data-testid="home-board-open"
      aria-label={isSavedBoard ? `打开${sourceBoard.title}` : "画第一拍，从发球站位开始"}
      onClick={() => onOpenBoard(sourceBoard, isSavedBoard)}
    >
      <canvas
        ref={canvasRef}
        data-testid="home-board-playback"
        data-board-id={isSavedBoard ? sourceBoard.id : "starter"}
        data-playback-state={playbackState}
        aria-hidden="true"
      />
    </button>
    {canPlay && showReplay ? <button
      type="button"
      className="home-board-playback-replay"
      aria-label="重新播放"
      onClick={replay}
    ><ResetIcon aria-hidden="true"/><span>重播</span></button> : null}
  </div>;
}
