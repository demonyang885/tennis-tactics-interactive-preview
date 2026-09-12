import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html");
});

test("GIF export completes through the module worker and reports progress", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { exportBoardGif } = await import("/src/board/media.ts");
    const board = {
      version: 1 as const,
      id: "media-worker-board",
      title: "分享测试",
      updatedAt: new Date(0).toISOString(),
      actors: [
        { id: "player", label: "我方", kind: "player" as const },
        { id: "ball", label: "网球", kind: "ball" as const },
      ],
      frames: [{
        id: "frame-1",
        label: "第 1 拍",
        duration: 0.2,
        poses: { player: [0.5, 0.9] as [number, number], ball: [0.5, 0.86] as [number, number] },
        paths: [{
          id: "shot-1",
          kind: "shot" as const,
          actorId: "ball",
          from: [0.5, 0.86] as [number, number],
          to: [0.2, 0.12] as [number, number],
          control: [0.72, 0.45] as [number, number],
        }],
        marks: [],
      }],
    };
    const progress: number[] = [];
    const exported = await exportBoardGif(board, { fps: 5, maxDurationSeconds: 1, onProgress: value => progress.push(value) });
    const bytes = new Uint8Array(await exported.blob.arrayBuffer());
    return {
      signature: new TextDecoder().decode(bytes.slice(0, 6)),
      trailer: bytes.at(-1),
      size: bytes.length,
      progress,
      duration: exported.duration,
      name: exported.name,
    };
  });

  expect(result.signature).toBe("GIF89a");
  expect(result.trailer).toBe(0x3b);
  expect(result.size).toBeGreaterThan(1_000);
  expect(result.progress[0]).toBe(0);
  expect(result.progress.at(-1)).toBe(1);
  expect(result.duration).toBe(0.2);
  expect(result.name).toBe("分享测试-战术回放.gif");
});

test("media export rejects partial output and aborts a running worker", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { exportBoardGif } = await import("/src/board/media.ts");
    const board = {
      version: 1 as const,
      id: "media-limit-board",
      title: "时长测试",
      updatedAt: new Date(0).toISOString(),
      actors: [{ id: "ball", label: "网球", kind: "ball" as const }],
      frames: [{
        id: "frame-1",
        label: "第 1 拍",
        duration: 1.5,
        poses: { ball: [0.5, 0.86] as [number, number] },
        paths: [{
          id: "shot-1",
          kind: "shot" as const,
          actorId: "ball",
          from: [0.5, 0.86] as [number, number],
          to: [0.2, 0.12] as [number, number],
        }],
        marks: [],
      }],
    };
    let limitMessage = "";
    try {
      await exportBoardGif(board, { maxDurationSeconds: 1 });
    } catch (error) {
      limitMessage = error instanceof Error ? error.message : String(error);
    }

    const controller = new AbortController();
    let abortName = "";
    try {
      await exportBoardGif(board, {
        fps: 10,
        maxDurationSeconds: 2,
        signal: controller.signal,
        onProgress: progress => {
          if (progress > 0) controller.abort();
        },
      });
    } catch (error) {
      abortName = error instanceof DOMException ? error.name : "unknown";
    }
    return { limitMessage, abortName };
  });

  expect(result.limitMessage).toContain("GIF最多支持 1 秒");
  expect(result.limitMessage).toContain("当前战术为 1.5 秒");
  expect(result.abortName).toBe("AbortError");
});

test("video export holds the destination frame before stopping", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { exportBoardVideo, pickVideoEncoding } = await import("/src/board/media.ts");
    if (!pickVideoEncoding()) return { supported: false, elapsed: 0, size: 0, duration: 0, width: 0, height: 0 };
    const board = {
      version: 1 as const,
      id: "media-video-board",
      title: "视频测试",
      updatedAt: new Date(0).toISOString(),
      actors: [{ id: "ball", label: "网球", kind: "ball" as const }],
      frames: [{
        id: "frame-1",
        label: "第 1 拍",
        duration: 0.1,
        poses: { ball: [0.5, 0.86] as [number, number] },
        paths: [{
          id: "shot-1",
          kind: "shot" as const,
          actorId: "ball",
          from: [0.5, 0.86] as [number, number],
          to: [0.2, 0.12] as [number, number],
        }],
        marks: [],
      }],
    };
    const startedAt = performance.now();
    const exported = await exportBoardVideo(board, { maxDurationSeconds: 1, fps: 12 });
    const elapsed = performance.now() - startedAt;
    const url = URL.createObjectURL(exported.blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    const metadata = await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
      video.onloadedmetadata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => reject(new Error("generated video metadata could not be read"));
      video.src = url;
    });
    URL.revokeObjectURL(url);
    return { supported: true, elapsed, size: exported.blob.size, ...metadata };
  });

  test.skip(!result.supported, "MediaRecorder is not available in this browser");
  expect(result.elapsed).toBeGreaterThanOrEqual(300);
  expect(result.size).toBeGreaterThan(0);
  expect(result.duration).toBeGreaterThanOrEqual(.28);
  expect(result.duration).toBeLessThan(1);
  expect(result.width).toBe(720);
  expect(result.height).toBe(1280);
});

test("video setup failures and synchronous cancellation release capture tracks", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { exportBoardVideo } = await import("/src/board/media.ts");
    const board = {
      version: 1 as const,
      id: "media-video-cleanup",
      title: "资源清理",
      updatedAt: new Date(0).toISOString(),
      actors: [{ id: "ball", label: "网球", kind: "ball" as const }],
      frames: [{
        id: "frame-1",
        label: "第 1 拍",
        duration: .2,
        poses: { ball: [.5, .86] as [number, number] },
        paths: [{ id: "shot-1", kind: "shot" as const, actorId: "ball", from: [.5, .86] as [number, number], to: [.2, .12] as [number, number] }],
        marks: [],
      }],
    };
    const originalRecorder = window.MediaRecorder;
    const originalCaptureStream = HTMLCanvasElement.prototype.captureStream;
    let stopCalls = 0;
    let startCalls = 0;
    const track = { stop: () => { stopCalls += 1; }, requestFrame: () => {} };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    HTMLCanvasElement.prototype.captureStream = () => stream;

    let setupMessage = "";
    try {
      class ThrowingRecorder {
        static isTypeSupported() { return true; }
        constructor() { throw new Error("codec setup failed"); }
      }
      Object.defineProperty(window, "MediaRecorder", { configurable: true, value: ThrowingRecorder });
      try { await exportBoardVideo(board); } catch (error) { setupMessage = error instanceof Error ? error.message : String(error); }

      const setupStops = stopCalls;
      stopCalls = 0;
      class IdleRecorder {
        static isTypeSupported() { return true; }
        state: RecordingState = "inactive";
        mimeType = "video/mp4";
        ondataavailable: ((event: BlobEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onstop: (() => void) | null = null;
        start() { startCalls += 1; this.state = "recording"; }
        stop() { this.state = "inactive"; this.onstop?.(); }
      }
      Object.defineProperty(window, "MediaRecorder", { configurable: true, value: IdleRecorder });
      const controller = new AbortController();
      let abortName = "";
      try {
        await exportBoardVideo(board, { signal: controller.signal, onProgress: () => controller.abort() });
      } catch (error) {
        abortName = error instanceof DOMException ? error.name : "unknown";
      }
      return { setupMessage, setupStops, abortName, abortStops: stopCalls, startCalls };
    } finally {
      Object.defineProperty(window, "MediaRecorder", { configurable: true, value: originalRecorder });
      HTMLCanvasElement.prototype.captureStream = originalCaptureStream;
    }
  });

  expect(result.setupMessage).toContain("codec setup failed");
  expect(result.setupStops).toBe(1);
  expect(result.abortName).toBe("AbortError");
  expect(result.abortStops).toBe(1);
  expect(result.startCalls).toBe(0);
});
