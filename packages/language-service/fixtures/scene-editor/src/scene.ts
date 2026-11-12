import { html } from "@gable/core";
import { pixiElements } from "@gable/renderer-pixi/elements";

export class Scene {
  static meta = { selector: "x-scene", renderer: () => undefined as never, template: html`<container>boundary-start</container>` };
}

export class Marked {
  static meta = { selector: "x-marked", elements: pixiElements, template: html`<container>marked-start</container>` };
}

export class Page {
  static meta = { selector: "x-page", template: html`<x-scene>projected-start</x-scene><div>dom-start</div>` };
}
