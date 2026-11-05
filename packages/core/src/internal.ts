// Internal seams for sibling Gable packages (@gable/testing, later bootstrap).
// Not part of the public API; may change without notice.
export { createScope, runInScope, currentScope } from "./scope.js";
export type { Scope } from "./scope.js";
export { DEFER_BLOCKS } from "./defer.js";
export type { DeferHandle, DeferState } from "./defer.js";
export { instantiate } from "./component.js";
export type { MountedComponent } from "./component.js";
export { whenFlushed, flushSync, setEffectErrorReporter } from "./signals.js";
