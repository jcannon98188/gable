// A wrapper config handed to the PROJECT'S OWN Vite: `vite <root> --config <this file>`. It loads the project's own config,
// adds the designer plugin and pins the port. Nothing is written to the project. Vite is taken from the project, not from
// here, so the project's plugins and the plugin API they were written for are the ones in play.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { UserConfig } from "vite";
import { designerPlugin } from "./vite-plugin.js";

type Env = { command: "serve" | "build"; mode: string };

export default async (env: Env): Promise<UserConfig> => {
  const root = process.env.GABLE_DESIGNER_ROOT!;
  const vitePath = createRequire(pathToFileURL(root + "/package.json")).resolve("vite");
  const vite: typeof import("vite") = await import(pathToFileURL(vitePath).href);
  const loaded = (await vite.loadConfigFromFile(env, undefined, root)) ?? { config: {} };
  const agentFile = fileURLToPath(new URL("../agent/agent.js", import.meta.url));
  // The accessibility checker the agent loads; the Designer's own copy, so the project needs none.
  let axeFile: string | null = null;
  try {
    axeFile = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
  } catch {
    // not installed: the agent reports that checks cannot run
  }
  return vite.mergeConfig(loaded.config as UserConfig, {
    root,
    server: { port: Number(process.env.GABLE_DESIGNER_PORT), strictPort: true, hmr: { overlay: false } },
    plugins: [designerPlugin({ agentFile, axeFile })],
  });
};
