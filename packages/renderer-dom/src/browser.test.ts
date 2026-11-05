import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";

// A real-browser smoke test, with no Playwright: bundle the sample app, load it in a headless Chromium
// (Edge or Chrome, if installed) and read the report the page wrote about itself. Skipped when no browser is found.
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

describe.skipIf(!browser)("sample app in a real browser", () => {
  it("boots through bootstrap and behaves as a user would see it", { timeout: 60_000 }, async () => {
    const out = (await build({
      configFile: false,
      logLevel: "silent",
      root: here("../sample"),
      resolve: {
        alias: [
          { find: /^@gable\/core$/, replacement: here("../../core/src/index.ts") },
          { find: /^@gable\/core\/renderer$/, replacement: here("../../core/src/renderer.ts") },
          { find: /^@gable\/renderer-dom$/, replacement: here("./index.ts") },
        ],
      },
      build: { write: false, minify: false, lib: { entry: here("../sample/main.ts"), formats: ["iife"], name: "Sample" } },
    })) as any;
    const code: string = (Array.isArray(out) ? out[0] : out).output[0].code;

    const dir = mkdtempSync(join(tmpdir(), "gable-browser-"));
    try {
      const page = join(dir, "index.html");
      writeFileSync(
        page,
        `<!doctype html><html><body><div id="app"></div><script>${code.replace(/<\/script/gi, "<\/script")}</script></body></html>`,
      );
      const dom = execFileSync(
        browser!,
        ["--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${join(dir, "profile")}`, "--virtual-time-budget=3000", "--dump-dom", pathToFileURL(page).href],
        { encoding: "utf8", timeout: 45_000 },
      );
      const report = JSON.parse(/data-report="([^"]*)"/.exec(dom)![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      expect(report).toEqual({
        greeting: "Hello world",
        badges: ["write", "test"],
        badgeColor: "rgb(255, 0, 0)",
        svgNamespace: true,
        viewportLoaded: true,
        count: "1",
        greetingAfterInput: "Hello browser",
        interactionLoaded: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
