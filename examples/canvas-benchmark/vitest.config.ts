import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import root from "../../vitest.config.ts";

// The Node microbench: the same entities and phase recorder as the browser page, against a fake Application (no GPU).
// Packages resolve from source through the root config's aliases; only the include list differs (mergeConfig would append to it).
export default defineConfig({
  resolve: root.resolve,
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: { include: ["examples/canvas-benchmark/microbench/*.bench.test.ts"], testTimeout: 120000, hookTimeout: 30000 },
});
