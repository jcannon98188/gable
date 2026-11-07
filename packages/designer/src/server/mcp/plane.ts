// Wires the MCP control plane into the backend: the shell bridge (`/api/shell/*`, behind the shell's token), the MCP
// endpoint (`/mcp`, behind its own token) and the session file. backend.ts only forwards requests here.
import type { IncomingMessage, ServerResponse } from "node:http";
import { ShellBridge, handleShellApi } from "./bridge.js";
import type { ControlContext } from "./control.js";
import { createMcpHttp, MCP_PATH, type McpHttp } from "./http.js";
import { removeSession, writeSession } from "./session-file.js";

export interface ControlPlaneOptions extends Omit<ControlContext, "bridge" | "shellOrigins"> {
  /** Where the session file goes (the user data directory by default); `false` writes none (tests). */
  sessionDir?: string | false;
}

export interface ControlPlane {
  readonly bridge: ShellBridge;
  readonly mcp: McpHttp;
  /** Set once the backend listens. */
  url: string;
  /** `/mcp` (any token-free request is refused inside). */
  handleMcp(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
  /** `/api/shell/*`, after the backend's token check. */
  handleShell(req: IncomingMessage, res: ServerResponse, url: URL, readBody: (req: IncomingMessage) => Promise<string>, json: (res: ServerResponse, status: number, body: unknown) => void): Promise<boolean>;
  listening(origin: string): void;
  /** The backend opened another project: the session file moves to it (the stdio proxy looks a Designer up by project). */
  projectChanged(): void;
  close(): Promise<void>;
}

export function createControlPlane(options: ControlPlaneOptions): ControlPlane {
  const bridge = new ShellBridge();
  let origin = "";
  // A view over the options (not a copy): the backend's `root`, `edits`, `tailwind` and `info` are getters that follow the open project.
  const extra = { bridge, shellOrigins: () => [origin, "http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"].filter(Boolean), };
  const ctx = new Proxy(options, { get: (t, k) => (k in extra ? (extra as Record<string | symbol, unknown>)[k] : (t as unknown as Record<string | symbol, unknown>)[k]) }) as unknown as ControlContext;
  const mcp = createMcpHttp(ctx);
  let written: { root: string; token: string } | null = null;
  const writeSessionFile = () => {
    if (options.sessionDir === false) return;
    written = { root: options.root, token: mcp.token };
    writeSession({ root: options.root, url: plane.url, token: mcp.token, shell: origin + "/", pid: process.pid }, options.sessionDir);
  };
  const plane: ControlPlane = {
    bridge,
    mcp,
    url: "",
    handleMcp: (req, res, url) => mcp.handle(req, res, url),
    handleShell: (req, res, url, readBody, json) => handleShellApi(bridge, req, res, url, readBody, json),
    listening(o) {
      origin = o;
      plane.url = o + MCP_PATH;
      bridge.shellUrl = o + "/";
      writeSessionFile();
    },
    projectChanged() {
      if (!origin) return;
      if (options.sessionDir !== false && written) removeSession(written.root, written.token, options.sessionDir);
      writeSessionFile();
    },
    async close() {
      if (options.sessionDir !== false && written) removeSession(written.root, written.token, options.sessionDir);
      bridge.close();
      await mcp.close();
    },
  };
  return plane;
}
