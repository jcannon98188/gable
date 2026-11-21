import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";

// The real-browser smoke suite (canvas/115): one opt-in run in a headless Chromium with WebGL (software GL), mounting
// a scene through the real renderer to catch wiring mistakes no double can: host lifecycle, the DOM and scene event
// path, the a11y mirror. Opt in with GABLE_BROWSER_SMOKE=1 (CI sets it only when the canvas packages change, see
// .github/workflows/canvas-browser.yml). GABLE_BROWSER points at a Chromium, Edge or Chrome binary; common install
// locations are tried otherwise.
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

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

describe.skipIf(!optedIn)("canvas browser smoke suite", () => {
  it("mounts a scene, routes pointer and key events, and passes axe on the a11y mirror", { timeout: 120_000, retry: 1 }, async () => {
    const out = (await build({
      configFile: false,
      logLevel: "silent",
      root: here("../browser-page"),
      resolve: {
        alias: [
          { find: /^@gablejs\/core$/, replacement: here("../../core/src/index.ts") },
          { find: /^@gablejs\/core\/renderer$/, replacement: here("../../core/src/renderer.ts") },
          { find: /^@gablejs\/renderer-dom$/, replacement: here("../../renderer-dom/src/index.ts") },
        ],
      },
      build: { write: false, minify: false, lib: { entry: here("../browser-page/smoke.ts"), formats: ["iife"], name: "Page" } },
    })) as any;
    const code: string = (Array.isArray(out) ? out[0] : out).output[0].code;
    const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
    const inline = (s: string) => s.replace(/<\/script/gi, "<\\/script");

    const dir = mkdtempSync(join(tmpdir(), "gable-pixi-smoke-"));
    try {
      const page = join(dir, "index.html");
      writeFileSync(
        page,
        `<!doctype html><html lang="en"><head><title>Smoke</title></head><body style="margin:0"><main><div id="app" style="width:200px;height:100px"></div></main><script>${inline(axeSource)}</script><script>${inline(code)}</script></body></html>`,
      );
      const dom = execFileSync(
        browser!,
        [
          "--headless=new",
          "--no-sandbox",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
          `--user-data-dir=${join(dir, "profile")}`,
          "--virtual-time-budget=20000",
          "--dump-dom",
          pathToFileURL(page).href,
        ],
        { encoding: "utf8", timeout: 100_000, maxBuffer: 256 * 1024 * 1024 },
      );
      const raw = /data-report="([^"]*)"/.exec(dom);
      expect(raw, "the page reported").not.toBeNull();
      const report = JSON.parse(raw![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

      expect(report.error).toBeUndefined();
      // 1. Non-blank: the red rectangle is drawn, the rest of the stage is empty.
      expect(report.canvases).toBe(1);
      expect(report.pixelInside).toEqual([255, 0, 0, 255]);
      expect(report.pixelOutside).toEqual([0, 0, 0, 0]); // nothing drawn there (the stage extract excludes the background)
      // 2. A pointer event reaches the scene node and the Pointer service; a key event reaches the Keyboard service.
      expect(report.taps).toEqual(["red"]);
      expect(report.errors).toEqual([]);
      expect(report.pointerPosition).toEqual({ x: 10, y: 10 });
      expect(report.hostFocused).toBe(true);
      expect(report.keyIsDown).toBe(true);
      // 3. axe-core: the host has an a11y mirror and reports no violations.
      expect(report.mirrorButtons).toBe(1);
      expect(report.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
