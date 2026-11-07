import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const store = fileURLToPath(new URL("./index.ts", import.meta.url));

async function bundle(dev: boolean): Promise<string> {
  const entry = "\0store-prod-entry";
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root: fileURLToPath(new URL("../", import.meta.url)),
    define: { __GABLE_DEV__: String(dev) },
    resolve: {
      alias: [
        { find: /^@gable\/core\/internal$/, replacement: fileURLToPath(new URL("../../core/src/internal.ts", import.meta.url)) },
        { find: /^@gable\/core\/rxjs$/, replacement: fileURLToPath(new URL("../../core/src/rxjs.ts", import.meta.url)) },
        { find: /^@gable\/core$/, replacement: fileURLToPath(new URL("../../core/src/index.ts", import.meta.url)) },
      ],
    },
    plugins: [
      {
        name: "entry",
        enforce: "pre",
        resolveId: (id) => (id === entry ? id : id === "@gable/store" ? store : undefined),
        load: (id) =>
          id === entry
            ? `import { signalStore, withState, withMethods, withDevtools } from "@gable/store";
class S extends signalStore(withState({ n: 0 }), withMethods(() => ({ inc() { return 1; } })), withDevtools("S")) {}
console.log(S);\n`
            : undefined,
      },
    ],
    build: { write: false, minify: true, rollupOptions: { input: entry }, lib: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ("output" in r ? r.output : []));
  return outputs.map((o) => ("code" in o ? o.code : "")).join("\n");
}

describe("store production build", () => {
  it("drops the devtools inspector and action wrappers when __GABLE_DEV__ is false", async () => {
    const prod = await bundle(false);
    expect(prod.length).toBeGreaterThan(300);
    for (const marker of ["__GABLE_DEVTOOLS_HOOK__", "registerInspector", "[Observable]", "[Function"]) {
      expect(prod, marker).not.toContain(marker);
    }
  }, 60000);

  it("keeps them in a development build (so the check above can fail)", async () => {
    const dev = await bundle(true);
    expect(dev).toContain("__GABLE_DEVTOOLS_HOOK__");
    expect(dev).toContain("[Observable]");
  }, 60000);
});
