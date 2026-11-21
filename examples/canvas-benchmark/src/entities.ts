// Benchmark entities. Every entity is a component with its own frame hook ("entities are components", canvas/119).
// Every style moves x, y and rotation of one sprite on every frame, with the same deterministic motion:
//   signals:  3 signals per entity, 3 bindings                       (<rock-signals>)
//   shared:   1 signal per entity holding a fresh pose object, 3 bindings reading it (<rock-shared>)
//   ref:      direct writes to the Pixi node through #ref, no signals, no bindings   (<rock-ref>)
//   particles: one Pixi ParticleContainer moved from a single hook, the "give up components" ceiling (<rock-particles>)
import { html, inject, injectHost, input, signal, untracked, viewChild } from "@gablejs/core";
import { Frame, pixiRenderer, type PixiRendererOptions } from "@gablejs/renderer-pixi";
import { Cache, Container, Particle, ParticleContainer, Texture } from "pixi.js";

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

export const STYLES = ["signals", "shared", "ref", "particles"] as const;
export type Style = (typeof STYLES)[number];

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

export class RockShared {
  static meta = {
    selector: "rock-shared",
    template: html`<sprite texture="rock" anchor="0.5" [x]="pose().x" [y]="pose().y" [rotation]="pose().rotation"></sprite>`,
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

/** A Pixi ParticleContainer: one hook moves every particle. Not a component per entity: the ceiling, not the design. */
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
      const texture = rockTexture();
      for (const s of this.#sd) {
        const p = new Particle({ texture, x: s.x, y: s.y, anchorX: 0.5, anchorY: 0.5 });
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

let rock: Texture | undefined;
/** A small procedural texture (a canvas where there is one), so the benchmark loads no files. */
export function rockTexture(): Texture {
  if (rock) return rock;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const g = canvas.getContext("2d");
    if (g) {
      g.fillStyle = "#c9a36b";
      g.beginPath();
      g.arc(8, 8, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#6b4f2a";
      g.fillRect(8, 2, 2, 12);
      return (rock = Texture.from(canvas));
    }
  }
  return (rock = Texture.WHITE);
}

/** Puts the procedural texture in Pixi's asset cache, where `<sprite texture="rock">` looks it up. */
export function registerRock(): void {
  Cache.set("rock", rockTexture());
}

/**
 * The benchmark root: a DOM component holding one canvas boundary (a component whose `renderer` is the Pixi renderer, which
 * is what <gable-canvas> wraps) with `n` entities of one style inside it. The entities inject the boundary's Frame service.
 */
export function benchApp(style: Style, seeds: Seed[], options: PixiRendererOptions) {
  class BenchScene {
    static meta = {
      selector: "bench-scene",
      imports: [RockSignals, RockShared, RockRef, RockParticles],
      renderer: pixiRenderer(options),
      template: html`
        @switch (style) {
          @case ("signals") {
            @for (s of seeds; track s.id) {
              <rock-signals [seed]="s"></rock-signals>
            }
          }
          @case ("shared") {
            @for (s of seeds; track s.id) {
              <rock-shared [seed]="s"></rock-shared>
            }
          }
          @case ("ref") {
            @for (s of seeds; track s.id) {
              <rock-ref [seed]="s"></rock-ref>
            }
          }
          @default {
            <rock-particles [seeds]="seeds"></rock-particles>
          }
        }
      `,
    };
    style = style;
    seeds = seeds;
  }
  return class BenchApp {
    static meta = { selector: "bench-app", imports: [BenchScene], template: html`<bench-scene></bench-scene>` };
  };
}
