import { html, signal } from "@gablejs/core";
import { pixiElements } from "@gablejs/renderer-pixi/elements";

// Scene nodes with an activation listener (down, up, tap, click) and no [a11y]; hover and tracking listeners (over, out, enter, leave, move) are not flagged. Each flagged one is marked `BAD:` in the template.
export class Board {
  static meta = {
    selector: "x-board",
    renderer: () => undefined as never,
    template: html`
      <container>
        <sprite (pointerdown)="go()"></sprite>
        <sprite (click)="go()" (pointerup)="go()"></sprite>
        <container (tap)="go()"></container>
        <sprite (mousedown)="go()"></sprite>
        <sprite (mouseover)="go()"></sprite>
        <sprite (pointerover)="go()" (pointerout)="go()"></sprite>
        <sprite (pointerenter)="go()" (pointerleave)="go()"></sprite>
        <sprite (pointermove)="go()" (globalpointermove)="go()"></sprite>
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
