import assert from "node:assert/strict";
import test from "node:test";
import {
  Gif89Encoder,
  clampMediaDuration,
  createFrameTimeline,
  createRgb332Palette,
  encodeGifLzw,
  pickVideoEncoding,
  requireMediaDuration,
  rgbaToRgb332,
} from "../src/board/media-core.js";

function gifFrameCount(bytes) {
  let offset = 6;
  const packed = bytes[offset + 4];
  offset += 7;
  if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1));
  let frames = 0;
  const skipSubBlocks = () => {
    while (offset < bytes.length) {
      const size = bytes[offset++];
      if (size === 0) return;
      offset += size;
    }
    throw new Error("GIF sub-block is truncated");
  };
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) return frames;
    if (marker === 0x21) {
      offset += 1;
      skipSubBlocks();
      continue;
    }
    if (marker === 0x2c) {
      frames += 1;
      offset += 8;
      const imagePacked = bytes[offset++];
      if (imagePacked & 0x80) offset += 3 * (1 << ((imagePacked & 7) + 1));
      offset += 1;
      skipSubBlocks();
      continue;
    }
    throw new Error(`Unexpected GIF marker 0x${marker.toString(16)}`);
  }
  throw new Error("GIF trailer is missing");
}

function gifFrameDelays(bytes) {
  let offset = 6;
  const packed = bytes[offset + 4];
  offset += 7;
  if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1));
  const delays = [];
  const skipSubBlocks = () => {
    while (offset < bytes.length) {
      const size = bytes[offset++];
      if (size === 0) return;
      offset += size;
    }
    throw new Error("GIF sub-block is truncated");
  };
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) return delays;
    if (marker === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9) {
        assert.equal(bytes[offset++], 4);
        offset += 1;
        delays.push(bytes[offset] | (bytes[offset + 1] << 8));
        offset += 4;
      } else skipSubBlocks();
      continue;
    }
    if (marker === 0x2c) {
      offset += 8;
      const imagePacked = bytes[offset++];
      if (imagePacked & 0x80) offset += 3 * (1 << ((imagePacked & 7) + 1));
      offset += 1;
      skipSubBlocks();
      continue;
    }
    throw new Error(`Unexpected GIF marker 0x${marker.toString(16)}`);
  }
  throw new Error("GIF trailer is missing");
}

function decodeGifLzw(bytes, minimumCodeSize = 8) {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let dictionary = [];
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let bitOffset = 0;
  let previous = null;
  const output = [];
  const reset = () => {
    dictionary = Array.from({ length: clearCode }, (_, value) => [value]);
    codeSize = minimumCodeSize + 1;
    nextCode = endCode + 1;
    previous = null;
  };
  const readCode = () => {
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      code |= ((bytes[bitOffset >> 3] >> (bitOffset & 7)) & 1) << bit;
      bitOffset += 1;
    }
    return code;
  };
  reset();
  while (bitOffset + codeSize <= bytes.length * 8) {
    const code = readCode();
    if (code === clearCode) {
      reset();
      continue;
    }
    if (code === endCode) return Uint8Array.from(output);
    const entry = code < nextCode
      ? dictionary[code]
      : code === nextCode && previous
        ? [...previous, previous[0]]
        : null;
    if (!entry) throw new Error(`Invalid LZW code ${code}`);
    output.push(...entry);
    if (previous && nextCode < 4096) {
      dictionary[nextCode] = [...previous, entry[0]];
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }
  throw new Error("GIF LZW end code is missing");
}

test("media duration and GIF sampling stay within their limits", () => {
  assert.equal(clampMediaDuration(48, 30), 30);
  assert.equal(clampMediaDuration(Number.NaN, 30), 0);
  const timeline = createFrameTimeline(20, 12, 10);
  assert.equal(timeline.duration, 12);
  assert.equal(timeline.fps, 10);
  assert.equal(timeline.samples.length, 121);
  assert.equal(timeline.delaysCentiseconds.length, 121);
  assert.equal(timeline.samples[0], 0);
  assert.equal(timeline.samples.at(-1), 12);
  assert.equal(timeline.delaysCentiseconds.slice(0, -1).reduce((sum, delay) => sum + delay, 0), 1_200);
  assert.equal(timeline.delaysCentiseconds.at(-1), 2);
  assert.equal(timeline.encodedDuration, 12.02);

  const short = createFrameTimeline(.2, 1, 5);
  assert.deepEqual(short.samples, [0, .2]);
  assert.deepEqual(short.delaysCentiseconds, [20, 2]);
  assert.equal(short.encodedDuration, .22);
  const timingEncoder = new Gif89Encoder(1, 1);
  for (const delay of short.delaysCentiseconds) timingEncoder.addFrame(Uint8Array.of(0), delay);
  assert.deepEqual(gifFrameDelays(timingEncoder.finish()), [20, 2]);
});

test("complete-media guard rejects silent truncation", () => {
  assert.equal(requireMediaDuration(11.9, 12, "GIF"), 11.9);
  assert.throws(() => requireMediaDuration(12.1, 12, "GIF"), /GIF最多支持 12 秒.*12\.1 秒/);
  assert.throws(() => requireMediaDuration(3, 0, "视频"), /时长上限必须大于 0 秒/);
  assert.throws(() => requireMediaDuration(0, 30, "视频"), /战术时长必须大于 0 秒/);
});

test("video selection prefers MP4 and safely falls back to WebM", () => {
  assert.deepEqual(pickVideoEncoding(mime => mime.startsWith("video/mp4")), {
    mimeType: "video/mp4;codecs=avc1.42E01E",
    extension: "mp4",
  });
  assert.deepEqual(pickVideoEncoding(mime => mime === "video/webm;codecs=vp8"), {
    mimeType: "video/webm;codecs=vp8",
    extension: "webm",
  });
  assert.equal(pickVideoEncoding(() => false), null);
  assert.equal(pickVideoEncoding(null), null);
});

test("3-3-2 quantization maps primary colours to the shared palette", () => {
  const indexed = rgbaToRgb332(Uint8Array.of(
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
  ));
  assert.deepEqual([...indexed], [0xe0, 0x1c, 0x03]);
  const palette = createRgb332Palette();
  assert.equal(palette.length, 768);
  assert.deepEqual([...palette.slice(0xe0 * 3, 0xe0 * 3 + 3)], [255, 0, 0]);
});

test("GIF89a writer produces a looping, genuinely multi-frame file", () => {
  const first = Uint8Array.of(0xe0, 0x1c, 0x03, 0xff);
  const second = Uint8Array.of(0xff, 0x03, 0x1c, 0xe0);
  assert.ok(encodeGifLzw(first).length > 0);
  const encoder = new Gif89Encoder(2, 2);
  encoder.addFrame(first, 10);
  encoder.addFrame(second, 10);
  const bytes = encoder.finish();
  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), "GIF89a");
  assert.equal(bytes.at(-1), 0x3b);
  assert.equal(gifFrameCount(bytes), 2);
  assert.deepEqual(gifFrameDelays(bytes), [10, 10]);
  assert.equal(encoder.frameCount, 2);
  assert.deepEqual(encoder.finish(), bytes, "finish should be idempotent");
});

test("GIF LZW survives code-width changes and dictionary resets", () => {
  const source = Uint8Array.from({ length: 50_000 }, (_, index) => (index * 73 + (index >> 3)) & 0xff);
  const compressed = encodeGifLzw(source);
  assert.deepEqual(decodeGifLzw(compressed), source);
  assert.ok(compressed.length < source.length);

  let seed = 1;
  const boundarySource = Uint8Array.from({ length: 8_673 }, () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed >>> 24;
  });
  assert.deepEqual(decodeGifLzw(encodeGifLzw(boundarySource)), boundarySource);
});
