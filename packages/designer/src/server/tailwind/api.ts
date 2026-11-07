// The HTTP endpoints behind Tailwind mode (`/api/tailwind/*`), and the service that owns the project's design system.
// Kept out of backend.ts, which only forwards requests it does not recognise there (token and Host are already checked).
// Edits are not written here: the shell turns a plan into the 56.4 `setAttr` class edit, so there is one write path.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CdpEmulator } from "../cdp.js";
import { loadDesignSystem } from "./design-system.js";
import { TailwindModel, splitToken } from "./model.js";
import type { TailwindInfo } from "./types.js";

/** Pseudo-states CDP can force on an element (`CSS.forcePseudoState`); everything else is an injected rule. */
const CDP_OWN = new Set(["hover", "focus", "focus-visible", "focus-within", "active"]);
const CDP_GROUP: Record<string, string> = { "group-hover": "hover", "group-focus": "focus", "group-active": "active" };

/** Whether the project's prettier config lists prettier-plugin-tailwindcss (the repo's formatter then sorts classes). */
export function formatterSortsClasses(root: string): boolean {
  const read = (file: string): unknown => {
    try {
      const v = JSON.parse(readFileSync(join(root, file), "utf8")) as Record<string, unknown>;
      return file === "package.json" ? v.prettier : v;
    } catch {
      return null;
    }
  };
  for (const file of [".prettierrc", ".prettierrc.json", "package.json"]) {
    const cfg = read(file) as { plugins?: unknown[] } | string | null;
    if (cfg && typeof cfg === "object" && Array.isArray(cfg.plugins) && cfg.plugins.some((p) => typeof p === "string" && p.includes("prettier-plugin-tailwindcss"))) return true;
  }
  return false;
}

export class TailwindService {
  readonly root: string;
  #loading: Promise<{ info: TailwindInfo; model: TailwindModel | null }> | null = null;
  /** Bumped when the project's stylesheets change, so the shell knows its scales are stale. */
  revision = 0;

  constructor(root: string) {
    this.root = root;
  }

  /** The design system is rebuilt on the next request (a stylesheet, and with it the theme or a plugin, changed). */
  invalidate(): void {
    this.#loading = null;
    this.revision++;
  }

  load(): Promise<{ info: TailwindInfo; model: TailwindModel | null }> {
    return (this.#loading ??= (async () => {
      const loaded = await loadDesignSystem(this.root);
      if (!loaded.ok) return { info: { enabled: false, message: loaded.message } satisfies TailwindInfo, model: null };
      const model = new TailwindModel(loaded.ds, { version: loaded.version, source: loaded.source, entry: loaded.entry, sortsClasses: formatterSortsClasses(this.root) });
      return { info: model.info(), model };
    })());
  }
}

export interface TailwindApiContext {
  service: TailwindService;
  cdp: CdpEmulator | null;
  json(res: ServerResponse, status: number, body: unknown): void;
  readBody(req: IncomingMessage): Promise<string>;
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 64) : []);
const bp = (v: unknown): string | null => (typeof v === "string" && v !== "base" && v !== "" ? v : null);

/** Handles `/api/tailwind/*`; returns false for any other path. */
export async function handleTailwindApi(ctx: TailwindApiContext, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith("/api/tailwind/")) return false;
  const { json } = ctx;
  const { info, model } = await ctx.service.load();
  const body = async (): Promise<Record<string, unknown>> => {
    try {
      return JSON.parse((await ctx.readBody(req)) || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  if (url.pathname === "/api/tailwind/info") return json(res, 200, { ...info, revision: ctx.service.revision }), true;
  if (!model) return json(res, 200, { ok: false, error: info.enabled ? "Tailwind mode is off." : info.message }), true;
  switch (url.pathname) {
    case "/api/tailwind/options":
      json(res, 200, model.options(url.searchParams.get("control") ?? ""));
      return true;
    case "/api/tailwind/analyze": {
      const b = await body();
      json(res, 200, model.analyze(str(b.classes), bp(b.breakpoint), strs(b.states)));
      return true;
    }
    case "/api/tailwind/plan": {
      const b = await body();
      json(res, 200, model.plan({ classes: str(b.classes), utility: str(b.utility) || undefined, token: str(b.token) || undefined, breakpoint: bp(b.breakpoint), states: strs(b.states), remove: Array.isArray(b.remove) ? strs(b.remove) : undefined }));
      return true;
    }
    case "/api/tailwind/search": {
      const b = await body();
      // `hover:md:bg-r`: the variants are kept as typed and the rest is searched; no variants typed means the context's.
      const typed = str(b.q);
      const { variants, utility } = splitToken(typed);
      const prefix = variants.length ? variants.map((v) => v + ":").join("") : str(b.prefix);
      json(res, 200, model.search(utility, prefix, Math.min(Number(b.limit) || 40, 100)));
      return true;
    }
    case "/api/tailwind/css": {
      const b = await body();
      json(res, 200, { css: model.css(strs(b.tokens)) });
      return true;
    }
    case "/api/tailwind/force": {
      // Forced-state preview. CDP forces the pseudo-states it can (on the element the agent marked); the rest, and every
      // state when there is no CDP connection, become an injected rule the shell hands to the agent.
      const b = await body();
      const states = strs(b.states);
      const viaCdp = !!ctx.cdp && (await ctx.cdp.available());
      const forced = states.filter((s) => viaCdp && (CDP_OWN.has(s) || s in CDP_GROUP));
      const injected = states.filter((s) => !forced.includes(s));
      let cdpError: string | null = null;
      if (b.apply === true) {
        const nonce = str(b.nonce);
        const own = forced.filter((s) => CDP_OWN.has(s));
        const group = forced.filter((s) => s in CDP_GROUP).map((s) => CDP_GROUP[s]!);
        if (viaCdp && nonce) {
          try {
            await ctx.cdp!.forcePseudoStates(nonce, own, [...new Set(group)]);
          } catch (e) {
            cdpError = e instanceof Error ? e.message : String(e);
          }
        }
      }
      json(res, 200, { ok: !cdpError, error: cdpError, cdp: forced, injected, css: injected.length ? model.forceCss(str(b.classes), injected, states) : "", dark: states.includes("dark") });
      return true;
    }
  }
  json(res, 404, { error: "no such endpoint" });
  return true;
}
