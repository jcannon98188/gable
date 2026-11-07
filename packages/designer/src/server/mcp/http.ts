// The MCP control plane over streamable HTTP, at `/mcp` on the backend's own listener (127.0.0.1 only; the backend has
// already refused any Host but its loopback names, against DNS rebinding). It has its own per-session token, separate from
// the shell's: `Authorization: Bearer <token>`. The URL and token are printed on the READY line and kept in a session file
// in the user data directory (see `session-file.ts`) so the stdio proxy can find a running Designer.
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createControlServer, type ControlContext } from "./control.js";

export const MCP_PATH = "/mcp";

export interface McpHttp {
  readonly token: string;
  /** Handles `/mcp`; false for any other path. */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
  close(): Promise<void>;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const rpcError = (res: ServerResponse, status: number, message: string) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
};

export function createMcpHttp(ctx: ControlContext, token: string = randomBytes(24).toString("hex")): McpHttp {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== MCP_PATH) return false;
    const auth = req.headers.authorization ?? "";
    if (!same(auth, `Bearer ${token}`)) {
      rpcError(res, 401, "Missing or wrong token: send Authorization: Bearer <token> (printed by gable-designer, also in its session file).");
      return true;
    }
    let body: unknown;
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
      } catch {
        rpcError(res, 400, "Parse error");
        return true;
      }
    }
    const id = req.headers["mcp-session-id"];
    let transport = typeof id === "string" ? sessions.get(id) : undefined;
    if (!transport) {
      if (req.method !== "POST" || !(Array.isArray(body) ? body.some((m) => isInitializeRequest(m)) : isInitializeRequest(body))) {
        rpcError(res, id ? 404 : 400, id ? "Unknown or expired session; initialize again." : "No session: the first request must be initialize.");
        return true;
      }
      const created = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (sid) => void sessions.set(sid, created) });
      created.onclose = () => {
        if (created.sessionId) sessions.delete(created.sessionId);
      };
      // One server per session: an McpServer serves exactly one transport.
      await createControlServer(ctx).connect(created);
      transport = created;
    }
    await transport.handleRequest(req, res, body);
    return true;
  }

  return {
    token,
    handle,
    async close() {
      await Promise.all([...sessions.values()].map((t) => t.close().catch(() => undefined)));
      sessions.clear();
    },
  };
}
