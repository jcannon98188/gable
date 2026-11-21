import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";

// A real-browser check that <gable-canvas> puts scene content on a real WebGL canvas: bundle a tiny page, load it in a
// headless Chromium (Edge or Chrome, if installed), have the page read back a pixel and report. Skipped when no browser is found.
// The full browser smoke suite is canvas/129.
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

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

describe.skipIf(!browser)("<gable-canvas> in a real browser", () => {
  it("renders scene content to a WebGL canvas and keeps one Application", { timeout: 90_000, retry: 1 }, async () => {
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
      build: {
        write: false,
        minify: false,
        lib: { entry: here("../browser-page/main.ts"), formats: ["iife"], name: "Page" },
      },
    })) as any;
    const code: string = (Array.isArray(out) ? out[0] : out).output[0].code;

    const dir = mkdtempSync(join(tmpdir(), "gable-pixi-browser-"));
    try {
      const page = join(dir, "index.html");
      writeFileSync(
        page,
        `<!doctype html><html><body style="margin:0"><div id="app" style="width:200px;height:100px"></div><script>${code.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
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
          "--virtual-time-budget=8000",
          "--dump-dom",
          pathToFileURL(page).href,
        ],
        { encoding: "utf8", timeout: 80_000, maxBuffer: 256 * 1024 * 1024 },
      );
      const report = JSON.parse(/data-report="([^"]*)"/.exec(dom)![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      expect(report).toEqual({ role: "group", label: "Demo", canvases: 1, apps: 1, pixel: [255, 0, 0, 255], placeholderGone: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
