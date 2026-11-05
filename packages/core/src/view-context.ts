import type { Env } from "./expression.js";
import type { Injector } from "./di.js";
import type { QueryHost } from "./query.js";
import type { TemplateNode } from "./template.js";
import type { ComponentClass } from "./component.js";

/** Per-component facts that nested template building needs; found by walking the Env chain. */
export interface ViewContext {
  /** The `meta.imports` of the component whose template is being built. */
  imports: readonly ComponentClass<any>[];
  /** The injector of that component (its own child injector when it has `meta.providers`). */
  injector: Injector | null;
  /** Queries this component declared. */
  queries: QueryHost;
  /** Template the parent projected into this component's slots, with the parent's Env to evaluate it in. */
  content: Content | null;
}

export interface Content {
  env: Env;
  /** Slot name ("" for the default slot) to the nodes projected there. */
  slots: Map<string, TemplateNode[]>;
}

export function viewOf(env: Env): ViewContext | undefined {
  for (let e: Env | null = env; e; e = e.parent) if (e.view) return e.view;
  return undefined;
}
