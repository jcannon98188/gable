import { html, inject, input, signal } from "@gablejs/core";
import { Frame } from "@gablejs/renderer-pixi";

/** An entity is plain data. */
export interface Rock {
  id: number;
  x: number;
  y: number;
}

/** Game state lives in a root service, so it survives scene rebuilds and hot edits. */
export class World {
  static scope = "root";
  rocks = signal<Rock[]>([]);
  score = signal(0);
  nextId = 1; // not #private: hot edits can carry it over

  spawn(x: number): Rock {
    const rock = { id: this.nextId++, x, y: 0 };
    this.rocks.update((all) => [...all, rock]);
    return rock;
  }

  hit(id: number): void {
    this.rocks.update((all) => all.filter((r) => r.id !== id));
    this.score.update((s) => s + 10);
  }

  fall(dt: number): void {
    this.rocks.update((all) => all.map((r) => ({ ...r, y: r.y + 120 * dt })));
  }
}

/** One entity, one component: its template binds the entity's data to a sprite. */
export class RockView {
  static meta = {
    selector: "game-rock",
    template: html`<sprite label="rock" [x]="rock().x" [y]="rock().y" width="32" height="32" (pointertap)="world.hit(rock().id)" />`,
  };
  rock = input.required<Rock>();
  world = inject(World);
}

/** The scene composes the entities; it also owns the per-frame update through the Frame service. */
export class Rocks {
  static meta = {
    selector: "game-rocks",
    imports: [RockView],
    template: html`@for (r of world.rocks(); track r.id) {<game-rock [rock]="r"></game-rock>}`,
  };
  world = inject(World);
  tick = inject(Frame).onFrame((dt) => this.world.fall(dt));
}
