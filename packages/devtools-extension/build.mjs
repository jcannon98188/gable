// Builds the unpacked extension into dist/ (load that folder at chrome://extensions).
import { copyFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, "dist");
rmSync(dist, { recursive: true, force: true });

const common = { root, configFile: false, logLevel: "warn", build: { outDir: dist, emptyOutDir: false, target: "chrome111", minify: false } };

// The panel and devtools pages, and the service worker (ES modules).
await build({
  ...common,
  base: "./",
  build: {
    ...common.build,
    rollupOptions: {
      input: { panel: resolve(root, "panel.html"), devtools: resolve(root, "devtools.html"), background: resolve(root, "src/background.ts") },
      output: { entryFileNames: (c) => (c.name === "background" ? "background.js" : "assets/[name].js"), chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" },
    },
  },
});

// Content scripts cannot be modules: one self-contained IIFE each.
for (const [name, entry] of [["content", "src/content-main.ts"], ["inject", "src/inject.ts"]]) {
  await build({
    ...common,
    build: { ...common.build, lib: { entry: resolve(root, entry), formats: ["iife"], name: `gable_${name}`, fileName: () => `${name}.js` } },
  });
}

copyFileSync(resolve(root, "static/manifest.json"), resolve(dist, "manifest.json"));

// Icons: a solid rounded-ish square with a "G" pixel glyph, written as PNG without any dependency.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), 8 + data.length);
  return out;
};
const GLYPH = ["01110", "10001", "10000", "10111", "10001", "10001", "01110"];
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.18;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const dx = Math.max(r - x - 0.5, 0, x + 0.5 - (size - r));
      const dy = Math.max(r - y - 0.5, 0, y + 0.5 - (size - r));
      const inside = dx * dx + dy * dy <= r * r;
      const gx = Math.floor(((x / size - 0.2) / 0.6) * 5);
      const gy = Math.floor(((y / size - 0.15) / 0.7) * 7);
      const ink = gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && GLYPH[gy][gx] === "1";
      const [cr, cg, cb] = ink ? [255, 255, 255] : [0xe8, 0x59, 0x0c];
      raw.set([cr, cg, cb, inside ? 255 : 0], o);
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
mkdirSync(resolve(dist, "icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(resolve(dist, `icons/${size}.png`), png(size));

console.log("Built the extension to", dist);
