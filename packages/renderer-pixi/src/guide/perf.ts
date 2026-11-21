import { html, inject, signal, viewChild } from "@gablejs/core";
import { Frame, particles, pixiElements, type ParticleSet } from "@gablejs/renderer-pixi";

/** Tier 1, components with signals: fine up to about 1,000 entities. Each entity is a component, each property a signal. */
export class Dot {
  static meta = { selector: "game-dot", template: html`<sprite label="dot" [x]="x()" [y]="y()" />` };
  x = signal(0);
  y = signal(0);
}

/** Tier 2, pose: one signal per entity feeds a point-like property, so one binding re-runs, not two. */
export class PoseDot {
  static meta = { selector: "game-pose-dot", template: html`<sprite label="pose" [position]="pose().pos" />` };
  pose = signal({ pos: { x: 0, y: 0 } });
}

/** Tier 4, particles: plain records written directly; no signals, no bindings, no per-entity component. */
export class Sparks {
  static meta = { selector: "game-sparks", elements: pixiElements, template: html`<particle-container #sparks texture="spark" />` };
  sparks = viewChild("sparks");
  field: ParticleSet | undefined; // not #private (see the HMR rules)

  hook = inject(Frame).onFrame((dt) => {
    if (!this.field) {
      const ref = this.sparks();
      if (!ref) return; // the template is not built yet
      this.field = particles(ref);
      for (let i = 0; i < 1000; i++) this.field.add({ x: i, y: 0 });
    }
    for (const p of this.field.items) p.y += 40 * dt; // direct writes
  });
}
