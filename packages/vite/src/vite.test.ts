import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, createServer, type Rollup } from "vite";
import { describe, expect, it } from "vitest";
import { browserPath, openPage } from "./test-browser.js";
import { sampleApp } from "./test-server.js";

describe("production build", () => {
  it("contains no HMR code and no accept lines", { timeout: 60_000 }, async () => {
    const app = sampleApp();
    try {
      const out = (await build({ ...app.config, build: { write: false, minify: false } })) as Rollup.RollupOutput | Rollup.RollupOutput[];
      const code = (Array.isArray(out) ? out[0]! : out).output.map((o) => (o.type === "chunk" ? o.code : "")).join("\n");
      expect(code).toContain("count"); // the app itself is there
      expect(code).not.toMatch(/import\.meta\.hot|__gableHmr|__gableSelf|applyUpdate|registerModule|invalidate\(/);
      expect(code).not.toMatch(/hooks\.current|dev-hooks/);
    } finally {
      app.remove();
    }
  });
});

describe("dev server", () => {
  it("serves modules with the accept line, except the entry", { timeout: 60_000 }, async () => {
    const app = sampleApp();
    const server = await createServer(app.config);
    try {
      await server.listen();
      const get = async (path: string) => (await server.transformRequest(path))!.code;
      const appModule = await get("/src/app.ts");
      expect(appModule).toMatch(/import\.meta\.hot\.accept/);
      expect(appModule).toMatch(/__gableHmr\.register\(import\.meta\.url/);
      expect(appModule).toMatch(/\bcount = signal\(0\);/); // a native class field, not moved into a constructor
      expect(appModule).not.toMatch(/constructor/);
      expect(await get("/src/main.ts")).not.toMatch(/import\.meta\.hot/); // no exports: falls through to a full reload
    } finally {
      await server.close();
      app.remove();
    }
  });

  it.skipIf(!browserPath)("hot-updates a component in a real browser and keeps its state", { timeout: 90_000 }, async () => {
    const app = sampleApp();
    const server = await createServer(app.config);
    await server.listen();
    const page = await openPage();
    try {
      await page.goto(server.resolvedUrls!.local[0]!);
      await page.waitFor(`document.querySelector(".inc")`);
      await page.eval(`window.__survivor = "same page"; document.querySelector(".inc").click(); document.querySelector(".inc").click();`);
      await page.waitFor(`document.querySelector(".count").textContent === "2"`);

      const file = join(app.root, "src/app.ts");
      writeFileSync(file, readFileSync(file, "utf8").replace("Count:", "Total:").replace("n + 1", "n + 10"));
      await page.waitFor(`document.querySelector(".label").textContent === "Total:"`);

      expect(await page.eval(`document.querySelector(".count").textContent`)).toBe("2"); // signal state survived
      expect(await page.eval(`window.__survivor`)).toBe("same page"); // no full reload
      await page.eval(`document.querySelector(".inc").click()`);
      await page.waitFor(`document.querySelector(".count").textContent === "12"`); // the new method body is live
    } finally {
      page.close();
      await server.close();
      app.remove();
    }
  });
});

describe("beside Tailwind v4", () => {
  it("composes with @tailwindcss/vite: utilities used in a template reach the stylesheet", { timeout: 60_000 }, async () => {
    const { default: tailwind } = await import("@tailwindcss/vite");
    const app = sampleApp();
    try {
      writeFileSync(join(app.root, "src/styles.css"), '@import "tailwindcss";\n');
      writeFileSync(join(app.root, "src/main.ts"), readFileSync(join(app.root, "src/main.ts"), "utf8") + 'import "./styles.css";\n');
      const file = join(app.root, "src/app.ts");
      writeFileSync(file, readFileSync(file, "utf8").replace('class="label"', 'class="label font-bold text-red-500"'));
      const out = (await build({ ...app.config, plugins: [tailwind(), ...(app.config.plugins as never[])], build: { write: false, minify: false } })) as Rollup.RollupOutput | Rollup.RollupOutput[];
      const css = (Array.isArray(out) ? out[0]! : out).output.map((o) => (o.type === "asset" ? String(o.source) : "")).join("\n");
      expect(css).toMatch(/\.text-red-500/);
    } finally {
      app.remove();
    }
  });
});
