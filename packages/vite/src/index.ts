import { basename } from "node:path";
import type { Plugin } from "vite";
import { checkTsconfig } from "./tsconfig-check.js";

const GABLE_IMPORT = /\b(?:from|import)\s*["']@gable\//;
const HAS_EXPORT = /^\s*export\s/m;
const SCRIPT = /\.(?:[mc]?[jt]s|[jt]sx)$/;

/**
 * The accept line for one module (dev only). `register` records the classes the module exports at first
 * evaluation; the self-accept callback hands each re-evaluated namespace to the runtime.
 */
export function acceptLine(file: string): string {
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

/**
 * The Gable Vite plugin. Dev server only: appends a self-accept line to modules that export something and import
 * from Gable (no template or metadata parsing). Always: native class fields at ES2022, no decorators, a fail-fast
 * tsconfig check, and one copy of `@gable/core`. Production builds get no Gable transform.
 */
export function gable(): Plugin {
  let root = "";
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
    configResolved(config) {
      root = config.root;
      checkTsconfig(config.root, config.tsconfig);
    },
    // Dev server only: tells the devtools extension where the project is, so it can open a component's source file.
    transformIndexHtml(_, ctx) {
      if (!ctx.server) return;
      return [{ tag: "script", children: `globalThis.__GABLE_DEV_SERVER__ = ${JSON.stringify({ root })};`, injectTo: "head-prepend" }];
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
