// VARIANT A: "signals everywhere".
// Thesis: the scene is a pure projection of signals. Every Pixi property that ever changes is a signal binding in the
// template ([x]="ship.x()"), rocks are an array signal rendered by @for, each rock carries its own signals, and one
// frame hook only writes signals. Derived facts (hit, tint) are computed. You never touch a Pixi node.
// Trade-off: fully declarative and debuggable, but every moving thing costs signals + one effect per bound property
// per frame (N rocks x 3 props = 3N effects re-run each frame), and the template has to name every property.
import { computed, html, inject, signal, type WritableSignal } from "@gable/core";
import { Frame, GameState, H, SHIP_R, W, clamp, dist2, rand } from "./game-state.js";

interface Rock {
  id: number;
  x: number;
  r: number;
  scale: number;
  speed: number;
  y: WritableSignal<number>;
  rot: WritableSignal<number>;
}

export class SceneA {
  static meta = {
    selector: "scene-a",
    template: html`
      <graphics rectW="400" rectH="560" fill="#0b1020" (pointermove)="move($event)"></graphics>
      @for (r of rocks(); track r.id) {
        <sprite shape="rock" anchor="0.5" tint="#c98a4b" [x]="r.x" [y]="r.y()" [rotation]="r.rot()" [scale]="r.scale"></sprite>
      }
      <sprite shape="ship" anchor="0.5" [x]="shipX()" [y]="shipY()" [tint]="shipTint()"></sprite>
      @if (!game.alive()) {
        <text text="GAME OVER" size="32" fill="#ff6677" anchor="0.5" x="200" y="240"></text>
        <text text="press Restart" size="16" anchor="0.5" x="200" y="280"></text>
      }
    `,
  };

  game = inject(GameState);
  frame = inject(Frame);

  targetX = signal(W / 2);
  targetY = signal(H - 70);
  shipX = signal(W / 2);
  shipY = signal(H - 70);
  rocks = signal<Rock[]>([]);

  // computed: no template arithmetic, so even "red when dead" is a signal.
  shipTint = computed(() => (this.game.alive() ? "#66ddff" : "#ff4455"));
  hit = computed(() => this.rocks().some((r) => dist2(this.shipX(), this.shipY(), r.x, r.y()) < (r.r + SHIP_R) ** 2));

  #nextId = 0;
  #acc = 0;
  #run = this.game.run();

  hook = this.frame.onFrame((dt) => this.#step(dt));

  move(e: unknown) {
    const p = (e as { global: { x: number; y: number } }).global;
    this.targetX.set(clamp(p.x, 12, W - 12));
    this.targetY.set(clamp(p.y, 12, H - 12));
  }

  #step(dt: number) {
    if (this.#run !== this.game.run()) {
      this.#run = this.game.run();
      this.rocks.set([]);
    }
    const k = Math.min(1, dt * 14);
    this.shipX.update((x) => x + (this.targetX() - x) * k);
    this.shipY.update((y) => y + (this.targetY() - y) * k);
    if (!this.game.alive()) return;
    this.game.advance(dt);

    this.#acc += dt;
    if (this.#acc > Math.max(0.25, 0.7 - this.game.elapsed() * 0.01)) {
      this.#acc = 0;
      const r = rand(14, 26);
      this.rocks.update((l) => [...l, { id: this.#nextId++, x: rand(20, W - 20), r, scale: r / 20, speed: rand(120, 260), y: signal(-30), rot: signal(0) }]);
    }
    // One signal write per property per rock per frame: this is the "signal churn" cost.
    for (const r of this.rocks()) {
      r.y.update((y) => y + r.speed * dt);
      r.rot.update((a) => a + dt * (r.speed / 80));
    }
    if (this.rocks().some((r) => r.y() > H + 40)) this.rocks.update((l) => l.filter((r) => r.y() <= H + 40));
    if (this.hit()) this.game.end();
  }
}
