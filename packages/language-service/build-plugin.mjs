// Bundles the tsserver plugin into one CommonJS file (tsserver loads plugins with require).
// Used by this package's build and by the VS Code extension, which also inlines TypeScript
// so the plugin does not depend on the workspace.
import { fileURLToPath } from "node:url";
import { build } from "rolldown";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** @param {{ outFile: string, bundleTypescript?: boolean, minify?: boolean }} options */
export async function buildPlugin({ outFile, bundleTypescript = false, minify = false }) {
  await build({
    input: here("./src/plugin-entry.ts"),
    platform: "node",
    external: bundleTypescript ? [] : ["@typescript/typescript6"],
    // The shared expression grammar is inlined from source, so a build never needs core built first.
    resolve: { alias: { "@gable/core/tooling": here("../core/src/tooling.ts") } },
    output: { file: outFile, format: "cjs", exports: "default", minify },
    logLevel: "warn",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildPlugin({ outFile: here("./dist/plugin.cjs") });
