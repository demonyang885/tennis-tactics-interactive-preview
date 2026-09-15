import { getBoardDuration, getBoardPose, isUntouchedSmartTail, type BoardDocument } from "./model";
import { renderBoard } from "./render";
import {
  createFrameTimeline,
  pickVideoEncoding as pickCoreVideoEncoding,
  requireMediaDuration,
  type VideoEncoding,
} from "./media-core.js";

export type BoardMediaExport = {
  blob: Blob;
  name: string;
  format: "video" | "gif";
  mimeType: string;
  extension: "mp4" | "webm" | "gif";
  duration: number;
};

export type BoardMediaExportOptions = {
  maxDurationSeconds?: number;
  fps?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 1280;
const GIF_WIDTH = 360;
const GIF_HEIGHT = 640;
const LOGICAL_WIDTH = 420;
const HEADER_HEIGHT = 100;
const FOOTER_HEIGHT = 57;
const FONT = '-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif';

function abortError() {
  return new DOMException("已取消导出", "AbortError");
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

type GifWorkerCommand =
  | { type: "init"; requestId: number; width: number; height: number; loopCount: number }
  | { type: "frame"; requestId: number; rgba: ArrayBuffer; delayCentiseconds: number }
  | { type: "finish"; requestId: number };

type GifWorkerReply =
  | { requestId: number; ok: true; bytes?: ArrayBuffer }
  | { requestId: number; ok: false; error: string };

function requestGifWorker(
  worker: Worker,
  command: GifWorkerCommand,
  transfer: Transferable[],
  signal?: AbortSignal,
) {
  checkAborted(signal);
  return new Promise<GifWorkerReply & { ok: true }>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason instanceof Error || reason instanceof DOMException ? reason : new Error("GIF 编码失败"));
    };
    const onMessage = (event: MessageEvent<GifWorkerReply>) => {
      if (event.data.requestId !== command.requestId) return;
      if (!event.data.ok) {
        fail(new Error(event.data.error));
        return;
      }
      settled = true;
      cleanup();
      resolve(event.data);
    };
    const onError = (event: ErrorEvent) => fail(new Error(event.message || "GIF Worker 执行失败"));
    const onMessageError = () => fail(new Error("GIF Worker 返回了无法读取的数据"));
    const onAbort = () => {
      worker.terminate();
      fail(abortError());
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      worker.postMessage(command, transfer);
    } catch (error) {
      fail(error);
    }
  });
}

function reportProgress(callback: BoardMediaExportOptions["onProgress"], progress: number) {
  try {
    callback?.(Math.max(0, Math.min(1, progress)));
  } catch {
    // Progress display must never invalidate a completed export.
  }
}

function safeFileStem(title: string) {
  const stem = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
  return stem || "RallyPath-战术";
}

function mediaName(board: BoardDocument, extension: BoardMediaExport["extension"]) {
  return `${safeFileStem(board.title)}-战术回放.${extension}`;
}

function videoExtension(mimeType: string, fallback: "mp4" | "webm") {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4")) return "mp4" as const;
  if (normalized.includes("webm")) return "webm" as const;
  return fallback;
}

/** Remove only an untouched, generated v2 editing tail; authored frames stay intact. */
export function prepareBoardForMedia(board: BoardDocument): BoardDocument {
  if (!isUntouchedSmartTail(board)) return board;
  const { smartRally: _smartRally, ...withoutCursor } = board;
  return { ...withoutCursor, frames: board.frames.slice(0, -1) };
}

/** Report the actual video container this browser can record. */
export function pickVideoEncoding(): VideoEncoding | null {
  if (typeof MediaRecorder === "undefined") return null;
  return pickCoreVideoEncoding(MediaRecorder.isTypeSupported.bind(MediaRecorder));
}

function createCanvas(width: number, height: number) {
  if (typeof document === "undefined") throw new Error("此环境无法生成分享媒体");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function fitTitle(ctx: CanvasRenderingContext2D, title: string, maximumWidth: number) {
  if (ctx.measureText(title).width <= maximumWidth) return title;
  let text = title;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > maximumWidth) text = text.slice(0, -1);
  return `${text}…`;
}

/** Render one 9:16 share frame by reusing the canonical board pose and renderer. */
export function renderBoardShareFrame(
  ctx: CanvasRenderingContext2D,
  board: BoardDocument,
  elapsedSeconds: number,
  duration = getBoardDuration(board),
) {
  const canvas = ctx.canvas;
  const scale = canvas.width / LOGICAL_WIDTH;
  const logicalHeight = canvas.height / scale;
  const boardHeight = logicalHeight - HEADER_HEIGHT - FOOTER_HEIGHT;
  const pose = getBoardPose(board, elapsedSeconds);
  const frame = board.frames[pose.frameIndex];

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, LOGICAL_WIDTH, logicalHeight);
  ctx.fillStyle = "#f7f8f4";
  ctx.fillRect(0, 0, LOGICAL_WIDTH, logicalHeight);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#173d2c";
  ctx.font = `700 21px ${FONT}`;
  ctx.fillText(fitTitle(ctx, board.title, LOGICAL_WIDTH - 48), 24, 20);
  ctx.fillStyle = "#5c7062";
  ctx.font = `500 13px ${FONT}`;
  const elapsed = Math.max(0, Math.min(duration, elapsedSeconds));
  ctx.fillText(`第 ${pose.frameIndex + 1} / ${board.frames.length} 拍 · ${elapsed.toFixed(1)} / ${duration.toFixed(1)} 秒`, 24, 62);
  ctx.fillText(frame.label, 24, 80, LOGICAL_WIDTH - 48);

  ctx.save();
  ctx.translate(0, HEADER_HEIGHT);
  renderBoard(ctx, LOGICAL_WIDTH, boardHeight, frame, board.actors, {
    progress: pose.progress,
    playing: true,
    showLegend: true,
  });
  ctx.restore();

  ctx.fillStyle = "#173d2c";
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText("战术画板", 24, HEADER_HEIGHT + boardHeight + 13);
  ctx.fillStyle = "#637464";
  ctx.font = `400 12px ${FONT}`;
  ctx.fillText("看清球路，练好下一拍", 24, HEADER_HEIGHT + boardHeight + 33);
}

function makeRecorder(stream: MediaStream) {
  const supported = pickVideoEncoding();
  if (!supported) throw new Error("当前浏览器不支持视频导出，可改用 GIF");
  try {
    return { recorder: new MediaRecorder(stream, { mimeType: supported.mimeType, videoBitsPerSecond: 2_800_000 }), encoding: supported };
  } catch (error) {
    if (supported.extension !== "mp4") throw error;
    const fallback = pickCoreVideoEncoding(mimeType => !mimeType.includes("mp4") && MediaRecorder.isTypeSupported(mimeType));
    if (!fallback) throw error;
    return { recorder: new MediaRecorder(stream, { mimeType: fallback.mimeType, videoBitsPerSecond: 2_800_000 }), encoding: fallback };
  }
}

export async function exportBoardVideo(
  sourceBoard: BoardDocument,
  options: BoardMediaExportOptions = {},
): Promise<BoardMediaExport> {
  checkAborted(options.signal);
  const board = prepareBoardForMedia(sourceBoard);
  if (!board.frames.length || !board.frames.some(frame => frame.paths.length > 0)) throw new Error("请先加入至少一条球路或跑位");
  const duration = requireMediaDuration(getBoardDuration(board), options.maxDurationSeconds ?? 30, "视频");
  const fps = Math.max(12, Math.min(60, Math.round(options.fps ?? 30)));
  const canvas = createCanvas(VIDEO_WIDTH, VIDEO_HEIGHT);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("无法建立视频画面");
  if (typeof canvas.captureStream !== "function") throw new Error("当前浏览器不支持视频导出，可改用 GIF");
  renderBoardShareFrame(ctx, board, 0, duration);
  const stream = canvas.captureStream(fps);
  let recorder: MediaRecorder;
  let encoding: VideoEncoding;
  try {
    ({ recorder, encoding } = makeRecorder(stream));
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    throw error;
  }
  const chunks: BlobPart[] = [];

  return new Promise<BoardMediaExport>((resolve, reject) => {
    let animationFrame = 0;
    let settled = false;
    let startedAt = 0;
    let finalPoseStartedAt: number | null = null;
    const finishTracks = () => stream.getTracks().forEach(track => track.stop());
    const cleanup = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      options.signal?.removeEventListener("abort", onAbort);
      finishTracks();
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason instanceof Error || reason instanceof DOMException ? reason : new Error("无法导出视频"));
    };
    const onAbort = () => {
      fail(abortError());
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* stopping tracks may already have ended the recorder */ }
      }
    };
    recorder.ondataavailable = event => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = event => fail(event.error || new Error("视频编码失败"));
    recorder.onstop = () => {
      if (settled) return;
      const mimeType = recorder.mimeType || encoding.mimeType;
      const extension = videoExtension(mimeType, encoding.extension);
      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) {
        fail(new Error("视频编码没有产生内容"));
        return;
      }
      settled = true;
      cleanup();
      reportProgress(options.onProgress, 1);
      resolve({
        blob,
        name: mediaName(board, extension),
        format: "video",
        mimeType,
        extension,
        duration,
      });
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    reportProgress(options.onProgress, 0);
    try {
      checkAborted(options.signal);
      if (settled) return;
      recorder.start(250);
      startedAt = performance.now();
      const draw = (now: number) => {
        if (settled) return;
        const elapsed = Math.min(duration, (now - startedAt) / 1000);
        renderBoardShareFrame(ctx, board, elapsed, duration);
        const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
        track?.requestFrame?.();
        reportProgress(options.onProgress, elapsed / duration);
        if (elapsed >= duration) {
          // Continue emitting the destination pose so the hold is encoded in
          // the stream rather than merely delaying the recorder stop call.
          finalPoseStartedAt ??= now;
          if (now - finalPoseStartedAt >= 250) {
            if (recorder.state !== "inactive") recorder.stop();
            return;
          }
          animationFrame = requestAnimationFrame(draw);
        } else animationFrame = requestAnimationFrame(draw);
      };
      animationFrame = requestAnimationFrame(draw);
    } catch (error) {
      fail(error);
    }
  });
}

export async function exportBoardGif(
  sourceBoard: BoardDocument,
  options: BoardMediaExportOptions = {},
): Promise<BoardMediaExport> {
  checkAborted(options.signal);
  const board = prepareBoardForMedia(sourceBoard);
  if (!board.frames.length || !board.frames.some(frame => frame.paths.length > 0)) throw new Error("请先加入至少一条球路或跑位");
  const duration = requireMediaDuration(getBoardDuration(board), options.maxDurationSeconds ?? 12, "GIF");
  const timeline = createFrameTimeline(duration, duration, options.fps ?? 10);
  const canvas = createCanvas(GIF_WIDTH, GIF_HEIGHT);
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("无法建立 GIF 画面");
  const worker = new Worker(new URL("./gif.worker.ts", import.meta.url), { type: "module", name: "tactics-gif-encoder" });
  let requestId = 0;
  reportProgress(options.onProgress, 0);
  try {
    await requestGifWorker(worker, {
      type: "init",
      requestId: ++requestId,
      width: GIF_WIDTH,
      height: GIF_HEIGHT,
      loopCount: 0,
    }, [], options.signal);
    for (let index = 0; index < timeline.samples.length; index += 1) {
      checkAborted(options.signal);
      renderBoardShareFrame(ctx, board, timeline.samples[index], timeline.duration);
      const pixels = ctx.getImageData(0, 0, GIF_WIDTH, GIF_HEIGHT).data;
      const rgba = pixels.byteOffset === 0
        && pixels.byteLength === pixels.buffer.byteLength
        && pixels.buffer instanceof ArrayBuffer
        ? pixels.buffer
        : pixels.slice().buffer;
      await requestGifWorker(worker, {
        type: "frame",
        requestId: ++requestId,
        rgba,
        delayCentiseconds: timeline.delaysCentiseconds[index],
      }, [rgba], options.signal);
      reportProgress(options.onProgress, (index + 1) / timeline.samples.length);
    }
    checkAborted(options.signal);
    const result = await requestGifWorker(worker, { type: "finish", requestId: ++requestId }, [], options.signal);
    if (!result.bytes) throw new Error("GIF Worker 没有返回编码内容");
    const blob = new Blob([result.bytes], { type: "image/gif" });
    return {
      blob,
      name: mediaName(board, "gif"),
      format: "gif",
      mimeType: "image/gif",
      extension: "gif",
      duration: timeline.duration,
    };
  } finally {
    worker.terminate();
  }
}
