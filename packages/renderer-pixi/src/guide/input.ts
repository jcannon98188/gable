import { html, inject, signal } from "@gablejs/core";
import { Frame, Keyboard, Pointer, createDrag } from "@gablejs/renderer-pixi";

export class Player {
  static meta = {
    selector: "game-player",
    template: html`
      <sprite label="ship" [x]="x()" y="100" width="40" height="40" (pointerdown)="drag.down($event)" />
      <sprite label="cursor" [x]="pointer.position().x" [y]="pointer.position().y" />
    `,
  };
  keyboard = inject(Keyboard); // polled per frame; listens only while the canvas host has focus
  pointer = inject(Pointer); // position in scene coordinates, as signals
  x = signal(0);
  shots = signal(0);

  // Dragging is composed from a pointerdown plus the Pointer service; it is not template syntax.
  drag = createDrag({ onMove: (e) => this.x.update((x) => x + e.step.x) });

  poll = inject(Frame).onFrame((dt) => {
    if (this.keyboard.isDown("ArrowRight")) this.x.update((x) => x + 200 * dt);
    if (this.keyboard.isDown("ArrowLeft")) this.x.update((x) => x - 200 * dt);
    if (this.keyboard.justPressed("Space")) this.shots.update((n) => n + 1); // true for exactly one frame
  });
}
