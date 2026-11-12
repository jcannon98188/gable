// The heavy half of <gable-canvas>: a component whose template is built with the Pixi renderer. This module (and
// renderer.ts, and pixi.js behind it) is reached only through the host's dynamic import (TASK-104.12).
import { hotData, html, input } from "@gable/core";
import { DEV } from "./dev.js";
import { createPixiRenderer, type PixiRendererOptions, type PixiSceneRenderer } from "./renderer.js";

/**
 * What survives a hot edit (dev; in production `hotData` just creates it): the scene renderer with its Application and
 * GL context. `live` holds one guard per scene instance that uses it: a hot update builds the replacement scene beside the
 * old one, so the renderer is destroyed only when every instance has let go (a real unmount, never a rebuild or an abort).
 */
interface Held {
  renderer: PixiSceneRenderer | null;
  options: () => PixiRendererOptions;
  live: Set<object>;
}

// A host edit rebuilds the host's view, and the scene inside its `@defer` block is created a moment after the old scene was
// retired, outside the hot update that pairs `hotData` stores. So the renderer of a scene that just lost its last instance
// waits here (dev only) for a replacement to claim it, and is destroyed if none does within the grace period. Claims go
// first come, first served, which pairs several canvases on a page in rebuild order.
const ORPHAN_GRACE_MS = 200;
const orphans = new Map<Held, ReturnType<typeof setTimeout>>();

function orphan(held: Held, real: PixiSceneRenderer) {
  orphans.set(held, setTimeout(() => {
    orphans.delete(held);
    real.destroy();
  }, ORPHAN_GRACE_MS));
}

function adoptOrphan(into: Held) {
  for (const [held, timer] of orphans) {
    clearTimeout(timer);
    orphans.delete(held);
    Object.assign(into, { renderer: held.renderer, live: held.live });
    return;
  }
}

export class GableCanvasScene {
  static meta = {
    selector: "gable-canvas-scene",
    template: html`<slot></slot>`,
    // Called once per instance after Setup. The scene (this template, the projected content and every component under it) is built with this renderer.
    renderer: (self: GableCanvasScene, parent: { host: unknown }) => {
      const held = self.#held;
      const host = parent.host as HTMLElement;
      if (!held.renderer && DEV) adoptOrphan(held);
      held.options = () => self.options();
      if (held.renderer) held.renderer.rehost(host);
      else {
        const created = createPixiRenderer(() => held.options());
        held.renderer = created;
        Promise.resolve()
          .then(() => created.mount(host))
          .catch((error) => console.error("[gable] the Pixi canvas failed to start", error));
      }
      const real = held.renderer;
      const guard = {};
      held.live.add(guard);
      const renderer: PixiSceneRenderer = {
        ...real,
        destroy() {
          held.live.delete(guard);
          if (held.live.size > 0) return;
          if (DEV) orphan(held, real);
          else real.destroy();
        },
      };
      return { renderer, root: real.root };
    },
  };

  // Not a field state transfer can see on purpose: `hotData` hands the same holder to the replacement instance.
  #held = hotData<Held>("pixi", () => ({ renderer: null, options: () => ({}), live: new Set() }));

  options = input<PixiRendererOptions>({});
}
