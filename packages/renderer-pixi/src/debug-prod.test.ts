// Production builds carry none of the canvas devtools (canvas/139, canvas/119).
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = "\0canvas-devtools-prod-entry";

async function bundle(dev: boolean): Promise<string> {
  const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
  const aliases = [
    { find: /^@gablejs\/core$/, replacement: src("../../core/src/index.ts") },
    { find: /^@gablejs\/core\/renderer$/, replacement: src("../../core/src/renderer.ts") },
  ];
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root,
    define: { __GABLE_DEV__: String(dev) },
    resolve: { alias: aliases },
    plugins: [
      {
        name: "entry",
        resolveId: (id) => (id === entry ? id : undefined),
        load: (id) => (id === entry ? `import { bootstrap, hotData, isHotUpdating } from "@gablejs/core";\nimport { createPixiRenderer, provideCanvasDebug, GableCanvas } from ${JSON.stringify(src("./index.ts"))};\nconsole.log(createPixiRenderer({ debug: true }), provideCanvasDebug(), bootstrap, GableCanvas, hotData, isHotUpdating);\n` : undefined),
      },
    ],
    build: { write: false, minify: true, rollupOptions: { input: entry, external: ["pixi.js", "pixi.js/events"] }, lib: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ("output" in r ? r.output : []));
  return outputs.map((o) => ("code" in o ? o.code : "")).join("\n");
}

// Strings that only dev-only code contains: the raw-timer watch and its warnings (core), hotData's misuse error, the orphan adoption keyed by canvas-key (scene.ts).
const DEV_ONLY_MARKERS = ["started a raw", "was not cleared by any onCleanup", "hotData() called outside", "canvas-key", "declares a renderer boundary"];

describe("production build", () => {
  it("drops the overlay, the scene boundary and the hook calls when __GABLE_DEV__ is false", async () => {
    const prod = await bundle(false);
    expect(prod.length).toBeGreaterThan(1000); // it really bundled the renderer
    for (const marker of ["data-gable-canvas-debug", "registerBoundary", "gable:devtools-ready", "__GABLE_DEVTOOLS_HOOK__", "canvas scene", ...DEV_ONLY_MARKERS]) {
      expect(prod, marker).not.toContain(marker);
    }
  }, 60000);

  it("keeps them in a development build (so the check above can fail)", async () => {
    const dev = await bundle(true);
    expect(dev).toContain("data-gable-canvas-debug");
    expect(dev).toContain("registerBoundary");

    for (const marker of DEV_ONLY_MARKERS) expect(dev, marker).toContain(marker);
  }, 60000);
});

