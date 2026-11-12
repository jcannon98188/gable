// <gable-canvas>: the DOM element that hosts a Pixi scene. It stays a DOM element, so a normal Gable app embeds it;
// its template and everything projected into it are built with the Pixi renderer by the scene component, which this
// module loads through a dynamic import() on first mount so routes without a game never download Pixi. While that
// loads, the host shows the `placeholder` slot (a quiet empty box by default).
//
// Do not import pixi.js, ./renderer.js or ./scene.js statically here: the lazy chunk would stop being lazy.
import { computed, html, injectHost, input, lazy } from "@gable/core";
import type { PixiRendererOptions } from "./renderer.js";

export class GableCanvas {
  static meta = {
    selector: "gable-canvas",
    imports: [lazy(() => import("./scene.js"), "GableCanvasScene")],
    template: html`@defer (when true) {
      <gable-canvas-scene [options]="sceneOptions()"><slot></slot></gable-canvas-scene>
    } @placeholder {
      <slot name="placeholder"><span class="gable-canvas-placeholder"></span></slot>
    } @loading {
      <slot name="placeholder"><span class="gable-canvas-placeholder"></span></slot>
    }`,
    styles: "gable-canvas, gable-canvas-scene { display: block; position: relative; } gable-canvas-scene { width: 100%; height: 100%; }",
    encapsulation: "none" as const,
  };

  // Name the canvas with aria-label or aria-labelledby on the host (TASK-104.11). The role defaults to group; an author role wins.
  #role = (() => {
    const { host } = injectHost<HTMLElement>();
    if (!host.hasAttribute("role")) host.setAttribute("role", "group");
  })();

  /** Renderer options: background, antialias, resolution, fallback size. */
  options = input<PixiRendererOptions>({});
  /** `always` (default) renders every frame; `on-demand` renders only after a hook or an effect wrote to the scene. */
  renderMode = input<"always" | "on-demand">("always");

  sceneOptions = computed<PixiRendererOptions>(() => ({ ...this.options(), renderMode: this.renderMode() }));
}
