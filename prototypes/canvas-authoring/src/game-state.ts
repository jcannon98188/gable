import { computed, signal } from "@gable/core";
import { currentScope } from "@gable/core/internal";

/** Coarse game state shared by the DOM HUD and every scene variant. */
export class GameState {
  phase = signal<"playing" | "over">("playing");
  elapsed = signal(0);
  best = signal(0);
  run = signal(0);
  alive = computed(() => this.phase() === "playing");
  score = computed(() => Math.floor(this.elapsed() * 10));

  advance(dt: number) {
    if (this.alive()) this.elapsed.update((e) => e + dt);
  }
  end() {
    if (!this.alive()) return;
    this.phase.set("over");
    this.best.update((b) => Math.max(b, this.score()));
  }
  restart() {
    this.elapsed.set(0);
    this.phase.set("playing");
    this.run.update((n) => n + 1);
  }
}

/** One per-frame driver (owned by <pixi-stage>); scenes and components subscribe with onFrame. */
export class Frame {
  #cbs = new Set<(dt: number) => void>();
  onFrame(cb: (dt: number) => void) {
    this.#cbs.add(cb);
    // HACK(core gap): there is no public onDestroy/DestroyRef; reaching into @gable/core/internal for the scope.
    currentScope()?.onDispose(() => this.#cbs.delete(cb));
  }
  tick(dt: number) {
    for (const cb of [...this.#cbs]) cb(dt);
  }
}

export const W = 400;
export const H = 560;
export const SHIP_R = 12;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
