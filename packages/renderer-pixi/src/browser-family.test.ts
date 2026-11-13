import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { gableAssetFamilies } from "../../vite/src/asset-families.js";

// Opt-in real-browser check of `?family` (TASK-105.13): a production build of a spritesheet and a bitmap font imported with `?family`
// is served over HTTP and loaded by Pixi's own `Assets` in headless Chromium, so the hashed sibling rewrite is proven by the real loader,
// not by reading the emitted JSON. Same opt-in as the smoke suite: GABLE_BROWSER_SMOKE=1 (GABLE_BROWSER points at a Chromium).
const candidates = [
  process.env.GABLE_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((p): p is string => !!p);
const browser = candidates.find((p) => existsSync(p));
const optedIn = process.env.GABLE_BROWSER_SMOKE === "1";
if (optedIn && !browser) throw new Error("GABLE_BROWSER_SMOKE=1 but no Chromium was found; set GABLE_BROWSER.");

// The server runs in this process, so the browser must be spawned asynchronously.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".fnt": "text/plain" };

const PAGE = `import { Assets, Cache } from "pixi.js";
import heroSheet from "./art/hero.json?family";
import pixelFont from "./art/pixel.fnt?family";

const report = { sheetUrl: heroSheet, fontUrl: pixelFont, error: undefined, frame: false, font: false, frameWidth: 0 };
try {
  await Assets.load([{ alias: "hero", src: heroSheet }, { alias: "pixel", src: pixelFont }]);
  report.frame = Cache.has("hero/idle_0");
  report.frameWidth = Assets.get("hero/idle_0")?.width ?? 0;
  report.font = Cache.has("pixel-bitmap");
} catch (e) {
  report.error = String(e);
}
document.body.setAttribute("data-report", JSON.stringify(report));
`;

describe.skipIf(!optedIn)("?family in a real browser", () => {
  it("Pixi's loader resolves the hashed sibling files of a built spritesheet and bitmap font", { timeout: 120_000 }, async () => {
    const scratch = here("../.scratch");
    mkdirSync(scratch, { recursive: true });
    const root = mkdtempSync(join(scratch, "family-"));
    const server = createServer();
    try {
      cpSync(here("../../vite/fixtures/assets-app"), root, { recursive: true });
      writeFileSync(join(root, "src/family-page.ts"), PAGE);
      writeFileSync(join(root, "index.html"), `<!doctype html><html><body><script type="module" src="/src/family-page.ts"></script></body></html>`);
      await build({
        configFile: false,
        logLevel: "silent",
        root,
        plugins: [gableAssetFamilies()],
        build: { outDir: join(root, "dist"), minify: false, assetsInlineLimit: 0, target: "esnext" },
      });
      const dist = join(root, "dist");
      server.on("request", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const file = join(dist, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
        if (!file.startsWith(dist) || !existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;
      const { stdout: dom } = await promisify(execFile)(
        browser!,
        ["--headless=new", "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${join(root, "profile")}`, "--virtual-time-budget=20000", "--dump-dom", `http://127.0.0.1:${port}/`],
        { encoding: "utf8", timeout: 100_000, maxBuffer: 64 * 1024 * 1024 },
      );
      const raw = /data-report="([^"]*)"/.exec(dom);
      expect(raw, "the page reported").not.toBeNull();
      const report = JSON.parse(raw![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      expect(report.error).toBeUndefined();
      expect(report.sheetUrl).toMatch(/hero-[\w-]+\.json$/); // hashed, so the sibling lookup had to follow the rewrite
      expect(report.frame).toBe(true);
      expect(report.frameWidth).toBe(8);
      expect(report.font).toBe(true);
    } finally {
      server.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 5 });
    }
  });
});
