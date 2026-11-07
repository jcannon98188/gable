#!/usr/bin/env node
// gable-designer <projectDir> [--port N] [--preview-port N] [--cdp-port N] [--shell <dir>]
// Starts the backend (and through it the project's own Vite). The first line on stdout, `GABLE_DESIGNER_READY {json}`,
// tells the parent (the Tauri window, or you) where to connect.
import { fileURLToPath } from "node:url";
import { startBackend } from "./backend.js";

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
const root = args[0];
if (!root) {
  console.error("usage: gable-designer <projectDir> [--port N] [--preview-port N] [--cdp-port N] [--shell <dir>]");
  process.exit(2);
}

const backend = await startBackend({ root, shellDir: shell, port: port ? Number(port) : undefined, previewPort: previewPort ? Number(previewPort) : undefined, cdpPort: cdpPort ? Number(cdpPort) : undefined });
console.log(`GABLE_DESIGNER_READY ${JSON.stringify({ url: backend.url, token: backend.token, previewUrl: backend.previewUrl })}`);
console.error(`[designer] ${backend.url}/  (open it in a browser; the Tauri window does the same)`);
const stop = () => void backend.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// The Tauri parent passes --watch-stdin and closes our stdin when it exits.
if (watchStdin) {
  process.stdin.on("end", stop);
  process.stdin.resume();
}
