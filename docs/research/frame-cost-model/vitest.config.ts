import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "../../../vitest.config.ts";

// Not mergeConfig: that would concatenate `include` and run the whole suite.
export default defineConfig({
  resolve: base.resolve,
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  test: { include: ["docs/research/frame-cost-model/*.test.ts"], testTimeout: 600000 },
});
