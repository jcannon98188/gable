import { InjectionToken, type Provider } from "./di.js";
import type { Renderer } from "./renderer.js";

/** How the outlet animates a route swap: `css` keeps the outgoing view mounted while CSS animates it; `view` uses `document.startViewTransition`. */
export type RouteTransitionMode = "css" | "view";

/** What `Route.transition` and `<router-outlet [transition]>` accept. `true` and `""` mean the router default mode, `false` turns it off. */
export type RouteTransitionSetting = boolean | "" | RouteTransitionMode;

export interface RouteTransitionOptions {
  /** Animate every outlet and route by default (true when you call `provideRouteTransitions`). Pass false to only configure the hooks below and keep transitions opt-in per outlet or route. */
  all?: boolean;
  /** The mode used by `transition: true`, and by every outlet that does not say otherwise. Default "css". */
  mode?: RouteTransitionMode;
  /** Milliseconds the outgoing view's exit animation takes (`null`: none). Defaults to the host's computed style. Tests and non-DOM renderers override it. */
  exitDuration?(host: unknown): number | null;
  /** True when the user asked for reduced motion; transitions are skipped then. Defaults to `matchMedia("(prefers-reduced-motion: reduce)")`. */
  reducedMotion?(): boolean;
  /** Runs `update` inside a view transition. Defaults to `document.startViewTransition`; return false when unsupported and `update` was not run. */
  startViewTransition?(update: () => void): boolean;
}

export const ROUTE_TRANSITIONS = new InjectionToken<RouteTransitionOptions>("RouteTransitions");

/**
 * Turns route transitions on for every outlet: `provideRouter(routes)` plus `provideRouteTransitions({ mode: "view" })`.
 * Without it, transitions are opt-in per outlet (`<router-outlet transition>`) or per route (`transition: true`).
 */
export function provideRouteTransitions(options: RouteTransitionOptions = {}): Provider[] {
  return [{ provide: ROUTE_TRANSITIONS, useValue: { mode: "css", ...options } }];
}

/** Resolves a setting to a mode; undefined means "not said", null means explicitly off. */
export function resolveSetting(value: RouteTransitionSetting | undefined, fallback: RouteTransitionMode): RouteTransitionMode | null | undefined {
  if (value === undefined) return undefined;
  if (value === false) return null;
  return value === true || value === "" ? fallback : value;
}

export function prefersReducedMotion(options?: RouteTransitionOptions): boolean {
  if (options?.reducedMotion) return options.reducedMotion();
  const media = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  return !!media?.call(globalThis, "(prefers-reduced-motion: reduce)")?.matches;
}

export function viewTransition(options: RouteTransitionOptions | null | undefined, update: () => void): boolean {
  if (options?.startViewTransition) return options.startViewTransition(update);
  const doc = (globalThis as { document?: { startViewTransition?: (cb: () => void) => unknown } }).document;
  if (!doc || typeof doc.startViewTransition !== "function") return false;
  doc.startViewTransition(update);
  return true;
}

const ms = (token: string) => (token.endsWith("ms") ? parseFloat(token) : parseFloat(token) * 1000) || 0;
const split = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Longest animation or transition on `host` according to its computed style, in ms; null when it has none. */
export function computedExitDuration(host: unknown): number | null {
  const g = globalThis as unknown as { getComputedStyle?: (el: unknown) => Record<string, string | undefined> };
  if (!g.getComputedStyle || (host as { nodeType?: number } | null)?.nodeType !== 1) return null;
  const cs = g.getComputedStyle(host) as Record<string, string | undefined> & { getPropertyValue?(name: string): string };
  let longest = -1;
  // A style that only exposes the shorthands (jsdom) is read from those.
  if (!cs.animationDuration && !cs.transitionDuration) {
    for (const [kind, value] of [["animation", cs.getPropertyValue?.("animation") ?? cs.animation], ["transition", cs.getPropertyValue?.("transition") ?? cs.transition]] as const) {
      for (const item of (value ?? "").split(/,(?![^(]*\))/).map((x) => x.trim()).filter((x) => x && x !== "none")) {
        const times = item.split(/\s+(?![^(]*\))/).filter((w) => /^-?[\d.]+m?s$/.test(w));
        const iter = item.split(/\s+/).find((w) => w === "infinite" || /^\d+(\.\d+)?$/.test(w));
        const total = ms(times[1] ?? "0s") + ms(times[0] ?? "0s") * (kind === "animation" ? (iter === "infinite" ? Infinity : iter ? parseFloat(iter) : 1) : 1);
        if (ms(times[0] ?? "0s") + ms(times[1] ?? "0s") > 0) longest = Math.max(longest, total);
      }
    }
    return longest < 0 ? null : longest;
  }
  const names = split(cs.animationName);
  split(cs.animationDuration).forEach((d, i) => {
    if ((names[i % Math.max(names.length, 1)] ?? "none") === "none") return;
    const delay = ms(split(cs.animationDelay)[i] ?? split(cs.animationDelay)[0] ?? "0s");
    const count = split(cs.animationIterationCount)[i] ?? "1";
    longest = Math.max(longest, delay + ms(d) * (count === "infinite" ? Infinity : parseFloat(count) || 1));
  });
  split(cs.transitionDuration).forEach((d, i) => {
    if (ms(d) <= 0) return;
    longest = Math.max(longest, ms(split(cs.transitionDelay)[i] ?? split(cs.transitionDelay)[0] ?? "0s") + ms(d));
  });
  return longest < 0 ? null : longest;
}

const END_EVENTS = ["animationend", "animationcancel", "transitionend", "transitioncancel"] as const;

/** A promise that settles when the host's exit animation ends (its own end event, or a timeout past the computed duration). Null when it has none. */
export function waitForExit<N>(renderer: Renderer<N>, host: N, options?: RouteTransitionOptions | null): Promise<void> | null {
  const duration = (options?.exitDuration ?? computedExitDuration)(host);
  if (duration === null) return null;
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offs = END_EVENTS.map((name) =>
      renderer.listen(host, name, (event) => {
        const from = (event as { target?: unknown } | null)?.target;
        if (from == null || from === host || (from as { node?: unknown }).node === host) done();
      }),
    );
    const done = () => {
      for (const off of offs) off();
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    if (Number.isFinite(duration)) timer = setTimeout(done, duration + 100);
  });
}
