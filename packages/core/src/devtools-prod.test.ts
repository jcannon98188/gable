import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const core = fileURLToPath(new URL("./index.ts", import.meta.url));

async function bundle(dev: boolean): Promise<string> {
  const entry = "\0devtools-prod-entry";
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root: fileURLToPath(new URL("../", import.meta.url)),
    define: { __GABLE_DEV__: String(dev) },
    plugins: [
      {
        name: "entry",
        // The published package lists its index as having side effects (see core's package.json); mirror that for the source.
        resolveId: (id) => (id === entry ? id : id === "@gable/core" ? { id: core, moduleSideEffects: true } : undefined),
        load: (id) => (id === entry ? `import { signal, computed, effect, html } from "@gable/core";\nconsole.log(signal(1)(), computed, effect, html);\n` : undefined),
      },
    ],
    build: { write: false, minify: true, rollupOptions: { input: entry }, lib: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ("output" in r ? r.output : []));
  return outputs.map((o) => ("code" in o ? o.code : "")).join("\n");
}

describe("production build", () => {
  it("drops the devtools hook and instrumentation when __GABLE_DEV__ is false", async () => {
    const prod = await bundle(false);
    expect(prod.length).toBeGreaterThan(1000); // it really bundled the core
    for (const marker of ["__GABLE_DEVTOOLS_HOOK__", "gable:devtools-ready", "__open-in-editor", "registerInspector", "data-gable-devtools"]) {
      expect(prod, marker).not.toContain(marker);
    }
  }, 60000);

  it("keeps it in a development build (so the check above can fail)", async () => {
    const dev = await bundle(true);
    expect(dev).toContain("__GABLE_DEVTOOLS_HOOK__");
  }, 60000);
});
