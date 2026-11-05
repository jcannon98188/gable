// Internal seams for sibling Gable packages (@gable/testing, later bootstrap).
// Not part of the public API; may change without notice.
export { ownerOf } from "./scope.js";
export { createScope, runInScope, currentScope } from "./scope.js";
export type { Scope } from "./scope.js";
export { instantiate } from "./component.js";
export type { MountedComponent } from "./component.js";
export { whenFlushed, flushSync } from "./signals.js";
export { reportError } from "./errors.js";
