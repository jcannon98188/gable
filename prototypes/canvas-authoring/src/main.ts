import { bootstrap, html, inject } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { Frame, GameState } from "./game-state.js";
import { PixiStage } from "./pixi-stage.js";
import { SceneA } from "./variant-a.js";
import { SceneB } from "./variant-b.js";
import { SceneC, World } from "./variant-c.js";

const scenes = { a: SceneA, b: SceneB, c: SceneC } as const;
const picked = new URLSearchParams(location.search).get("variant");
const variant = picked === "b" || picked === "c" ? picked : "a";

// The DOM app: a normal Gable app with a HUD, the Pixi stage, and the variant switcher bar.
class App {
  static meta = {
    selector: "app-root",
    imports: [PixiStage],
    template: html`
      <div class="wrap">
        <div class="hud">
          <span>Score {{ game.score() }}</span>
          <span>Best {{ game.best() }}</span>
          <span>{{ game.phase() }}</span>
          <button (click)="game.restart()">Restart</button>
        </div>
        <pixi-stage [scene]="scene"></pixi-stage>
      </div>
      <nav class="bar">
        <a href="?variant=a" [class.on]="variant === 'a'">A signals everywhere</a>
        <a href="?variant=b" [class.on]="variant === 'b'">B template + refs</a>
        <a href="?variant=c" [class.on]="variant === 'c'">C components + service</a>
      </nav>
    `,
  };
  game = inject(GameState);
  variant = variant;
  scene = scenes[variant];
}

bootstrap(App, { renderer: dom(), target: "#app", providers: [GameState, Frame, World] });
