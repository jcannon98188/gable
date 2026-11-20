// The heavy half of <gable-canvas>: a component whose template is built with the Pixi renderer. This module (and
// renderer.ts, and pixi.js behind it) is reached only through the host's dynamic import (canvas/117).
import { hotData, html, input, isHotUpdating } from "@gable/core";
import type { Container } from "pixi.js";
import { DEV } from "./dev.js";
import { createPixiRenderer, type PixiRendererOptions, type PixiSceneRenderer } from "./renderer.js";

/**
 * What survives a hot edit (dev; in production `hotData` just creates it): the scene renderer with its Application and
 * GL context. `live` holds one guard per scene instance that uses it: a hot update builds the replacement scene beside the
 * old one, so the renderer is destroyed only when every instance has let go (a real unmount, never a rebuild or an abort).
 */
interface Held {
  /** Which canvas this is (the host's `canvas-key` or `id`), so a rebuild gives each canvas back its own renderer. */
  key: string | undefined;
  renderer: PixiSceneRenderer | null;
  options: () => PixiRendererOptions;
  live: Set<object>;
}

// A host edit rebuilds the host's view, and the scene inside its `@defer` block is created a moment after the old scene was
// retired, outside the build that pairs `hotData` stores. So the renderer of a scene that just lost its last instance
// waits here (dev only, and only when the release is part of a hot update, never a real unmount) for a replacement to claim it,
// and is destroyed if none does within the grace period. A replacement claims the orphan with the same key (the canvas's
// `canvas-key` or `id`), so several canvases cannot swap Applications whatever order the rebuild creates them in. Canvases
// without a key are paired first come, first served, in rebuild order.

/** How long (ms) a renderer released by a hot update waits for its replacement scene before it is destroyed. The deferred scene is built within a few frames; 200 ms is generous on a slow machine and short enough that a real removal frees the GL context promptly. */
export const ORPHAN_GRACE_MS = 200;
const orphans = new Map<Held, ReturnType<typeof setTimeout>>();

function orphan(held: Held, real: PixiSceneRenderer) {
  orphans.set(held, setTimeout(() => {
    orphans.delete(held);
    real.destroy();
  }, ORPHAN_GRACE_MS));
}

/** Names a canvas across a hot rebuild: the `<gable-canvas>`'s `canvas-key` attribute, else its `id`; undefined when it has neither. */
function canvasKeyOf(sceneHost: HTMLElement): string | undefined {
  const canvas = sceneHost.closest?.("gable-canvas");
  return canvas?.getAttribute("canvas-key") ?? canvas?.getAttribute("id") ?? undefined;
}

function adoptOrphan(into: Held) {
  for (const [held, timer] of orphans) {
    if (held.key !== into.key) continue;
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
      if (DEV) held.key = canvasKeyOf(host);
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
      // The renderer (and its root) outlives one scene instance, so each instance removes the nodes it put at the root when it goes.
      const top = new Set<Container>();
      const renderer: PixiSceneRenderer = {
        ...real,
        insert(parent, node, before) {
          if (parent === real.root) top.add(node);
          real.insert(parent, node, before);
        },
        remove(node) {
          top.delete(node);
          real.remove(node);
        },
        destroy() {
          for (const node of top) if (!node.destroyed && node.parent === real.root) real.remove(node);
          top.clear();
          held.live.delete(guard);
          if (held.live.size > 0) return;
          if (DEV && isHotUpdating()) orphan(held, real);
          else real.destroy();
        },
      };
      return { renderer, root: real.root };
    },
  };

  // Not a field state transfer can see on purpose: `hotData` hands the same holder to the replacement instance.
  #held = hotData<Held>("pixi", () => ({ key: undefined, renderer: null, options: () => ({}), live: new Set() }));

  options = input<PixiRendererOptions>({});
}
