// VARIANT C: "components per entity + a game service".
// Thesis: each game object is a Gable component (<game-ship>, <game-rock>, <game-spawner>) with its own local signals
// and its own frame hook; the scene template only composes them. They coordinate through injected services:
// GameState (phase/score, shared with the DOM HUD) and a small World service (pointer, ship position, the rock list).
// Rocks are created/destroyed by @for over the World's list; a rock removes itself when it leaves the screen.
// Trade-off: best encapsulation and the most Gable-idiomatic shape (testable units, DI, lifecycle tied to @for), but
// the most ceremony, a frame-hook subscription per entity, and entity<->entity talk goes through shared mutable service state.
import { computed, html, inject, input, signal } from "@gable/core";
import { Frame, GameState, H, SHIP_R, W, clamp, dist2, rand } from "./game-state.js";

export interface RockData {
  id: number;
  x: number;
  r: number;
  speed: number;
}

/** The part of the game the entities need to share beyond phase/score. */
export class World {
  game = inject(GameState);
  pointer = signal({ x: W / 2, y: H - 70 });
  ship = signal({ x: W / 2, y: H - 70 });
  rocks = signal<RockData[]>([]);
  #id = 0;

  spawn() {
    const r = rand(14, 26);
    this.rocks.update((l) => [...l, { id: this.#id++, x: rand(20, W - 20), r, speed: rand(120, 260) }]);
  }
  despawn(id: number) {
    this.rocks.update((l) => l.filter((r) => r.id !== id));
  }
  clear() {
    this.rocks.set([]);
  }
}

export class Ship {
  static meta = {
    selector: "game-ship",
    template: html`<sprite shape="ship" anchor="0.5" [x]="x()" [y]="y()" [tint]="tint()"></sprite>`,
  };
  world = inject(World);
  game = inject(GameState);
  x = signal(W / 2);
  y = signal(H - 70);
  tint = computed(() => (this.game.alive() ? "#ff8ad8" : "#ff4455"));
  hook = inject(Frame).onFrame((dt) => {
    const k = Math.min(1, dt * 14);
    const p = this.world.pointer();
    this.x.update((x) => x + (p.x - x) * k);
    this.y.update((y) => y + (p.y - y) * k);
    this.world.ship.set({ x: this.x(), y: this.y() });
  });
}

export class Rock {
  static meta = {
    selector: "game-rock",
    template: html`<sprite shape="rock" anchor="0.5" tint="#b39ddb" [x]="data().x" [y]="y()" [rotation]="rot()" [scale]="scale()"></sprite>`,
  };
  data = input.required<RockData>();
  world = inject(World);
  game = inject(GameState);
  y = signal(-30);
  rot = signal(0);
  // Restart clears the list, but removal only lands after this frame's hooks: stale rocks must not hit the new run.
  #run = this.game.run();
  scale = computed(() => this.data().r / 20);
  hook = inject(Frame).onFrame((dt) => {
    if (!this.game.alive() || this.#run !== this.game.run()) return;
    const d = this.data();
    this.y.update((y) => y + d.speed * dt);
    this.rot.update((a) => a + dt * (d.speed / 80));
    const s = this.world.ship();
    if (dist2(s.x, s.y, d.x, this.y()) < (d.r + SHIP_R) ** 2) this.game.end();
    else if (this.y() > H + 40) this.world.despawn(d.id);
  });
}

export class Spawner {
  static meta = { selector: "game-spawner" };
  world = inject(World);
  game = inject(GameState);
  #acc = 0;
  #run = this.game.run();
  hook = inject(Frame).onFrame((dt) => {
    if (this.#run !== this.game.run()) {
      this.#run = this.game.run();
      this.world.clear();
    }
    if (!this.game.alive()) return;
    this.game.advance(dt);
    this.#acc += dt;
    if (this.#acc > Math.max(0.25, 0.7 - this.game.elapsed() * 0.01)) {
      this.#acc = 0;
      this.world.spawn();
    }
  });
}

export class SceneC {
  static meta = {
    selector: "scene-c",
    imports: [Ship, Rock, Spawner],
    template: html`
      <graphics rectW="400" rectH="560" fill="#0b1020" (pointermove)="move($event)"></graphics>
      <game-spawner></game-spawner>
      @for (r of world.rocks(); track r.id) {
        <game-rock [data]="r"></game-rock>
      }
      <game-ship></game-ship>
      @if (!game.alive()) {
        <text text="GAME OVER" size="32" fill="#ff6677" anchor="0.5" x="200" y="240"></text>
        <text text="press Restart" size="16" anchor="0.5" x="200" y="280"></text>
      }
    `,
  };
  world = inject(World);
  game = inject(GameState);
  move(e: unknown) {
    const p = (e as { global: { x: number; y: number } }).global;
    this.world.pointer.set({ x: clamp(p.x, 12, W - 12), y: clamp(p.y, 12, H - 12) });
  }
}
