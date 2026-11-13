# Very high counts in a canvas scene: `<particle-container>`

A scene entity is normally a component with signal-bound properties. That stops being affordable at a few thousand entities. This page says where the line is, by measured counts, and how to use the last tier: Pixi's `ParticleContainer`, which holds on the order of 100,000 particles.

## The tiers

Each tier trades authoring convenience for frame cost. Move down a tier when your scene's JS cost per frame (hooks, effect flush, render submit) passes **half a frame**: about 8 ms at 60 Hz, 4 ms at 120 Hz.

| tier | how an entity is updated | fits |
| --- | --- | --- |
| components with signals | each entity is a component, each property a signal with a binding | up to about 1,000 entities |
| pose | one signal per entity feeding point-like properties, e.g. `[position]="pose().pos"` | a few thousand |
| `#ref` writes | the entity writes to its Pixi node through a template `#ref`: no signals, no bindings | several thousand to about 10,000 |
| `<particle-container>` | particles are plain records created and written through `particles(ref)` | 10,000 to 100,000 and beyond |

## Measured counts

From the Pixi renderer spike (JS phases combined per frame, 60 Hz capped, software GL; real-GPU numbers are release-gate work, see `examples/canvas-benchmark`). Per frame, in milliseconds:

| entities | 3 signals each | 1 signal, 1 binding | `#ref` writes | particles |
| --- | --- | --- | --- | --- |
| 5,000 | 18.4 (76 of 600 frames dropped) | 7.9 | 3.3 | |
| 10,000 | 41.9 | 16.9 (21 dropped) | 6.1 | |
| 100,000 | | | | 3.9 |

Read it as: three signals per entity is over a 16.7 ms frame at 5,000 entities; one signal per entity is over it at 10,000; `#ref` writes are over half a frame at about 10,000; a `ParticleContainer` with 100,000 particles cost 3.9 ms. The effect flush dominates the signal styles (about 2.2 microseconds per entity in the 3-signal style); Pixi's render submit stayed under 4 ms even at 10,000 display objects. The benchmark that reproduces these numbers is `examples/canvas-benchmark` (styles `signals`, `shared`, `ref` and `particles`).

Use `<particle-container>` when the entities are many, simple (a texture, a position, a few visual fields) and need no events, children or per-entity logic beyond a per-frame loop: sparks, rain, bullets, star fields. Keep components for anything that needs pointer events, accessibility, children or its own state.

## Use it

```html
<particle-container #sparks texture="spark" [dynamicProperties]="{ rotation: true, color: true }" />
```

```ts
import { html, inject, viewChild } from "@gable/core";
import { Frame, particles, pixiElements, type ParticleSet } from "@gable/renderer-pixi";

class Fireworks {
  static meta = { selector: "game-fireworks", elements: pixiElements, template: html`<particle-container #sparks texture="spark" />` };
  sparks = viewChild("sparks");
  field: ParticleSet | undefined; // not #private: see the HMR rules in the canvas guide

  hook = inject(Frame).onFrame((dt) => {
    if (!this.field) {
      const ref = this.sparks();
      if (!ref) return; // the template is not built yet
      this.field = particles(ref);
      for (let i = 0; i < 50_000; i++) this.field.add({ x: Math.random() * 800, y: Math.random() * 600, tint: 0xffaa00 });
    }
    for (const p of this.field.items) p.y += 40 * dt; // direct writes, no signals
  });
}
```

`particles(ref)` returns:

| member | does |
| --- | --- |
| `add(options?)` | creates a particle (`x`, `y`, `scaleX`, `scaleY`, `anchorX`, `anchorY`, `rotation`, `tint`, `alpha`, `texture`) and adds it; returns it |
| `remove(particle)` | removes one particle |
| `clear()` | removes all |
| `items`, `count` | the live particles, in draw order; write their fields directly |
| `update()` | re-uploads static fields you changed (see below) |

## Rules of the tier

- **No child tags.** A particle is not a display object, so `<particle-container>` takes no children, events, masks or accessibility mirror entries; a child tag is an error that points here.
- **Dynamic versus static fields.** Pixi uploads only `position` every frame by default. Name the other fields you change per frame in `[dynamicProperties]` (`vertex`, `position`, `rotation`, `uvs`, `color`) and set it before the first frame; fields not listed are uploaded when you call `update()`.
- **One texture source.** Every particle of a container samples the same base texture (use one atlas). `texture` on the tag is the default for `add()`.
- **Tests.** The scene test renderer has the same tag and helper: `scene.find("particle-container").particles` lists the particles as plain data.
