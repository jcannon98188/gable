import { html } from "@gablejs/core";
import { pixiElements } from "@gablejs/renderer-pixi/elements";

// Custom scene tags: `star` is registered with a string literal (found in the source), `gem` is declared in the tsconfig plugin option `sceneTags`.
declare const renderer: { registerTag(tag: string, registration: unknown): void };
renderer.registerTag("star", {});

export class Sky {
  static meta = {
    selector: "x-sky",
    elements: pixiElements,
    template: html`
      <container>
        <star [x]="1" size="3"></star>
        <gem tint="#fff"></gem>
        <sprite></sprite>
        <stor></stor>
      </container>
    `,
  };
}
