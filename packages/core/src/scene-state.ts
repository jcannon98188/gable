import { inputOf } from "./input.js";

/**
 * Sets a Scene's `state` on a freshly created Component: each named field must be one of its own writable signals (not an input
 * or model; those are a Scene's `inputs`). Throws, naming the field, when one is not, so a stale or mistyped Scene fails loudly.
 */
export function applySceneState(instance: object, state: Record<string, unknown> | undefined, owner = instance.constructor.name): void {
  if (!state) return;
  for (const [field, value] of Object.entries(state)) {
    const target = (instance as Record<string, unknown>)[field] as ((() => unknown) & { set?: (value: unknown) => void }) | undefined;
    if (typeof target === "function" && inputOf(instance, field))
      throw new Error(`Scene state names "${field}" of ${owner}, which is an input or model: put it in the scene's inputs instead.`);
    if (typeof target !== "function" || typeof target.set !== "function")
      throw new Error(`Scene state names "${field}" of ${owner}, which is not a writable signal (signal() or a store state).`);
    target.set(value);
  }
}
