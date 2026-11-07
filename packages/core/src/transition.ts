import { InjectionToken, type Provider } from "./di.js";
import { computedExitDuration } from "./exit-duration.js";
import type { Renderer } from "./renderer.js";

/** How the outlet animates a route swap: `css` keeps the outgoing view mounted while CSS animates it; `view` uses `document.startViewTransition`. */
export type RouteTransitionMode = "css" | "view";

/** What `Route.transition` and `<router-outlet [transition]>` accept. `true` and `""` mean the router default mode, `false` turns it off. */
export type RouteTransitionSetting = boolean | "" | RouteTransitionMode;

/**
 * Options for {@link provideRouteTransitions}: whether outlets animate, which mode they use and hooks for non-DOM environments.
 */
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
