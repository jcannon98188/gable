// The DOM app: a HUD in ordinary DOM bound to the same signals the canvas entities use, plus <gable-canvas>.
import { bootstrap, html, inject } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { Frame } from "../frame.js";
import { GableCanvas } from "../gable-canvas.js";
import { GameState } from "./game-state.js";
import { GameWorld } from "./game-world.js";

export class App {
  static meta = {
    selector: "demo-app",
    imports: [GableCanvas, GameWorld],
    template: html`
      <div class="hud">
        <span>Score {{ state.score() }}</span>
        <span>Rocks {{ state.rockCount() }}</span>
        <span>Hits {{ state.hits() }}</span>
        <span>Hooks {{ frame.count }}</span>
        <span class="hint">arrows / WASD</span>
      </div>
      <gable-canvas [width]="800" [height]="600">
        <game-world></game-world>
      </gable-canvas>
    `,
  };
  state = inject(GameState);
  frame = inject(Frame);
}

const frame = new Frame();
bootstrap(App, {
  renderer: dom(),
  target: "#app",
  providers: [
    { provide: Frame, useValue: frame },
    GameState, // a class provider, so Gable HMR knows the service and can re-create it with state transfer
  ],
});
(globalThis as Record<string, unknown>).__demo = { frame };

// HMR bookkeeping for the experiment driver.
const hot = import.meta.hot;
(globalThis as Record<string, unknown>).__hmrUpdates = 0;
hot?.on("vite:afterUpdate", () => ((globalThis as Record<string, number>).__hmrUpdates! += 1));
