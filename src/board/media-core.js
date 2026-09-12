const VIDEO_ENCODINGS = [
  { mimeType: "video/mp4;codecs=avc1.42E01E", extension: "mp4" },
  { mimeType: "video/mp4", extension: "mp4" },
  { mimeType: "video/webm;codecs=vp9", extension: "webm" },
  { mimeType: "video/webm;codecs=vp8", extension: "webm" },
  { mimeType: "video/webm", extension: "webm" },
];

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

/** Return a finite playback length without ever extending the source. */
export function clampMediaDuration(totalDuration, maximumDuration) {
  const total = Number.isFinite(totalDuration) ? Math.max(0, totalDuration) : 0;
  const maximum = Number.isFinite(maximumDuration) ? Math.max(0, maximumDuration) : 0;
  return Math.min(total, maximum);
}

/** Reject partial exports so a shared file can never masquerade as complete. */
export function requireMediaDuration(totalDuration, maximumDuration, label = "媒体") {
  const total = Number.isFinite(totalDuration) ? totalDuration : 0;
  if (!Number.isFinite(maximumDuration) || maximumDuration <= 0) throw new RangeError(`${label}时长上限必须大于 0 秒`);
  if (total <= 0) throw new RangeError("战术时长必须大于 0 秒");
  if (total > maximumDuration) {
    throw new RangeError(`${label}最多支持 ${maximumDuration} 秒，当前战术为 ${total.toFixed(1)} 秒，请先缩短拍次时长`);
  }
  return total;
}

/** Build samples and GIF delays without speeding up the authored motion. */
export function createFrameTimeline(totalDuration, maximumDuration, requestedFps) {
  const duration = clampMediaDuration(totalDuration, maximumDuration);
  const fps = clamp(Number.isFinite(requestedFps) ? requestedFps : 10, 1, 30);
  if (duration <= 0) return { duration: 0, fps, encodedDuration: .02, delaysCentiseconds: [2], samples: [0] };
  const intervalCount = Math.max(1, Math.ceil(duration * fps));
  const motionCentiseconds = Math.max(intervalCount * 2, Math.round(duration * 100));
  const samples = Array.from({ length: intervalCount + 1 }, (_, index) => duration * index / intervalCount);
  const delaysCentiseconds = samples.map((_, index) => index === intervalCount
    ? 2
    : Math.round((index + 1) * motionCentiseconds / intervalCount) - Math.round(index * motionCentiseconds / intervalCount));
  return {
    duration,
    fps,
    encodedDuration: delaysCentiseconds.reduce((sum, delay) => sum + delay, 0) / 100,
    delaysCentiseconds,
    samples,
  };
}

/** Pick the most share-compatible recording format actually supported here. */
export function pickVideoEncoding(isTypeSupported) {
  if (typeof isTypeSupported !== "function") return null;
  for (const encoding of VIDEO_ENCODINGS) {
    try {
      if (isTypeSupported(encoding.mimeType)) return { ...encoding };
    } catch {
      // A browser can throw for an unfamiliar codec string; try the next one.
    }
  }
  return null;
}

/** Fixed 3-3-2 RGB palette used by the dependency-free GIF encoder. */
export function createRgb332Palette() {
  const palette = new Uint8Array(256 * 3);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = Math.round(((index >> 5) & 7) * 255 / 7);
    palette[index * 3 + 1] = Math.round(((index >> 2) & 7) * 255 / 7);
    palette[index * 3 + 2] = Math.round((index & 3) * 255 / 3);
  }
  return palette;
}

/** Quantize RGBA canvas pixels to the global 3-3-2 palette. */
export function rgbaToRgb332(rgba) {
  if (!rgba || rgba.length % 4 !== 0) throw new TypeError("RGBA 像素长度必须是 4 的倍数");
  const indexed = new Uint8Array(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
    indexed[target] = (rgba[source] & 0xe0) | ((rgba[source + 1] & 0xe0) >> 3) | (rgba[source + 2] >> 6);
  }
  return indexed;
}

function littleEndian16(value) {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff);
}

function ascii(value) {
  return Uint8Array.from(value, character => character.charCodeAt(0));
}

function toSubBlocks(bytes) {
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const block = bytes.subarray(offset, Math.min(bytes.length, offset + 255));
    parts.push(Uint8Array.of(block.length), block);
  }
  parts.push(Uint8Array.of(0));
  return parts;
}

/** GIF-flavoured LZW bitstream, least-significant bit first. */
export function encodeGifLzw(indexedPixels, minimumCodeSize = 8) {
  if (!(indexedPixels instanceof Uint8Array) || indexedPixels.length === 0) {
    throw new TypeError("GIF 画面必须包含索引像素");
  }
  if (!Number.isInteger(minimumCodeSize) || minimumCodeSize < 2 || minimumCodeSize > 8) {
    throw new RangeError("GIF LZW 色深必须介于 2 至 8");
  }

  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const bytes = [];
  let accumulator = 0;
  let bitCount = 0;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let dictionary = new Map();

  const writeCode = code => {
    accumulator |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(accumulator & 0xff);
      accumulator >>>= 8;
      bitCount -= 8;
    }
  };

  const reset = () => {
    dictionary = new Map();
    codeSize = minimumCodeSize + 1;
    nextCode = endCode + 1;
  };

  writeCode(clearCode);
  let prefix = indexedPixels[0];
  for (let index = 1; index < indexedPixels.length; index += 1) {
    const suffix = indexedPixels[index];
    const key = (prefix << 8) | suffix;
    const existing = dictionary.get(key);
    if (existing !== undefined) {
      prefix = existing;
      continue;
    }

    writeCode(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode);
      nextCode += 1;
      // The decoder creates a dictionary entry one emitted code later than
      // the encoder, so GIF's code width changes after the boundary entry.
      if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize += 1;
    } else {
      writeCode(clearCode);
      reset();
    }
    prefix = suffix;
  }
  writeCode(prefix);
  // Reading the final data code may make the decoder cross a code-width
  // boundary even though the encoder has no final dictionary entry to add.
  if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
  writeCode(endCode);
  if (bitCount > 0) bytes.push(accumulator & 0xff);
  return Uint8Array.from(bytes);
}

function joinBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

/** Minimal animated GIF89a writer with a shared 256-colour palette. */
export class Gif89Encoder {
  constructor(width, height, loopCount = 0) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) {
      throw new RangeError("GIF 尺寸必须是 1 至 65535 的整数");
    }
    if (!Number.isInteger(loopCount) || loopCount < 0 || loopCount > 65535) throw new RangeError("GIF 循环次数不合法");
    this.width = width;
    this.height = height;
    this.frameCount = 0;
    this.finished = false;
    this.parts = [
      ascii("GIF89a"),
      littleEndian16(width),
      littleEndian16(height),
      Uint8Array.of(0xf7, 0x00, 0x00),
      createRgb332Palette(),
      Uint8Array.of(0x21, 0xff, 0x0b),
      ascii("NETSCAPE2.0"),
      Uint8Array.of(0x03, 0x01),
      littleEndian16(loopCount),
      Uint8Array.of(0x00),
    ];
  }

  addFrame(indexedPixels, delayCentiseconds = 10) {
    if (this.finished) throw new Error("GIF 已完成，不能继续加入画面");
    if (!(indexedPixels instanceof Uint8Array) || indexedPixels.length !== this.width * this.height) {
      throw new RangeError("GIF 画面像素数量与尺寸不符");
    }
    const delay = clamp(Math.round(delayCentiseconds), 2, 65535);
    const compressed = encodeGifLzw(indexedPixels, 8);
    this.parts.push(
      Uint8Array.of(0x21, 0xf9, 0x04, 0x04),
      littleEndian16(delay),
      Uint8Array.of(0x00, 0x00),
      Uint8Array.of(0x2c),
      littleEndian16(0),
      littleEndian16(0),
      littleEndian16(this.width),
      littleEndian16(this.height),
      Uint8Array.of(0x00, 0x08),
      ...toSubBlocks(compressed),
    );
    this.frameCount += 1;
  }

  finish() {
    if (this.frameCount === 0) throw new Error("GIF 至少需要一帧画面");
    if (!this.finished) {
      this.parts.push(Uint8Array.of(0x3b));
      this.finished = true;
    }
    return joinBytes(this.parts);
  }
}
