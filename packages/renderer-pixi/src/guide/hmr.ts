import { hotData, html, inject, signal } from "@gable/core";
import { Frame } from "@gable/renderer-pixi";

/** What must survive a hot edit lives in a root service: the spawn clock and the count. */
export class SpawnState {
  static scope = "root";
  spawned = signal(0);
  show = signal(true);
}

/** A non-copyable resource a component owns. hotData hands the same one back to the replacement instance. */
export interface Meter {
  id: number;
}
let meters = 0;

export class Spawner {
  static meta = { selector: "game-spawner", template: html`<container label="spawner" />` };
  state = inject(SpawnState);

  // No #private members here: a method-only edit of this class is then patched in place instead of rebuilt.
  meter = hotData<Meter>("meter", () => ({ id: ++meters }));

  // No setInterval and no setTimeout: a frame hook is removed with this component's scope, so a rebuild never leaves
  // the old timer running. Two spawns per second, deterministically, whatever the frame rate.
  every = inject(Frame).onFixedStep(2, () => this.state.spawned.update((n) => n + 1));
}
