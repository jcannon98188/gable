import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(`./packages/${p}`, import.meta.url));

// Workspace packages resolve from source, so tests never need a prior build.
// Each alias mirrors an entry in the package's exports map.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@gable\/core$/, replacement: src("core/src/index.ts") },
      { find: /^@gable\/core\/renderer$/, replacement: src("core/src/renderer.ts") },
      { find: /^@gable\/core\/internal$/, replacement: src("core/src/internal.ts") },
      { find: /^@gable\/testing$/, replacement: src("testing/src/index.ts") },
      { find: /^@gable\/testing\/renderer$/, replacement: src("testing/src/renderer.ts") },
    ],
  },
  test: { include: ["packages/*/src/**/*.test.ts"] },
});
