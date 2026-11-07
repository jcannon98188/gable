// THROWAWAY SPIKE. Wrapper config handed to the *project's own* Vite: `vite <projectRoot> --config <this>`.
// It loads the project's vite config, adds the dev-only agent injection and pins the port. Nothing is written to the project.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, mergeConfig } from "vite";

const agent = readFileSync(fileURLToPath(new URL("./agent.js", import.meta.url)), "utf8");

export default async (env) => {
  const root = process.env.GABLE_DESIGNER_ROOT;
  const loaded = (await loadConfigFromFile(env, undefined, root)) ?? { config: {} };
  return mergeConfig(loaded.config, {
    root,
    server: { port: Number(process.env.GABLE_DESIGNER_PORT), strictPort: true, hmr: { overlay: false } },
    plugins: [
      {
        name: "gable-designer-agent",
        transformIndexHtml: (_, ctx) => (ctx.server ? [{ tag: "script", children: agent, injectTo: "head-prepend" }] : undefined),
      },
    ],
  });
};
