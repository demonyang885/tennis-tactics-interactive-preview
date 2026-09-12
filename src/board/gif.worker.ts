import { Gif89Encoder, rgbaToRgb332 } from "./media-core.js";

type GifWorkerRequest =
  | { type: "init"; requestId: number; width: number; height: number; loopCount: number }
  | { type: "frame"; requestId: number; rgba: ArrayBuffer; delayCentiseconds: number }
  | { type: "finish"; requestId: number };

type GifWorkerResponse =
  | { requestId: number; ok: true; bytes?: ArrayBuffer }
  | { requestId: number; ok: false; error: string };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<GifWorkerRequest>) => void) | null;
  postMessage: (message: GifWorkerResponse, transfer?: Transferable[]) => void;
};

let encoder: Gif89Encoder | null = null;

workerScope.onmessage = event => {
  const message = event.data;
  try {
    if (message.type === "init") {
      encoder = new Gif89Encoder(message.width, message.height, message.loopCount);
      workerScope.postMessage({ requestId: message.requestId, ok: true });
      return;
    }
    if (!encoder) throw new Error("GIF 编码器尚未初始化");
    if (message.type === "frame") {
      const rgba = new Uint8ClampedArray(message.rgba);
      encoder.addFrame(rgbaToRgb332(rgba), message.delayCentiseconds);
      // One ACK per frame applies back-pressure: the main thread transfers the
      // next canvas buffer only after this frame has been fully encoded.
      workerScope.postMessage({ requestId: message.requestId, ok: true });
      return;
    }
    const bytes = encoder.finish();
    encoder = null;
    workerScope.postMessage({ requestId: message.requestId, ok: true, bytes: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    workerScope.postMessage({
      requestId: message.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "GIF 编码失败",
    });
  }
};
