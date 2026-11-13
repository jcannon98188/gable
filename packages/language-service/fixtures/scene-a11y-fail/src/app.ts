import { html, signal } from "@gable/core";
import { pixiElements } from "@gable/renderer-pixi/elements";

// Scene nodes with a pointer listener and no [a11y]: each flagged one is marked `BAD:` in the template.
export class Board {
  static meta = {
    selector: "x-board",
    renderer: () => undefined as never,
    template: html`
      <container>
        <sprite (pointerdown)="go()"></sprite>
        <sprite (click)="go()" (pointerup)="go()"></sprite>
        <container (tap)="go()"></container>
        <rect (mouseover)="go()"></rect>
        <sprite (pointerdown)="go()" [a11y]="info()"></sprite>
        <sprite (wheel)="go()"></sprite>
        <sprite></sprite>
        <x-ship (pointerdown)="go()"></x-ship>
        @if (true) {
          <text (touchstart)="go()">late</text>
        }
      </container>
    `,
  };
  info = signal({ role: "button", label: "Go" });
  go(): void {}
}

export class Ship {
  static meta = { selector: "x-ship", elements: pixiElements, template: html`<sprite (pointerdown)="go()"></sprite>` };
  go(): void {}
}
