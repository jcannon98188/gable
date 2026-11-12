// VARIANT B: "template for structure, refs for the hot path".
// Thesis: the template declares WHAT exists (which nodes, when, in what order); it binds only coarse state (tint,
// game over). Fast-changing per-entity state (positions) is mutated directly on Pixi nodes obtained through #refs
// in the frame hook, like an imperative game loop. Signals hold only what the DOM HUD also needs (GameState) and the
// membership of the rock list.
// Trade-off: near-zero reactive overhead per frame and Pixi-native feel, but two sources of truth (plain rock data
// vs node properties), nodes must be mapped back to data by hand, and nothing about positions is visible in the template.
import { computed, html, inject, signal, viewChild, viewChildren } from "@gable/core";
import type { Container } from "pixi.js";
import { Frame, GameState, H, SHIP_R, W, clamp, dist2, rand } from "./game-state.js";

interface Rock {
  id: string;
  x: number;
  y: number;
  r: number;
  scale: number;
  speed: number;
  spin: number;
}

export class SceneB {
  static meta = {
    selector: "scene-b",
    template: html`
      <graphics rectW="400" rectH="560" fill="#0b1020" (pointermove)="move($event)"></graphics>
      @for (r of rocks(); track r.id) {
        <sprite #rock [label]="r.id" shape="rock" anchor="0.5" tint="#6fcf7a" [x]="r.x" [y]="r.y" [scale]="r.scale"></sprite>
      }
      <sprite #ship shape="ship" anchor="0.5" x="200" y="490" [tint]="shipTint()"></sprite>
      @if (!game.alive()) {
        <text text="GAME OVER" size="32" fill="#ff6677" anchor="0.5" x="200" y="240"></text>
        <text text="press Restart" size="16" anchor="0.5" x="200" y="280"></text>
      }
    `,
  };

  game = inject(GameState);
  frame = inject(Frame);

  ship = viewChild<Container>("ship");
  rockNodes = viewChildren<Container>("rock");

  // Coarse: membership only changes on spawn/despawn. Positions inside these objects are plain mutable fields.
  rocks = signal<Rock[]>([]);
  shipTint = computed(() => (this.game.alive() ? "#ffd84a" : "#ff4455"));

  #byId = new Map<string, Rock>();
  #target = { x: W / 2, y: H - 70 };
  #next = 0;
  #acc = 0;
  #run = this.game.run();

  hook = this.frame.onFrame((dt) => this.#step(dt));

  move(e: unknown) {
    const p = (e as { global: { x: number; y: number } }).global;
    this.#target.x = clamp(p.x, 12, W - 12);
    this.#target.y = clamp(p.y, 12, H - 12);
  }

  #step(dt: number) {
    if (this.#run !== this.game.run()) {
      this.#run = this.game.run();
      this.#byId.clear();
      this.rocks.set([]);
    }
    const ship = this.ship();
    if (!ship) return;
    const k = Math.min(1, dt * 14);
    ship.x += (this.#target.x - ship.x) * k;
    ship.y += (this.#target.y - ship.y) * k;
    if (!this.game.alive()) return;
    this.game.advance(dt);

    this.#acc += dt;
    if (this.#acc > Math.max(0.25, 0.7 - this.game.elapsed() * 0.01)) {
      this.#acc = 0;
      const r = rand(14, 26);
      const rock: Rock = { id: `r${this.#next++}`, x: rand(20, W - 20), y: -30, r, scale: r / 20, speed: rand(120, 260), spin: rand(-3, 3) };
      this.#byId.set(rock.id, rock);
      this.rocks.update((l) => [...l, rock]);
    }

    let gone = false;
    for (const node of this.rockNodes()) {
      const rock = this.#byId.get(node.label);
      if (!rock) continue; // node for a rock the template has not removed yet
      rock.y += rock.speed * dt;
      node.y = rock.y; // the hot path: straight onto the Pixi node
      node.rotation += rock.spin * dt;
      if (dist2(ship.x, ship.y, rock.x, rock.y) < (rock.r + SHIP_R) ** 2) this.game.end();
      if (rock.y > H + 40) {
        this.#byId.delete(rock.id);
        gone = true;
      }
    }
    if (gone) this.rocks.update((l) => l.filter((r) => this.#byId.has(r.id)));
  }
}
