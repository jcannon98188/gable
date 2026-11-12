import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { gable } from "./gable-plugin.ts";

const pkg = (p: string) => fileURLToPath(new URL(`../../packages/${p}`, import.meta.url));
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Workspace packages resolve from source (as the repo's vitest config does), so the spike needs no prior build.
// PROFILE=1 builds unminified into dist-profile so a CPU profile shows real function names.
const profile = process.env.PROFILE === "1";

export default defineConfig({
  plugins: [gable()],
  server: { fs: { strict: false } },
  resolve: {
    alias: [
      { find: /^@gable\/core$/, replacement: pkg("core/src/index.ts") },
      { find: /^@gable\/core\/renderer$/, replacement: pkg("core/src/renderer.ts") },
      { find: /^@gable\/core\/hmr$/, replacement: pkg("core/src/hmr.ts") },
      { find: /^@gable\/core\/devtools$/, replacement: pkg("core/src/devtools.ts") },
      { find: /^@gable\/core\/internal$/, replacement: pkg("core/src/internal.ts") },
      { find: /^@gable\/renderer-dom$/, replacement: pkg("renderer-dom/src/index.ts") },
    ],
  },
  build: {
    outDir: profile ? "dist-profile" : "dist",
    minify: !profile,
    target: "es2022",
    rollupOptions: { input: { index: here("index.html"), bench: here("bench.html") } },
  },
});
