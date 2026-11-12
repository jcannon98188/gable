// A copy of the `gable()` plugin from packages/vite/src/index.ts (same transform, same accept line), minus the
// tsconfig check and the i18n re-exports. packages/vite imports @gable/core/tooling from its built dist, which this
// spike does not build; copying 30 lines was cheaper than a core build. Keep in sync by hand if that file changes.
import { basename } from "node:path";
import type { Plugin } from "vite";

const GABLE_IMPORT = /\b(?:from|import)\s*["']@gable\//;
const HAS_EXPORT = /^\s*export\s/m;
const SCRIPT = /\.(?:[mc]?[jt]s|[jt]sx)$/;

function acceptLine(file: string): string {
  const self = JSON.stringify(`./${basename(file)}`);
  return [
    `import * as __gableSelf from ${self};`,
    `import * as __gableHmr from "@gable/core/hmr";`,
    `if (import.meta.hot) {`,
    `  __gableHmr.register(import.meta.url, __gableSelf);`,
    `  import.meta.hot.accept((m) => { __gableHmr.update(import.meta.url, m, import.meta.hot); });`,
    `}`,
  ].join("\n");
}

export function gable(): Plugin {
  return {
    name: "gable",
    config(_, { command }) {
      return {
        resolve: { dedupe: ["@gable/core"] },
        optimizeDeps: { exclude: ["@gable/core", "@gable/renderer-dom", "@gable/testing"] },
        oxc: { target: "es2022", decorator: { legacy: false } },
        ...(command === "build" ? { define: { __GABLE_DEV__: "false" } } : {}),
      };
    },
    transform: {
      handler(code, id) {
        if (this.environment.mode !== "dev" || this.environment.config.consumer !== "client") return;
        const file = id.split("?")[0]!;
        if (file.includes("\0") || file.includes("/node_modules/") || !SCRIPT.test(file)) return;
        if (!GABLE_IMPORT.test(code) || !HAS_EXPORT.test(code)) return;
        return { code: `${code}\n${acceptLine(file)}\n`, map: null };
      },
    },
  };
}
