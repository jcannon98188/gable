import { html } from "@gablejs/core";

export class Board {
  static meta = {
    selector: "x-board",
    renderer: () => undefined as never,
    template: html`<container><sprite (pointerdown)="go()"></sprite></container>`,
  };
  go(): void {}
}
