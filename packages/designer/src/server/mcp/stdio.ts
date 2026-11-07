// `gable-designer mcp <projectDir>`: the control plane over stdio, for MCP clients that spawn their servers. It is a
// proxy to the streamable HTTP endpoint of a Designer running for that project (found through its session file, or given
// with --url and --token), so the agent drives the same backend and window as the human. When none is running it starts
// one in this process (`--no-start` refuses instead) and prints on stderr where to open its window. stdout carries only
// MCP messages.
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend, type Backend } from "../backend.js";
import { readSession } from "./session-file.js";

export interface StdioOptions {
  root: string;
  url?: string;
  token?: string;
  start: boolean;
  shellDir?: string;
  cdpPort?: number;
}

export async function runStdio(options: StdioOptions): Promise<void> {
  const root = resolve(options.root);
  let backend: Backend | null = null;
  let url = options.url;
  let token = options.token;
  if (!url || !token) {
    const session = readSession(root);
    if (session) {
      ({ url, token } = session);
      process.stderr.write(`[gable-designer mcp] using the Designer running for ${root} (${session.shell})\n`);
    } else if (options.start) {
      backend = await startBackend({ root, shellDir: options.shellDir, cdpPort: options.cdpPort });
      ({ url, token } = backend.mcp);
      process.stderr.write(`[gable-designer mcp] started a Designer for ${root}; open ${backend.url}/ for its window\n`);
    } else throw new Error(`No Designer is running for ${root} (start one with gable-designer, or drop --no-start).`);
  }

  const upstream = new StreamableHTTPClientTransport(new URL(url!), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  const local = new StdioServerTransport();
  let closing = false;
  const shutdown = async (code = 0) => {
    if (closing) return;
    closing = true;
    await upstream.close().catch(() => undefined);
    await local.close().catch(() => undefined);
    await backend?.close().catch(() => undefined);
    process.exit(code);
  };
  // Messages pass through unchanged in both directions; the HTTP transport keeps the session id.
  local.onmessage = (m: JSONRPCMessage) => void upstream.send(m).catch((e: unknown) => replyError(m, e));
  upstream.onmessage = (m: JSONRPCMessage) => void local.send(m);
  upstream.onerror = (e) => process.stderr.write(`[gable-designer mcp] ${e.message}\n`);
  local.onclose = () => void shutdown(0);
  const replyError = (m: JSONRPCMessage, e: unknown) => {
    if ("id" in m && "method" in m) void local.send({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: `The Designer did not answer: ${e instanceof Error ? e.message : e}` } });
  };
  await upstream.start();
  await local.start();
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
}

/** `gable-designer mcp <projectDir> [--url U --token T] [--no-start] [--shell dir] [--cdp-port N]` */
export async function main(argv: string[]): Promise<void> {
  const args = [...argv];
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const url = flag("--url");
  const token = flag("--token");
  const shellDir = flag("--shell") ?? fileURLToPath(new URL("../../shell", import.meta.url));
  const cdpPort = flag("--cdp-port");
  const noStart = args.includes("--no-start");
  const root = args.filter((a) => a !== "--no-start")[0];
  if (!root) {
    process.stderr.write("usage: gable-designer mcp <projectDir> [--url <mcp url> --token <token>] [--no-start] [--shell <dir>] [--cdp-port N]\n");
    process.exit(2);
  }
  try {
    await runStdio({ root, url, token, start: !noStart, shellDir, cdpPort: cdpPort ? Number(cdpPort) : undefined });
  } catch (e) {
    process.stderr.write(`[gable-designer mcp] ${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  }
}
