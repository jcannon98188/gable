// The HTTP endpoint behind the Storage panel's cookies over CDP (TASK-56.21): HttpOnly cookies and cookie attributes are
// invisible to the page, so the backend reads and writes them on the frame's target (WebView2 or a browser with a
// debugging port). Without CDP it answers `{ ok: false, error: COOKIES_NEED_CDP }` and the panel shows the page's view.
// Routed from network-api.ts (token and Host are already checked by then).
import type { IncomingMessage, ServerResponse } from "node:http";
import { COOKIES_NEED_CDP, cookieProblem, type CookieDelete, type CookieWrite } from "../storage.js";
import type { CdpEmulator } from "./cdp.js";

export interface StorageApiContext {
  cdp: CdpEmulator | null;
  json(res: ServerResponse, status: number, body: unknown): void;
  readBody(req: IncomingMessage): Promise<string>;
}

/** Handles `POST /api/storage/cookies` `{ nonce, action: "list" | "set" | "delete", cookie? }`; returns false for any other path. */
export async function handleStorageApi(ctx: StorageApiContext, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname !== "/api/storage/cookies") return false;
  const { json } = ctx;
  if (req.method !== "POST") return json(res, 405, { error: "POST only" }), true;
  let body: { nonce?: unknown; action?: unknown; cookie?: unknown };
  try {
    body = JSON.parse(await ctx.readBody(req)) as typeof body;
  } catch {
    return json(res, 400, { error: "The body is not JSON." }), true;
  }
  if (typeof body.nonce !== "string" || !["list", "set", "delete"].includes(String(body.action))) return json(res, 400, { error: "nonce and action (list, set, delete) are required" }), true;
  if (!ctx.cdp) return json(res, 200, { ok: false, error: COOKIES_NEED_CDP }), true;
  try {
    if (body.action === "set") {
      const c = body.cookie as CookieWrite;
      const problem = cookieProblem(c);
      if (problem) return json(res, 200, { ok: false, error: problem }), true;
      await ctx.cdp.setCookie(body.nonce, c);
    } else if (body.action === "delete") {
      const c = body.cookie as CookieDelete | undefined;
      if (!c || typeof c.name !== "string") return json(res, 400, { error: "cookie.name is required" }), true;
      await ctx.cdp.deleteCookie(body.nonce, c);
    }
    json(res, 200, { ok: true, ...(await ctx.cdp.cookies(body.nonce)) });
  } catch (e) {
    json(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}
