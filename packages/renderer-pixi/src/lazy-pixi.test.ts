// An app that only calls provideAssets (or reads Frame, Pointer...) must not statically import pixi.js (TASK-105.3 #3, TASK-104.12).
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = "\0lazy-pixi-entry";
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

async function bundle(code: string): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root,
    define: { __GABLE_DEV__: "false" },
    resolve: { alias: [{ find: /^@gable\/core$/, replacement: src("../../core/src/index.ts") }, { find: /^@gable\/core\/renderer$/, replacement: src("../../core/src/renderer.ts") }] },
    plugins: [{ name: "entry", resolveId: (id) => (id === entry ? id : undefined), load: (id) => (id === entry ? code : undefined) }],
    build: { write: false, minify: false, rollupOptions: { input: entry, external: [/^pixi\.js/] }, lib: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ("output" in r ? r.output : []));
  return outputs
    .filter((o) => o.type === "chunk" && o.isEntry)
    .map((o) => ("code" in o ? o.code : ""))
    .join("\n");
}

const staticPixiImport = /^\s*import\s+(?:[^;]*?\sfrom\s+)?["']pixi\.js[^"']*["']/m;

describe("pixi.js stays out of the entry chunk", () => {
  it("when an app only calls provideAssets and reads services", async () => {
    const code = await bundle(`import { provideAssets, Assets, Frame, Pointer } from ${JSON.stringify(src("./index.ts"))};\nconsole.log(provideAssets({ bundles: {} }), Assets, Frame, Pointer);\n`);
    expect(code).toContain("AssetsOptions"); // it really bundled the Assets service
    expect(code).not.toMatch(staticPixiImport);
  }, 60000);

  it("and the check can fail: importing the renderer does import pixi.js", async () => {
    const code = await bundle(`import { createPixiRenderer } from ${JSON.stringify(src("./index.ts"))};\nconsole.log(createPixiRenderer());\n`);
    expect(code).toMatch(staticPixiImport);
  }, 60000);
});
