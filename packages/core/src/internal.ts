// Internal seams for sibling Gable packages (@gable/testing, later bootstrap).
// Not part of the public API; may change without notice.
export { ownerOf } from "./scope.js";
// The vendored TC39 polyfill, for benchmarks that compare Gable against the raw polyfill it runs on (never re-exported from "@gable/core").
export { Signal } from "signal-polyfill";
export { createScope, runInScope, currentScope } from "./scope.js";
export type { Scope } from "./scope.js";
export { DEFER_BLOCKS } from "./defer.js";
export type { DeferHandle, DeferState } from "./defer.js";
export { instantiate, injectHost, COMPONENT_OVERRIDES } from "./component.js";
export type { MountedComponent } from "./component.js";
export { whenFlushed, flushSync, hasPendingFlush } from "./signals.js";
export { reportError } from "./errors.js";
export { INJECTOR } from "./di.js";
export { holdRemoval } from "./removal.js";
export { computedExitDuration } from "./exit-duration.js";
