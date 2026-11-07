// Just enough PNG for the matrix's baselines: decode what Chromium's screenshots produce (8-bit RGB or RGBA, not
// interlaced), encode RGBA, compare two pictures pixel by pixel, and print rendered markup one tag per line so a baseline's
// markup can be diffed as text. Node's zlib does the compression; nothing else is needed.
import { deflateSync, inflateSync } from "node:zlib";

export interface Raster {
  width: number;
  height: number;
  /** RGBA, row by row. */
  data: Uint8Array;
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
const crc32 = (buf: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export function decodePng(png: Uint8Array): Raster {
  const buf = Buffer.from(png);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("Not a PNG.");
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8]!;
      const color = body[9]!;
      if (depth !== 8 || (color !== 2 && color !== 6)) throw new Error(`Unsupported PNG (bit depth ${depth}, colour type ${color}); expected 8-bit RGB or RGBA.`);
      if (body[12] !== 0) throw new Error("Interlaced PNGs are not supported.");
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!width || !height || !channels) throw new Error("The PNG has no header.");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error("The PNG is truncated.");
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`Unknown PNG filter ${filter}.`);
      line[i] = (line[i]! + add) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = line[x * channels]!;
      out[o + 1] = line[x * channels + 1]!;
      out[o + 2] = line[x * channels + 2]!;
      out[o + 3] = channels === 4 ? line[x * channels + 3]! : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

const chunk = (type: string, body: Buffer): Buffer => {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "latin1");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
};

export function encodePng(r: Raster): Buffer {
  const stride = r.width * 4;
  const raw = Buffer.alloc((stride + 1) * r.height);
  for (let y = 0; y < r.height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(r.data.buffer, r.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(r.width, 0);
  header.writeUInt32BE(r.height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export interface ImageDiff {
  width: number;
  height: number;
  changedPixels: number;
  /** Changed pixels over all pixels of the larger of the two pictures. */
  ratio: number;
  box: { x: number; y: number; width: number; height: number } | null;
  /** The baseline faded, changed pixels in red (and the area one picture has and the other lacks, in amber). */
  png: Buffer;
  sizeChanged: boolean;
}

/** A channel may differ by this much before the pixel counts as changed (anti-aliasing noise between two renders). */
export const PIXEL_TOLERANCE = 2;

export function diffImages(before: Raster, after: Raster, tolerance = PIXEL_TOLERANCE): ImageDiff {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const out = new Uint8Array(width * height * 4);
  let changed = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const inA = x < before.width && y < before.height;
      const inB = x < after.width && y < after.height;
      let differs = false;
      let r = 255;
      let g = 255;
      let b = 255;
      if (inA && inB) {
        const a = (y * before.width + x) * 4;
        const c = (y * after.width + x) * 4;
        differs = false;
        for (let k = 0; k < 4; k++) if (Math.abs(before.data[a + k]! - after.data[c + k]!) > tolerance) differs = true;
        // The baseline, faded toward white, so the red stands out.
        const alpha = before.data[a + 3]! / 255;
        r = 255 - (255 - before.data[a]!) * 0.35 * alpha;
        g = 255 - (255 - before.data[a + 1]!) * 0.35 * alpha;
        b = 255 - (255 - before.data[a + 2]!) * 0.35 * alpha;
      } else {
        differs = true;
      }
      if (differs) {
        changed++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        [r, g, b] = inA && inB ? [220, 38, 38] : [245, 158, 11];
      }
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  return {
    width,
    height,
    changedPixels: changed,
    ratio: width * height === 0 ? 0 : changed / (width * height),
    box: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    png: encodePng({ width, height, data: out }),
    sizeChanged: before.width !== after.width || before.height !== after.height,
  };
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/**
 * Rendered markup, one tag or text run per line, indented by depth, so a line diff reads as a DOM diff. Input is the
 * browser's serialisation (`outerHTML`), which is well formed. Whitespace-only text is dropped; text is collapsed.
 */
export function prettyMarkup(markup: string): string {
  const out: string[] = [];
  let depth = 0;
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  for (let m = re.exec(markup); m; m = re.exec(markup)) {
    const [whole, tag, , text] = m;
    if (text !== undefined) {
      const t = text.replace(/\s+/g, " ").trim();
      if (t) out.push("  ".repeat(depth) + t);
    } else if (whole!.startsWith("<!--")) {
      continue;
    } else if (whole!.startsWith("</")) {
      depth = Math.max(0, depth - 1);
      out.push("  ".repeat(depth) + whole!.replace(/\s+/g, " "));
    } else {
      out.push("  ".repeat(depth) + whole!.replace(/\s+/g, " "));
      if (!whole!.endsWith("/>") && !VOID.has(tag!.toLowerCase())) depth++;
    }
  }
  return out.join("\n") + "\n";
}
