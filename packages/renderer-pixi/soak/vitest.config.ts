import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "../../../vitest.config.js";

// The soak needs `--expose-gc` in the worker, so it runs on its own (never as part of the default `vitest run`).
export default defineConfig({
  ...base,
  root: fileURLToPath(new URL("../../..", import.meta.url)),
  test: { include: ["packages/renderer-pixi/soak/*.test.ts"], pool: "forks", execArgv: ["--expose-gc"], testTimeout: 600_000 },
});
