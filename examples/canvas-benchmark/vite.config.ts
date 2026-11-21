import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Workspace packages resolve from source, as the root vitest.config.ts does, so no build is needed.
// GABLE_SRC points at another checkout's repo root: the CI gate builds the same page against the base commit's packages
// to measure a baseline on the same runner.
const root = process.env.GABLE_SRC ? resolve(process.env.GABLE_SRC) : fileURLToPath(new URL("../..", import.meta.url));
const pkg = (p: string) => resolve(root, "packages", p);

export const aliases = [
  { find: /^@gablejs\/core$/, replacement: pkg("core/src/index.ts") },
  { find: /^@gablejs\/core\/renderer$/, replacement: pkg("core/src/renderer.ts") },
  { find: /^@gablejs\/core\/internal$/, replacement: pkg("core/src/internal.ts") },
  { find: /^@gablejs\/renderer-dom$/, replacement: pkg("renderer-dom/src/index.ts") },
  { find: /^@gablejs\/renderer-pixi$/, replacement: pkg("renderer-pixi/src/index.ts") },
];

export default defineConfig({
  resolve: { alias: aliases },
  server: { fs: { strict: false } },
  build: { outDir: process.env.GABLE_BENCH_OUT ?? "dist", emptyOutDir: true, minify: process.env.GABLE_BENCH_MINIFY !== "0", target: "es2022" },
});
