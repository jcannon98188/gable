// The Frame service: the one place per-frame work registers. The <gable-canvas> that owns the loop calls tick() once per frame.
import { onCleanup, signal } from "@gable/core";

export type FrameHook = (dt: number) => void;

/** Per-frame phase timings (ms) the loop reports when a probe is attached: hooks, Gable flush, Pixi render submit, optional gl.finish. */
export type FrameProbe = (hooksMs: number, flushMs: number, renderMs: number, finishMs: number, now: number) => void;

export class Frame {
  #hooks = new Set<FrameHook>();
  #size = signal(0);
  probe: FrameProbe | null = null;
  /** Counters for the HMR experiments: how many hooks are live right now and how many were ever registered. */
  registered = 0;
  /** Frames ticked so far (the HMR experiments read the tick rate to spot a double loop). */
  ticks = 0;

  /** Registers `hook` for every frame until the current scope (the component calling this in a field initialiser) is disposed. */
  onFrame(hook: FrameHook): void {
    this.#hooks.add(hook);
    this.registered++;
    this.#size.set(this.#hooks.size);
    onCleanup(() => {
      this.#hooks.delete(hook);
      this.#size.set(this.#hooks.size);
    });
  }

  /** Live hook count as a signal read (so a HUD can bind it). */
  get count(): number {
    return this.#size();
  }

  tick(dt: number): void {
    this.ticks++;
    for (const hook of this.#hooks) hook(dt);
  }
}
