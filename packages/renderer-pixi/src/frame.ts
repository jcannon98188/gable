// The Frame service (canvas/111, ADR 0020): the per-frame hooks of a canvas boundary. The boundary's loop calls
// `advance(dt)` once per animation frame; scenes register with `inject(Frame).onFrame(dt => ...)` or `onFixedStep(hz, cb)`.
// Kept free of any pixi.js import so injecting it never loads Pixi.
import { onCleanup } from "@gablejs/core";

/**
 * The longest dt a frame reports, in seconds. A tab that was hidden or a long stall must not become one giant step. This is a
 * deliberate time drop: wall-clock time beyond 50 ms in one frame is discarded, not caught up, so a fixed-step hook runs at most
 * `ceil(0.05 * hz)` steps in a frame (three at 60 Hz) and simulated time falls behind real time after a stall.
 */
export const MAX_FRAME_DT = 0.05;

// Whole steps are counted with a little slack so that 50 ms at 60 Hz is three steps, not two and a rounding error.
const EPSILON = 1e-9;

interface Hook<F> {
  readonly fn: F;
  active: boolean;
}

interface Accumulator {
  readonly step: number;
  value: number;
  readonly hooks: Set<Hook<FixedStepHook>>;
}

/** A frame hook: `dt` is the time since the previous frame in seconds, clamped to `MAX_FRAME_DT`. */
export type FrameHook = (dt: number) => void;
/** A fixed-step hook: `dt` is always `1 / hz`; `alpha` (0 to 1) is the unspent fraction of a step, for interpolating a render state. */
export type FixedStepHook = (dt: number, alpha: number) => void;

/**
 * Provided at every canvas boundary. Hooks run at the start of each frame, before effects are flushed and the scene is
 * rendered, so what they write to signals is drawn the same frame. Registering inside a component's setup ties the hook to
 * that component: it is removed when the component's scope ends. The returned function removes it earlier.
 *
 * Fixed-step accumulators live here, keyed by rate, so they survive a scene being rebuilt.
 */
export class Frame {
  readonly #frameHooks = new Set<Hook<FrameHook>>();
  readonly #accumulators = new Map<number, Accumulator>();

  /**
   * Where a throwing hook's error goes. The boundary's loop sets it so one bad hook cannot stop the other hooks, the effect flush
   * or the render of that frame. Unset (a direct `advance` call in a test), the first error is rethrown after every hook has run.
   */
  onError: ((error: unknown) => void) | null = null;

  /** Runs `hook(dt)` every frame. */
  onFrame(hook: FrameHook): () => void {
    return this.#register(this.#frameHooks, hook);
  }

  /** Runs `hook(1 / hz, alpha)` zero or more times per frame so that simulated time keeps up with real time at exactly `hz` steps per second. */
  onFixedStep(hz: number, hook: FixedStepHook): () => void {
    if (!(hz > 0) || !Number.isFinite(hz)) throw new RangeError(`onFixedStep(hz, ...) needs a positive rate in hertz, got ${hz}.`);
    let acc = this.#accumulators.get(hz);
    if (!acc) this.#accumulators.set(hz, (acc = { step: 1 / hz, value: 0, hooks: new Set() }));
    return this.#register(acc.hooks, hook);
  }

  /**
   * Runs one frame's hooks. Called by the boundary's loop; tests call it directly. A hook added during the frame first
   * runs next frame; a hook removed during the frame does not run.
   */
  advance(seconds: number): void {
    const dt = Math.min(Math.max(seconds, 0), MAX_FRAME_DT);
    let first: { error: unknown } | null = null;
    const run = (call: () => void) => {
      try {
        call();
      } catch (error) {
        if (this.onError) this.onError(error);
        else first ??= { error };
      }
    };
    for (const hook of [...this.#frameHooks]) if (hook.active) run(() => hook.fn(dt));
    for (const acc of this.#accumulators.values()) {
      acc.value += dt;
      const hooks = [...acc.hooks];
      let steps = 0;
      while (acc.value + EPSILON >= acc.step) {
        acc.value = Math.max(acc.value - acc.step, 0);
        steps++;
      }
      const alpha = acc.value / acc.step;
      for (let i = 0; i < steps; i++) for (const hook of hooks) if (hook.active) run(() => hook.fn(acc.step, alpha));
    }
    if (first) throw (first as { error: unknown }).error;
  }

  #register<F>(into: Set<Hook<F>>, fn: F): () => void {
    const hook: Hook<F> = { fn, active: true };
    into.add(hook);
    const off = () => {
      hook.active = false;
      into.delete(hook);
    };
    try {
      onCleanup(off);
    } catch {
      // Registered outside any scope: it lives until the returned function is called.
    }
    return off;
  }
}
