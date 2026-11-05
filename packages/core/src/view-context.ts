import type { Env } from "./expression.js";
import type { Injector } from "./di.js";
import type { ComponentClass } from "./component.js";

/** Per-component facts that nested template building needs; found by walking the Env chain. */
export interface ViewContext {
  /** The `meta.imports` of the component whose template is being built. */
  imports: readonly ComponentClass<any>[];
  /** The injector of that component (its own child injector when it has `meta.providers`). */
  injector: Injector | null;
}

export function viewOf(env: Env): ViewContext | undefined {
  for (let e: Env | null = env; e; e = e.parent) if (e.view) return e.view;
  return undefined;
}
