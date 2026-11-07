import { ownerOf, type Scope } from "./scope.js";
import type { Injector } from "./di.js";

export type ErrorSource = "setup" | "effect" | "event" | "binding" | "subscription" | "lazy" | "router" | "hmr";

/** Plain data describing where a failure came from. The error itself is never wrapped. */
export interface ErrorContext {
  source: ErrorSource;
  /** The component class whose scope owns the failing work. */
  component?: Function;
  /** The injector of that component (or of the service that owns the work); null outside any injector. */
  injector: Injector | null;
  /** Source-specific extra, e.g. the event or binding name. */
  detail?: string;
}

/**
 * The Token every failure is reported to. The default logs to `console.error` and
 * swallows. Replace it with a provider; overlay, devtools and Sentry adapters
 * decorate the previous handler by injecting and forwarding to it.
 */
export class ErrorHandler {
  static scope = "root";
  handleError(error: unknown, context: ErrorContext): void {
    console.error(`[gable] ${context.source} error${context.detail ? ` (${context.detail})` : ""}`, error, context);
  }
}

const fallback = new ErrorHandler();

/** Reports a failure, attributed through `scope`. Never throws: a broken handler falls back to the console. */
export function reportError(error: unknown, source: ErrorSource, scope: Scope | null, detail?: string): void {
  const owner = ownerOf(scope);
  const context: ErrorContext = { source, injector: (owner.injector as Injector | undefined) ?? null };
  if (owner.component) context.component = owner.component;
  if (detail !== undefined) context.detail = detail;
  try {
    const handler = context.injector?.get(ErrorHandler) ?? fallback;
    handler.handleError(error, context);
  } catch (handlerError) {
    console.error(error);
    console.error(handlerError);
  }
  // The handler always sees the failure; the nearest boundary that accepts it then swaps in its fallback.
  try {
    for (let s = scope; s; s = s.parent) if (s.owner?.boundary?.(error, source)) return;
  } catch (boundaryError) {
    console.error(boundaryError);
  }
}

/** Marks a failed evaluation so the caller can keep its last good value. */
export const FAILED: unique symbol = Symbol("failed");

/**
 * Wraps evaluations of one binding: a throw is reported once per failure
 * episode and yields FAILED; the next clean evaluation ends the episode.
 */
export function guard(scope: Scope | null, detail?: string): <T>(fn: () => T) => T | typeof FAILED {
  let failing = false;
  return (fn) => {
    try {
      const value = fn();
      failing = false;
      return value;
    } catch (error) {
      if (!failing) reportError(error, "binding", scope, detail);
      failing = true;
      return FAILED;
    }
  };
}

/** Runs `fn`, reporting a throw (or a rejected returned Promise) as `source` instead of propagating it. */
export function guarded(scope: Scope | null, source: ErrorSource, fn: () => unknown, detail?: string): void {
  try {
    const result = fn() as { then?: unknown } | undefined;
    if (result && typeof result.then === "function") {
      (result as PromiseLike<unknown>).then(undefined, (error) => reportError(error, source, scope, detail));
    }
  } catch (error) {
    reportError(error, source, scope, detail);
  }
}
