import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InlineConfig } from "vite";
import { gable } from "./index.js";

export const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Workspace packages resolve from source, like the other packages' tests. */
export const sourceAliases = [
  { find: /^@gable\/core$/, replacement: here("../../core/src/index.ts") },
  { find: /^@gable\/core\/renderer$/, replacement: here("../../core/src/renderer.ts") },
  { find: /^@gable\/core\/hmr$/, replacement: here("../../core/src/hmr.ts") },
  { find: /^@gable\/renderer-dom$/, replacement: here("../../renderer-dom/src/index.ts") },
];

/** A scratch copy of the sample app (so tests can edit files), and the Vite config that serves or builds it. */
export function sampleApp(extra: InlineConfig = {}): { root: string; config: InlineConfig; remove(): void } {
  // Inside the package, so the copy resolves tailwindcss and friends from the workspace node_modules.
  const scratch = here("../.scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "app-"));
  cpSync(here("../fixtures/app"), root, { recursive: true });
  return {
    root,
    config: {
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [gable()],
      resolve: { alias: sourceAliases },
      server: { port: 0, fs: { strict: false } },
      ...extra,
    },
    remove: () => rmSync(root, { recursive: true, force: true, maxRetries: 5 }),
  };
}
