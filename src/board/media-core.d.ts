export type VideoEncoding = { mimeType: string; extension: "mp4" | "webm" };
export type FrameTimeline = { duration: number; encodedDuration: number; fps: number; delaysCentiseconds: number[]; samples: number[] };

export function clampMediaDuration(totalDuration: number, maximumDuration: number): number;
export function requireMediaDuration(totalDuration: number, maximumDuration: number, label?: string): number;
export function createFrameTimeline(totalDuration: number, maximumDuration: number, requestedFps: number): FrameTimeline;
export function pickVideoEncoding(isTypeSupported?: ((mimeType: string) => boolean) | null): VideoEncoding | null;
export function createRgb332Palette(): Uint8Array;
export function rgbaToRgb332(rgba: ArrayLike<number>): Uint8Array<ArrayBuffer>;
export function encodeGifLzw(indexedPixels: Uint8Array, minimumCodeSize?: number): Uint8Array<ArrayBuffer>;

export class Gif89Encoder {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  constructor(width: number, height: number, loopCount?: number);
  addFrame(indexedPixels: Uint8Array, delayCentiseconds?: number): void;
  finish(): Uint8Array<ArrayBuffer>;
}
