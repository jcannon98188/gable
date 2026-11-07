#!/usr/bin/env node
// gable-designer [projectDir] [--port N] [--preview-port N] [--cdp-port N] [--shell <dir>]
// Starts the backend (and through it the project's own Vite). The first line on stdout, `GABLE_DESIGNER_READY {json}`,
// tells the parent (the Tauri window, or you) where to connect. Without a project it opens the most recent one; the Open
// project dialog switches to another without restarting this process.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./backend.js";
import { projectProblem, recentProjects, rememberProject } from "./projects.js";

// `gable-designer mcp <projectDir>`: the MCP control plane over stdio (see mcp/stdio.ts). It runs until its client closes
// stdin and exits from there, so nothing below runs in that mode.
if (process.argv[2] === "mcp") {
  await (await import("./mcp/stdio.js")).main(process.argv.slice(3));
  await new Promise<never>(() => undefined);
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const port = flag("--port");
const previewPort = flag("--preview-port");
const cdpPort = flag("--cdp-port");
const shell = flag("--shell") ?? fileURLToPath(new URL("../shell", import.meta.url));
const watchStdin = args.includes("--watch-stdin");
if (watchStdin) args.splice(args.indexOf("--watch-stdin"), 1);
const root = args[0] ? resolve(args[0]) : recentProjects().find((p) => !p.missing)?.root;
if (!root) {
  console.error("usage: gable-designer [projectDir] [--port N] [--preview-port N] [--cdp-port N] [--shell <dir>]  (no recent project to open)");
  process.exit(2);
}
const problem = projectProblem(root);
if (problem) console.error(`[designer] ${problem}`);
else rememberProject(root);

const backend = await startBackend({ root, shellDir: shell, port: port ? Number(port) : undefined, previewPort: previewPort ? Number(previewPort) : undefined, cdpPort: cdpPort ? Number(cdpPort) : undefined });
console.log(`GABLE_DESIGNER_READY ${JSON.stringify({ url: backend.url, token: backend.token, previewUrl: backend.previewUrl, mcp: backend.mcp })}`);
console.error(`[designer] ${backend.url}/  (open it in a browser; the Tauri window does the same)`);
const stop = () => void backend.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// The Tauri parent passes --watch-stdin and closes our stdin when it exits.
if (watchStdin) {
  process.stdin.on("end", stop);
  process.stdin.resume();
}
