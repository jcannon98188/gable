// A falling rock: an entity component with local signals and its own frame hook. It removes itself off-screen and hits the ship.
import { html, inject, input, signal, untracked } from "@gable/core";
import { Frame } from "../frame.js";
import { GH, GameState, type RockData } from "./game-state.js";

export class GameRock {
  static meta = {
    selector: "game-rock",
    template: html`<sprite [label]="data().id" texture="rock" anchor="0.5" tint="#e0a458" [x]="data().x" [y]="y()" [rotation]="r()" [scale]="data().size"></sprite>`,
  };

  data = input.required<RockData>();
  state = inject(GameState);
  y = signal(-20);
  r = signal(0);

  hook = inject(Frame).onFrame((dt) => {
    const d = untracked(this.data);
    const y = this.y() + d.speed * dt;
    this.y.set(y);
    this.r.set(this.r() + d.spin * dt);
    if (y > GH + 20) return this.state.despawn(d.id);
    const dx = d.x - this.state.shipX();
    const dy = y - this.state.shipY();
    if (dx * dx + dy * dy < (14 + 8 * d.size) ** 2) this.state.hit(d.id);
  });
}
