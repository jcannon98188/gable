// The ship: an entity component. Reads keys, moves via the shared GameState signals, owns its frame hook.
import { html, inject, onCleanup } from "@gable/core";
import { Frame } from "../frame.js";
import { GH, GW, GameState } from "./game-state.js";

export class GameShip {
  static meta = {
    selector: "game-ship",
    template: html`<sprite texture="ship" anchor="0.5" tint="#66ddff" [x]="state.shipX()" [y]="state.shipY()"></sprite>`,
  };

  state = inject(GameState);
  speed = 320;

  #down = (e: KeyboardEvent) => this.state.keys.add(e.key);
  #up = (e: KeyboardEvent) => this.state.keys.delete(e.key);
  #listen = (() => {
    addEventListener("keydown", this.#down);
    addEventListener("keyup", this.#up);
    onCleanup(() => {
      removeEventListener("keydown", this.#down);
      removeEventListener("keyup", this.#up);
    });
  })();

  hook = inject(Frame).onFrame((dt) => {
    const k = this.state.keys;
    const dx = (k.has("ArrowRight") || k.has("d") ? 1 : 0) - (k.has("ArrowLeft") || k.has("a") ? 1 : 0);
    const dy = (k.has("ArrowDown") || k.has("s") ? 1 : 0) - (k.has("ArrowUp") || k.has("w") ? 1 : 0);
    if (dx) this.state.shipX.update((x) => Math.max(16, Math.min(GW - 16, x + dx * this.speed * dt)));
    if (dy) this.state.shipY.update((y) => Math.max(16, Math.min(GH - 16, y + dy * this.speed * dt)));
  });
}
