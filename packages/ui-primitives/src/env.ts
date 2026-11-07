import { InjectionToken } from "@gable/core";

/** The slice of the DOM Zag machines reach for through `scope.getRootNode()`. */
export interface RootNodeLike {
  getElementById(id: string): unknown;
  [key: string]: unknown;
}

/**
 * How machines meet the outside world. Under a DOM renderer nothing is needed. Under another renderer (the
 * in-memory test renderer) machine effects (focus trap, scroll lock, outside-click tracking, positioning) are
 * off, and `getRootNode` supplies whatever element lookup the machine's actions need.
 */
export interface MachineEnv {
  /** Run the machine's DOM effects. Defaults to true only when the host node is a DOM node. */
  effects?: boolean;
  /** Replaces Zag's `getRootNode` (default: the document). */
  getRootNode?(host: unknown): RootNodeLike;
}

export const MACHINE_ENV = new InjectionToken<MachineEnv>("MachineEnv");
