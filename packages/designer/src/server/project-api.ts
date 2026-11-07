// The HTTP endpoints for the project itself: switching projects, recent projects, the folder lister, installing what the
// Preview agent needs, and the dev server's log and restart. backend.ts forwards requests it does not recognise here (token
// and Host are already checked by then).
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { listFolders, projectProblem, recentProjects } from "./projects.js";

export interface ProjectApiContext {
  root(): string;
  dataDir: string;
  log(): string;
  /** Switches the backend to another project (closes the current one first). */
  open(root: string): Promise<unknown>;
  restart(): Promise<unknown>;
  /** Starts installing; resolves with an error message when it cannot start. */
  install(): Promise<string | null>;
  json(res: ServerResponse, status: number, body: unknown): void;
  readBody(req: IncomingMessage): Promise<string>;
}

/** Handles `/api/project/*` and `/api/server/*` (not `/api/project` itself); returns false for any other path. */
export async function handleProjectApi(ctx: ProjectApiContext, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const { json } = ctx;
  const post = req.method === "POST";
  switch (url.pathname) {
    case "/api/project/recent":
      json(res, 200, recentProjects(ctx.dataDir));
      return true;
    case "/api/project/folders": {
      const current = ctx.root();
      json(res, 200, listFolders(url.searchParams.get("dir") ?? resolve(current, "..")));
      return true;
    }
    case "/api/project/open": {
      if (!post) return json(res, 405, { error: "POST only" }), true;
      const body = JSON.parse((await ctx.readBody(req)) || "{}") as { root?: unknown };
      const root = typeof body.root === "string" ? body.root.trim() : "";
      const problem = projectProblem(root);
      if (problem) return json(res, 400, { error: problem }), true;
      json(res, 200, await ctx.open(resolve(root)));
      return true;
    }
    case "/api/project/install": {
      if (!post) return json(res, 405, { error: "POST only" }), true;
      const error = await ctx.install();
      if (error) json(res, 409, { error });
      else json(res, 202, { ok: true });
      return true;
    }
    case "/api/server/log":
      json(res, 200, { text: ctx.log() });
      return true;
    case "/api/server/restart":
      if (!post) return json(res, 405, { error: "POST only" }), true;
      json(res, 200, await ctx.restart());
      return true;
  }
  return false;
}
