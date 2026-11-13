import { html, inject, signal } from "@gable/core";
import { Frame } from "@gable/renderer-pixi";

/** Simulation state in a service: the clock and the fixed-step tick count survive scene rebuilds. */
export class Clock {
  static scope = "root";
  ticks = signal(0);
  blend = signal(0); // where we are inside the current step, 0 to 1
  x = signal(0);
}

export class Runner {
  static meta = { selector: "game-runner", template: html`<sprite label="runner" [x]="clock.x()" />` };
  clock = inject(Clock);
  frame = inject(Frame);

  // Every frame, with a variable dt in seconds (clamped to 50 ms).
  move = this.frame.onFrame((dt) => this.clock.x.update((x) => x + 100 * dt));

  // 20 deterministic steps per second, however fast frames come; alpha is the unspent part of a step.
  step = this.frame.onFixedStep(20, (_dt, alpha) => {
    this.clock.ticks.update((n) => n + 1);
    this.clock.blend.set(alpha);
  });
}
