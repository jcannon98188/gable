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
  close(): Promise<void>;
}

export function createControlPlane(options: ControlPlaneOptions): ControlPlane {
  const bridge = new ShellBridge();
  let origin = "";
  const mcp = createMcpHttp({
    ...options,
    bridge,
    shellOrigins: () => [origin, "http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"].filter(Boolean),
  });
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
      if (options.sessionDir !== false) writeSession({ root: options.root, url: plane.url, token: mcp.token, shell: o + "/", pid: process.pid }, options.sessionDir);
    },
    async close() {
      if (options.sessionDir !== false) removeSession(options.root, mcp.token, options.sessionDir);
      bridge.close();
      await mcp.close();
    },
  };
  return plane;
}
