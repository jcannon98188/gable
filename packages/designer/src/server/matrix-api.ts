// The HTTP endpoint behind the matrix panel and its MCP tools (TASK-56.22): `POST /api/matrix` with a `MatrixCommand`.
// Routed from backend.ts (token and Host are already checked by then). The render is slow (a headless browser per run), so
// the answer is one JSON body when it is done; the pictures come as data URLs.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MatrixCommand, MatrixCommandResult } from "../matrix.js";
import type { MatrixStore } from "./matrix.js";

export interface MatrixApiContext {
  store(): MatrixStore;
  json(res: ServerResponse, status: number, body: unknown): void;
  readBody(req: IncomingMessage): Promise<string>;
}

export async function runMatrixCommand(store: MatrixStore, c: MatrixCommand): Promise<MatrixCommandResult> {
  switch (c.action) {
    case "report":
      return { run: store.run };
    case "run":
      return { run: await store.runMatrix(c.request) };
    case "baseline":
      return { saved: store.saveBaselines(c.which), run: store.run };
    case "forget":
      return { saved: store.forget(c.which), run: store.run };
    case "detail":
      return { run: store.run, detail: store.detail(c.cell) };
    case "open":
      return { run: store.run, detail: store.detail(c.cell) };
  }
}

/** Handles `POST /api/matrix`; returns false for any other path. */
export async function handleMatrixApi(ctx: MatrixApiContext, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname !== "/api/matrix") return false;
  if (req.method !== "POST") return ctx.json(res, 405, { error: "POST only" }), true;
  let command: MatrixCommand;
  try {
    command = JSON.parse(await ctx.readBody(req)) as MatrixCommand;
  } catch {
    return ctx.json(res, 400, { error: "The body is not JSON." }), true;
  }
  if (!command || !["report", "run", "baseline", "forget", "detail", "open"].includes(command.action)) return ctx.json(res, 400, { error: "action must be report, run, baseline, forget or detail" }), true;
  try {
    ctx.json(res, 200, { ok: true, ...(await runMatrixCommand(ctx.store(), command)) });
  } catch (e) {
    ctx.json(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}
