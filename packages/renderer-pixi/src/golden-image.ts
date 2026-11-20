// Minimal PNG codec and image comparison for the golden-image suite (canvas/133). Dependency-free on purpose
// (node:zlib only): goldens are 8-bit RGBA, non-interlaced, which is all the suite writes and reads.
import { deflateSync, inflateSync } from "node:zlib";

export interface Image {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  readonly data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

export function encodePng(img: Image): Buffer {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export function decodePng(png: Buffer): Image {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  for (let pos = 8; pos < png.length; ) {
    const len = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    const body = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error("only 8-bit RGBA non-interlaced PNGs are supported");
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? data[y * stride + i - 4]! : 0;
      const b = y > 0 ? data[(y - 1) * stride + i]! : 0;
      const c = i >= 4 && y > 0 ? data[(y - 1) * stride + i - 4]! : 0;
      let v = line[i]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      data[y * stride + i] = v & 0xff;
    }
  }
  return { width, height, data };
}

/** How far a render may drift from its golden before the comparison fails (see golden/README.md). */
export interface Tolerance {
  /** A pixel differs when any channel differs by more than this (0-255). Absorbs anti-aliasing rounding. */
  readonly channel: number;
  /** The comparison fails when more than this fraction (0-1) of the pixels differ. */
  readonly fraction: number;
}

export const DEFAULT_TOLERANCE: Tolerance = { channel: 16, fraction: 0.002 };

export interface Comparison {
  readonly ok: boolean;
  readonly differing: number;
  readonly total: number;
  readonly sizeMismatch: boolean;
  /** Differing pixels in red on a faded copy of the expected image; absent on a size mismatch. */
  readonly diff?: Image;
}

export function compareImages(expected: Image, actual: Image, tolerance: Tolerance = DEFAULT_TOLERANCE): Comparison {
  const total = expected.width * expected.height;
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return { ok: false, differing: total, total, sizeMismatch: true };
  }
  const diff = new Uint8Array(expected.data.length);
  let differing = 0;
  for (let p = 0; p < total; p++) {
    const o = p * 4;
    let worst = 0;
    for (let k = 0; k < 4; k++) worst = Math.max(worst, Math.abs(expected.data[o + k]! - actual.data[o + k]!));
    if (worst > tolerance.channel) {
      differing++;
      diff.set([255, 0, 0, 255], o);
    } else {
      diff.set([expected.data[o]!, expected.data[o + 1]!, expected.data[o + 2]!, Math.round(expected.data[o + 3]! * 0.25)], o);
    }
  }
  return { ok: differing <= tolerance.fraction * total, differing, total, sizeMismatch: false, diff: { width: expected.width, height: expected.height, data: diff } };
}
