// Runs the golden-image suite from the repo root: `node golden/run.mjs` compares, `node golden/run.mjs --update`
// rewrites the goldens. A thin wrapper so the opt-in env vars work the same on every shell (see README.md).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const update = process.argv.includes("--update");
const root = fileURLToPath(new URL("../../..", import.meta.url));
const result = spawnSync("npx", ["vitest", "run", "packages/renderer-pixi/src/browser-golden.test.ts"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, [update ? "GABLE_GOLDEN_UPDATE" : "GABLE_GOLDEN"]: "1" },
});
process.exit(result.status ?? 1);
