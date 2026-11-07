// THROWAWAY SPIKE. Stand-in for the Tauri Rust side: open a project, spawn ITS vite, serve the shell, resolve ranges.
// usage: node server.mjs <projectDir> [shellPort=5190] [projectPort=5191]
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSource } from "./resolve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const projectDir = resolve(process.argv[2] ?? "../../examples/todomvc");
const shellPort = Number(process.argv[3] ?? 5190);
const projectPort = Number(process.argv[4] ?? 5191);

/** Resolve the project's own vite (falls back through node_modules ancestors, as a normal install would). */
const viteBin = join(dirname(createRequire(join(projectDir, "package.json")).resolve("vite/package.json")), "bin", "vite.js");
const vite = spawn(process.execPath, [viteBin, projectDir, "--config", join(here, "project.vite.mjs")], {
  cwd: projectDir,
  env: { ...process.env, GABLE_DESIGNER_ROOT: projectDir, GABLE_DESIGNER_PORT: String(projectPort) },
  stdio: ["ignore", "pipe", "inherit"],
});
vite.stdout.on("data", (d) => process.stdout.write(`[project vite] ${d}`));
process.on("exit", () => vite.kill());
process.on("SIGINT", () => process.exit());

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/project") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ root: projectDir, previewUrl: `http://localhost:${projectPort}/` }));
  }
  if (url.pathname === "/api/resolve" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c)).on("end", () => {
      res.setHeader("content-type", "application/json");
      try {
        res.end(JSON.stringify(resolveSource(projectDir, JSON.parse(body))));
      } catch (e) {
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }
  const file = join(here, "shell", url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(join(here, "shell")) || !existsSync(file)) return void ((res.statusCode = 404), res.end());
  res.setHeader("content-type", types[file.slice(file.lastIndexOf("."))] ?? "text/plain");
  createReadStream(file).pipe(res);
}).listen(shellPort, () => console.log(`[designer shell] http://localhost:${shellPort}/  (project ${projectDir} -> :${projectPort})`));
