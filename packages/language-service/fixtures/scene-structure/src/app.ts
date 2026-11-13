import { html } from "@gable/core";
import { pixiElements } from "@gable/renderer-pixi/elements";

// Where scene tags may go: shape tags only inside <graphics>, text only inside <text> and <bitmap-text> (the renderer throws at runtime; this finds it in the editor).
export class Shapes {
  ok = true;
  static meta = {
    selector: "x-shapes",
    elements: pixiElements,
    template: html`
      <container>
        <graphics>
          <rect width="4" height="4"></rect>
          @if (ok) {
            <circle radius="2"></circle>
          }
        </graphics>
        <text>Score {{ 1 }}</text>
        <bitmap-text>hi</bitmap-text>
        <container>
          <rect width="1" height="1"></rect>
          stray words
          @if (ok) {
            <circle radius="1"></circle>
          }
        </container>
        <sprite>{{ 2 }}</sprite>
      </container>
    `,
  };
}
