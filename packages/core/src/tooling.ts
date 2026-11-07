// Tooling entry: the template expression grammar, shared with @gable/language-service
// so the editor, `gable-check` and the runtime agree on what an expression is.
export { parseExpression, parseHandler } from "./expression.js";
export type { Expr, HandlerExpr } from "./expression.js";
// Template scanning primitives, shared so the editor tooling splits templates exactly as the runtime does.
export { VOID, BLOCK_START, indexOfTopLevel } from "./template.js";
// i18n message core and template extraction, shared with the Vite plugin (DOM-free).
export * from "./i18n-message.js";
export { decodeEntities, encodeEntities } from "./entities.js";
export { extractTemplateMessages } from "./i18n-extract.js";

export { applySceneState } from "./scene-state.js";

// Scenes (type-only): a Scene places one Component in one situation. Authored as a plain TypeScript file beside the
// Component (`todo-item.scenes.ts`); the Designer's component mode and `@gable/testing`'s `mountScene` both read it.
import type { InputValues } from "./app.js";
import type { ModelSignal } from "./input.js";
import type { WritableSignal } from "./signals.js";
import type { ComponentClass } from "./component.js";
import type { Provider } from "./di.js";
import type { HttpMock } from "./http.js";

/**
 * Values for the Component's own writable signals (not inputs or models; those go in `inputs`), set by field name right after it
 * is created: a state the inputs alone cannot reach. Public fields are typed; other field names are accepted and checked when
 * the scene mounts. The Designer's "Save as Scenario" writes it.
 */
export type SceneState<T> = {
  [K in keyof T as T[K] extends ModelSignal<any> ? never : T[K] extends WritableSignal<any> ? K : never]?: T[K] extends WritableSignal<infer V> ? V : never;
} & { [field: string]: unknown };

/** One situation of a Component: its inputs and the providers that replace what it injects. */
export interface Scene<T extends object> {
  /** Shown beside the scene's name in the Designer. */
  description?: string;
  inputs?: InputValues<T>;
  /** Writable signal values set on the created Component; see {@link SceneState}. Ignored in page mode. */
  state?: SceneState<T>;
  /** Added to a fresh root injector, so they override anything the Component would otherwise get. */
  providers?: Provider[];
  /** HTTP calls answered without a network: installed as the HTTP backend, under `providers`. See `mockHttp` in `@gable/core/http`. */
  http?: HttpMock[];
  /** Page mode (the Designer): the route the app opens at. Ignored when a single Component is mounted. */
  url?: string;
}

/** The default export of a `*.scenes.ts` file. */
export interface ComponentScenes<T extends object> {
  component: ComponentClass<T>;
  /** Scenes by name, in the order the Designer lists them. */
  scenes: Record<string, Scene<T>>;
}
