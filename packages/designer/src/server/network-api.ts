// The HTTP endpoints behind the Network panel: the scenes files' mocks as written (read-only here; writes go through
// /api/edit/apply like every other source edit), and taking a whole frame offline over CDP. Kept out of backend.ts, which
// only forwards requests it does not recognise here (token and Host are already checked by then).
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { OFFLINE_NEEDS_CDP, type SceneMocks } from "../network.js";
import type { CdpEmulator } from "./cdp.js";
import { readMocks } from "./edit/mocks.js";
import type { EditError } from "./edit/types.js";
import { handleStorageApi } from "./storage-api.js";

export interface NetworkApiContext {
  root: string;
  cdp: CdpEmulator | null;
  json(res: ServerResponse, status: number, body: unknown): void;
  readBody(req: IncomingMessage): Promise<string>;
}

export type MocksResult = { ok: true; file: string; scenes: SceneMocks[] } | EditError;

/** The mocks of the scenes file `file` (root-relative, `/src/x.scenes.ts`), read from the source. */
export function mocksOf(root: string, file: string): MocksResult {
  if (!/\.scenes\.ts$/.test(file)) return { ok: false, code: "invalid", error: "Mocks live in *.scenes.ts files." };
  const abs = resolve(join(root, file.replace(/^\//, "")));
  const rel = relative(resolve(root), abs);
  if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("node_modules")) return { ok: false, code: "invalid", error: "Only the project's own scenes files are read." };
  if (!existsSync(abs)) return { ok: false, code: "missing", error: `${file} does not exist.` };
  const scenes = readMocks(readFileSync(abs, "utf8").replaceAll("\r\n", "\n"));
  return "ok" in scenes ? scenes : { ok: true, file: "/" + rel.split(sep).join("/"), scenes };
}

/** Handles `/api/network/*`, `/api/mocks` and the Storage panel's `/api/storage/*`; returns false for any other path. */
export async function handleNetworkApi(ctx: NetworkApiContext, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const { json } = ctx;
  if (url.pathname.startsWith("/api/storage/")) return handleStorageApi(ctx, req, res, url);
  switch (url.pathname) {
    case "/api/mocks": {
      json(res, 200, mocksOf(ctx.root, url.searchParams.get("file") ?? ""));
      return true;
    }
    case "/api/network/offline": {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" }), true;
      const body = JSON.parse(await ctx.readBody(req)) as { nonce?: unknown; offline?: unknown };
      if (typeof body.nonce !== "string" || typeof body.offline !== "boolean") return json(res, 400, { error: "nonce and offline are required" }), true;
      if (!ctx.cdp) return json(res, 200, { ok: false, error: OFFLINE_NEEDS_CDP }), true;
      try {
        await ctx.cdp.setOffline(body.nonce, body.offline);
        json(res, 200, { ok: true, offline: body.offline });
      } catch (e) {
        json(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      return true;
    }
  }
  return false;
}
