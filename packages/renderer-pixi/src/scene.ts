// The heavy half of <gable-canvas>: a component whose template is built with the Pixi renderer. This module (and
// renderer.ts, and pixi.js behind it) is reached only through the host's dynamic import (TASK-104.12).
import { html, input } from "@gable/core";
import { pixiRenderer, type PixiRendererOptions } from "./renderer.js";

export class GableCanvasScene {
  static meta = {
    selector: "gable-canvas-scene",
    template: html`<slot></slot>`,
    // Called once per instance after Setup. The scene (this template, the projected content and every component under it) is built with this renderer.
    renderer: (self: GableCanvasScene, parent: { host: unknown }) => pixiRenderer(() => self.options())(self, parent),
  };

  options = input<PixiRendererOptions>({});
}
