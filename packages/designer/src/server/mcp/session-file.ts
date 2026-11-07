// Where a running Designer says how to reach its MCP endpoint: `<data dir>/mcp/<project hash>.json`, readable by the
// user only. The stdio proxy (`gable-designer mcp <project>`) reads it, so an MCP client config needs no port or token.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dataDir } from "../settings.js";

export interface McpSession {
  root: string;
  /** The streamable HTTP endpoint, e.g. http://127.0.0.1:4700/mcp */
  url: string;
  token: string;
  /** The backend's own URL (open it in a browser for a Designer window). */
  shell: string;
  pid: number;
}

const fileFor = (root: string, dir: string) => join(dir, "mcp", `${createHash("sha1").update(resolve(root)).digest("hex").slice(0, 16)}.json`);

export function writeSession(session: McpSession, dir: string = dataDir()): string {
  const file = fileFor(session.root, dir);
  mkdirSync(join(dir, "mcp"), { recursive: true });
  writeFileSync(file + ".tmp", JSON.stringify(session, null, 2), { mode: 0o600 });
  renameSync(file + ".tmp", file);
  return file;
}

/** The session of a running Designer for this project, if its process is still alive. */
export function readSession(root: string, dir: string = dataDir()): McpSession | null {
  try {
    const s = JSON.parse(readFileSync(fileFor(root, dir), "utf8")) as McpSession;
    if (typeof s.url !== "string" || typeof s.token !== "string") return null;
    try {
      process.kill(s.pid, 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Removes the session file, if it is still this session's (another Designer for the project may have replaced it). */
export function removeSession(root: string, token: string, dir: string = dataDir()): void {
  try {
    const file = fileFor(root, dir);
    if ((JSON.parse(readFileSync(file, "utf8")) as McpSession).token === token) rmSync(file, { force: true });
  } catch {
    // already gone
  }
}
