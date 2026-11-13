// The particle tier (TASK-104.14): the ref helper for <particle-container>. Pixi particles are plain records, not
// display objects, so they cannot be child tags; a scene creates and updates them through this helper on a `#ref`.
//
//   <particle-container #sparks [texture]="'spark'" [dynamicProperties]="{ rotation: true }" />
//   const sparks = particles(this.sparks);
//   sparks.add({ x, y, tint: 0xffaa00 });          // once, on spawn
//   for (const p of sparks.items) p.x += p.vx * dt; // per frame, direct writes: no signals, no bindings
//
// This module is free of any pixi.js import: the container node (the real Pixi ParticleContainer from the Pixi renderer,
// or the in-memory node of the scene test renderer) supplies the particle factory, so the same code runs on both.

export interface ParticleOptions {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  anchorX?: number;
  anchorY?: number;
  rotation?: number;
  /** A colour: number (`0xff0000`) or any string Pixi's Color accepts. */
  tint?: number | string;
  alpha?: number;
  /** The particle's texture; default: the container's `texture`. All particles of one container share one texture source. */
  texture?: unknown;
}

/** A particle as the scene sees it: write the fields directly. Dynamic fields (see `dynamicProperties`) are uploaded every frame; the rest after `update()`. */
export interface ParticleLike {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  anchorX: number;
  anchorY: number;
  rotation: number;
  tint: number;
  alpha: number;
  texture: unknown;
}

/** What a `<particle-container>` node provides, on the Pixi renderer and the scene test renderer alike. */
export interface ParticleHost {
  readonly particleChildren: ParticleLike[];
  newParticle(options: ParticleOptions): ParticleLike;
  addParticle(...particles: ParticleLike[]): unknown;
  removeParticle(...particles: ParticleLike[]): unknown;
  removeParticles(): unknown;
  update(): void;
}

export interface ParticleSet {
  /** The live particles, in draw order. Treat as read-only; mutate through `add`, `remove` and `clear`. */
  readonly items: readonly ParticleLike[];
  readonly count: number;
  /** Creates a particle and adds it to the container. */
  add(options?: ParticleOptions): ParticleLike;
  remove(particle: ParticleLike): void;
  clear(): void;
  /** Re-uploads the static (non-dynamic) fields after you changed them; dynamic fields need no call. */
  update(): void;
}

/** Type guard for a `<particle-container>` node (a `#ref` to one). */
export function isParticleHost(node: unknown): node is ParticleHost {
  return typeof node === "object" && node !== null && typeof (node as ParticleHost).newParticle === "function" && Array.isArray((node as ParticleHost).particleChildren);
}

/**
 * Creates and updates the particles of a `<particle-container>` through its `#ref`. Particles are not display objects:
 * they have no children, events or bindings, which is what lets a container hold on the order of 100,000 of them.
 */
export function particles(ref: unknown): ParticleSet {
  if (!isParticleHost(ref)) {
    throw new Error("particles() needs a reference to a <particle-container>: add #name to the tag and pass that reference.");
  }
  const host = ref;
  return {
    get items() {
      return host.particleChildren;
    },
    get count() {
      return host.particleChildren.length;
    },
    add(options = {}) {
      const particle = host.newParticle(options);
      host.addParticle(particle);
      return particle;
    },
    remove(particle) {
      host.removeParticle(particle);
    },
    clear() {
      host.removeParticles();
    },
    update() {
      host.update();
    },
  };
}
