// Benchmark entities. Every entity is a component with its own frame hook (the design's "entities are components").
// Three update styles, same motion (x/y/rotation change every frame for every entity):
//   signals: 3 signals per entity, 3 bindings           (<rock-signals>)
//   pose:    1 signal per entity (a fresh pose object), 1 binding  (<rock-pose>)
//   ref:     direct writes to the Pixi node through #ref, no signals, no bindings (<rock-ref>)
// plus a Pixi ParticleContainer driven from one hook (<rock-particles>), the "give up components" ceiling.
import { html, inject, injectHost, input, signal, untracked, viewChild } from "@gable/core";
import { Container, Particle, ParticleContainer } from "pixi.js";
import { Frame } from "./frame.js";
import { textureFor } from "./pixi-renderer.js";

export interface Seed {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

export const W = 800;
export const H = 600;

/** Deterministic seeds (LCG) so every run moves the same entities. */
export function makeSeeds(n: number): Seed[] {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, (_, id) => ({
    id,
    x: rnd() * W,
    y: rnd() * H,
    vx: (rnd() - 0.5) * 120,
    vy: 40 + rnd() * 160,
    spin: (rnd() - 0.5) * 4,
  }));
}

const wrap = (v: number, max: number) => (v > max ? v - max : v < 0 ? v + max : v);

export class RockSignals {
  static meta = {
    selector: "rock-signals",
    template: html`<sprite texture="rock" anchor="0.5" [x]="x()" [y]="y()" [rotation]="r()"></sprite>`,
  };
  seed = input.required<Seed>();
  x = signal(0);
  y = signal(0);
  r = signal(0);
  #ready = false;
  hook = inject(Frame).onFrame((dt) => {
    const s = untracked(this.seed);
    if (!this.#ready) {
      this.#ready = true;
      this.x.set(s.x);
      this.y.set(s.y);
    }
    this.x.set(wrap(this.x() + s.vx * dt, W));
    this.y.set(wrap(this.y() + s.vy * dt, H));
    this.r.set(this.r() + s.spin * dt);
  });
}

export class RockPose {
  static meta = {
    selector: "rock-pose",
    template: html`<sprite texture="rock" anchor="0.5" [pose]="pose()"></sprite>`,
  };
  seed = input.required<Seed>();
  pose = signal({ x: 0, y: 0, rotation: 0 });
  #x = 0;
  #y = 0;
  #r = 0;
  #ready = false;
  hook = inject(Frame).onFrame((dt) => {
    const s = untracked(this.seed);
    if (!this.#ready) {
      this.#ready = true;
      this.#x = s.x;
      this.#y = s.y;
    }
    this.#x = wrap(this.#x + s.vx * dt, W);
    this.#y = wrap(this.#y + s.vy * dt, H);
    this.#r += s.spin * dt;
    this.pose.set({ x: this.#x, y: this.#y, rotation: this.#r });
  });
}

export class RockRef {
  static meta = {
    selector: "rock-ref",
    template: html`<sprite #s texture="rock" anchor="0.5"></sprite>`,
  };
  seed = input.required<Seed>();
  s = viewChild<Container>("s");
  #node: Container | undefined;
  hook = inject(Frame).onFrame((dt) => {
    const n = (this.#node ??= this.s());
    if (!n) return;
    const sd = untracked(this.seed);
    if (n.x === 0 && n.y === 0) {
      n.x = sd.x;
      n.y = sd.y;
    }
    n.x = wrap(n.x + sd.vx * dt, W);
    n.y = wrap(n.y + sd.vy * dt, H);
    n.rotation += sd.spin * dt;
  });
}

/** Pixi ParticleContainer: one hook moves every particle. Not a component per entity: the ceiling, not the design. */
export class RockParticles {
  static meta = { selector: "rock-particles", template: html`` };
  seeds = input.required<Seed[]>();
  #pc = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, vertex: false, color: false } });
  #host = injectHost<Container>().host;
  #parts: Particle[] = [];
  #sd: Seed[] = [];
  #ready = false;
  hook = inject(Frame).onFrame((dt) => {
    if (!this.#ready) {
      this.#ready = true;
      this.#sd = untracked(this.seeds);
      const tex = textureFor("rock");
      for (const s of this.#sd) {
        const p = new Particle({ texture: tex, x: s.x, y: s.y, anchorX: 0.5, anchorY: 0.5 });
        this.#parts.push(p);
        this.#pc.addParticle(p);
      }
      this.#host.addChild(this.#pc);
    }
    const parts = this.#parts;
    const sd = this.#sd;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      const s = sd[i]!;
      p.x = wrap(p.x + s.vx * dt, W);
      p.y = wrap(p.y + s.vy * dt, H);
      p.rotation += s.spin * dt;
    }
  });
}
