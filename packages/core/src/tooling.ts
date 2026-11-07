// Tooling entry: the template expression grammar, shared with @gable/language-service
// so the editor, `gable-check` and the runtime agree on what an expression is.
export { parseExpression, parseHandler } from "./expression.js";
export type { Expr, HandlerExpr } from "./expression.js";
// Template scanning primitives, shared so the editor tooling splits templates exactly as the runtime does.
export { VOID, BLOCK_START, indexOfTopLevel } from "./template.js";

// Scenes (type-only): a Scene places one Component in one situation. Authored as a plain TypeScript file beside the
// Component (`todo-item.scenes.ts`); the Designer's component mode and `@gable/testing`'s `mountScene` both read it.
import type { InputValues } from "./app.js";
import type { ComponentClass } from "./component.js";
import type { Provider } from "./di.js";

/** One situation of a Component: its inputs and the providers that replace what it injects. */
export interface Scene<T extends object> {
  /** Shown beside the scene's name in the Designer. */
  description?: string;
  inputs?: InputValues<T>;
  /** Added to a fresh root injector, so they override anything the Component would otherwise get. */
  providers?: Provider[];
}

/** The default export of a `*.scenes.ts` file. */
export interface ComponentScenes<T extends object> {
  component: ComponentClass<T>;
  /** Scenes by name, in the order the Designer lists them. */
  scenes: Record<string, Scene<T>>;
}
