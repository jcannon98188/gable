// The HTTP endpoints behind the Source control view (TASK-56.25): `/api/git/status`, `/api/git/diff?path=`, and POSTs for
// `commit`, `revert` and `undo-revert`. Token and Host are already checked by the backend; every write tells the shell
// through `changed` (the `git` event on the existing event stream) so other windows and the MCP tools stay in step.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { GitService } from "./git.js";

export interface GitApiContext {
  git: GitService;
  /** Tells the shell the changes may have changed. */
  changed(): void;
  json(res: ServerResponse, status: number, body: unknown): void;
  readBody(req: IncomingMessage): Promise<string>;
}

/** Handles `/api/git/*`; returns false for any other path. */
export async function handleGitApi(ctx: GitApiContext, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith("/api/git/")) return false;
  const { json, git } = ctx;
  const route = url.pathname.slice("/api/git/".length);
  if (route === "status") return json(res, 200, await git.status()), true;
  if (route === "diff") {
    const path = url.searchParams.get("path");
    if (!path) return json(res, 400, { error: "path is required" }), true;
    return json(res, 200, await git.diff(path)), true;
  }
  if (!["commit", "revert", "undo-revert"].includes(route)) return false;
  if (req.method !== "POST") return json(res, 405, { error: "POST only" }), true;
  let body: { paths?: unknown; message?: unknown; path?: unknown; hunk?: unknown; header?: unknown };
  try {
    body = JSON.parse((await ctx.readBody(req)) || "{}") as typeof body;
  } catch {
    return json(res, 400, { error: "The body is not JSON." }), true;
  }
  const result =
    route === "commit"
      ? Array.isArray(body.paths) && body.paths.every((p) => typeof p === "string")
        ? await git.commit(body.paths as string[], String(body.message ?? ""))
        : { ok: false, code: "invalid", error: "paths must be a list of file paths." }
      : route === "undo-revert"
        ? await git.undoRevert()
        : typeof body.path !== "string"
          ? { ok: false, code: "invalid", error: "path is required." }
          : typeof body.hunk === "number"
            ? await git.revertHunk(body.path, body.hunk, String(body.header ?? ""))
            : await git.revertFile(body.path);
  ctx.changed();
  json(res, 200, result);
  return true;
}
