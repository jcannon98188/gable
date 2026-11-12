// The scene root, projected into <gable-canvas>. Composes entities; owns the spawn timer (a component field).
import { html, inject } from "@gable/core";
import { Frame } from "../frame.js";
import { GameRock } from "./game-rock.js";
import { GameShip } from "./game-ship.js";
import { GameState } from "./game-state.js";

export class GameWorld {
  static meta = {
    selector: "game-world",
    imports: [GameShip, GameRock],
    template: html`
      <game-ship></game-ship>
      @for (r of state.rocks(); track r.id) {
        <game-rock [data]="r"></game-rock>
      }
      <text x="8" y="6" [text]="state.rockLabel()" [style.fill]="'#9ab'"></text>
    `,
  };

  state = inject(GameState);
  /** Timer in a component field (HMR experiment: component fields vs service fields). */
  spawnTimer = 0;
  spawned = 0;

  // Debug handle for the HMR experiments (private: not part of state transfer).
  #debug = ((globalThis as Record<string, unknown>).__world = this);

  hook = inject(Frame).onFrame((dt) => {
    this.state.elapsed += dt;
    this.spawnTimer += dt;
    while (this.spawnTimer > 1 / 60) {
      this.spawnTimer -= 1 / 60;
      this.spawned++;
      this.state.spawn();
    }
    this.state.score.set(Math.floor(this.state.elapsed * 10));
  });
}
