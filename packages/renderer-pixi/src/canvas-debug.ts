// How an app turns the dev-only frame overlay on for every canvas (canvas/119): `provideCanvasDebug()` in the root providers, or
// a `debug` attribute on one `<gable-canvas>`. Free of any pixi.js import, like the host that reads it. In a production build
// (`__GABLE_DEV__: false`) the provider list is empty and nothing reads the attribute.
import { InjectionToken, type Provider } from "@gable/core";
import { DEV } from "./dev.js";

export interface CanvasDebugOptions {
  /** The frame budget in milliseconds, which dropped frames are counted against. Default 1000 / 60. */
  budgetMs?: number;
  /** How many recent frames the rolling p50 and p95 cover. Default 120. */
  window?: number;
  /** Frames between overlay updates, so the overlay does not cost a DOM write per frame. Default 10. */
  every?: number;
  /** Time source in milliseconds. Default `performance.now`. Tests pass their own. */
  now?: () => number;
}

/** Provided by `provideCanvasDebug`; read by `<gable-canvas>`. */
export const CANVAS_DEBUG = new InjectionToken<CanvasDebugOptions>("CanvasDebug");

/**
 * Turns the frame overlay on for every `<gable-canvas>` below the providers: per-phase milliseconds (hooks, flush, render), rolling
 * p50 and p95, dropped frames, display-object count and bindings re-run in the last frame. Dev only: returns no providers in a
 * production build.
 *
 * @example
 * ```ts
 * bootstrap(Root, { renderer: dom(), providers: [...(import.meta.env.DEV ? provideCanvasDebug() : [])] });
 * ```
 */
export function provideCanvasDebug(options: CanvasDebugOptions = {}): Provider[] {
  return DEV ? [{ provide: CANVAS_DEBUG, useValue: options }] : [];
}
