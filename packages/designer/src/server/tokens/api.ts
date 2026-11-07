// The HTTP endpoints behind the Tokens tab (`/api/tokens/*`). backend.ts forwards requests here after its token and Host
// checks. Edits are not written here: the shell (and MCP) send the `setToken` edit op to the edit service, so a token edit
// is a minimal patch on the same undo history as every other edit.
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { TailwindService } from "../tailwind/api.js";
import { buildTokenIndex, tokenSignature, type TokenIndex } from "./model.js";
import type { TokenUsagesResult } from "./types.js";

/** The token index of one project, rebuilt when a stylesheet or template source changed (or Tailwind reloaded). */
export class TokenService {
  readonly root: string;
  #cache: { key: string; index: TokenIndex } | null = null;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async index(tailwind: TailwindService | null): Promise<TokenIndex> {
    const model = tailwind ? (await tailwind.load()).model : null;
    const key = `${tailwind?.revision ?? -1}|${model ? 1 : 0}|${tokenSignature(this.root)}`;
    if (this.#cache?.key === key) return this.#cache.index;
    const index = buildTokenIndex(this.root, model);
    this.#cache = { key, index };
    return index;
  }

  async usages(name: string, tailwind: TailwindService | null): Promise<TokenUsagesResult> {
    const index = await this.index(tailwind);
    const t = index.byName.get(name);
    if (!t) return { ok: false, error: `No token ${name} in this project's stylesheets.` };
    return { ok: true, name, usages: index.usages(name), aliases: t.aliases };
  }
}

const services = new Map<string, TokenService>();

/** The service for a project root (one per root, so its cache survives between requests). */
export function tokenService(root: string): TokenService {
  const key = resolve(root);
  let s = services.get(key);
  if (!s) services.set(key, (s = new TokenService(key)));
  return s;
}

export interface TokenApiContext {
  root: string;
  tailwind: TailwindService | null;
  json(res: ServerResponse, status: number, body: unknown): void;
  readBody(req: IncomingMessage): Promise<string>;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Handles `/api/tokens/*`; returns false for any other path. */
export async function handleTokenApi(ctx: TokenApiContext, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith("/api/tokens/")) return false;
  const service = tokenService(ctx.root);
  const body = async (): Promise<Record<string, unknown>> => {
    try {
      return JSON.parse((await ctx.readBody(req)) || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  try {
    switch (url.pathname) {
      case "/api/tokens/list":
        ctx.json(res, 200, (await service.index(ctx.tailwind)).list);
        return true;
      case "/api/tokens/usages": {
        const b = await body();
        ctx.json(res, 200, await service.usages(str(b.name) || (url.searchParams.get("name") ?? ""), ctx.tailwind));
        return true;
      }
      case "/api/tokens/element": {
        const b = await body();
        ctx.json(res, 200, { ok: true, tokens: (await service.index(ctx.tailwind)).elementTokens(str(b.classes), str(b.style)) });
        return true;
      }
    }
  } catch (e) {
    ctx.json(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
    return true;
  }
  ctx.json(res, 404, { error: "no such endpoint" });
  return true;
}
