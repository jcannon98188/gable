import { computed, html, inject, signal } from "@gablejs/core";
import { ReducedMotion, announceOnChange } from "@gablejs/renderer-pixi";

export class Score {
  static scope = "root";
  points = signal(0);
}

export class Hud {
  static meta = {
    selector: "game-hud",
    template: html`
      <sprite label="start" width="80" height="30" [a11y]="startA11y" (pointertap)="start()" />
      <sprite label="shaker" [x]="shake()" />
    `,
  };
  score = inject(Score);
  reduced = inject(ReducedMotion); // a signal: tone down shake, parallax and particles when it is true

  // Meaningful changes go through the app's LiveAnnouncer, throttled to one polite message per second.
  say = announceOnChange(this.score.points, (n) => `Score ${n}`);

  shake = computed(() => (this.reduced.reduced() ? 0 : 5)); // templates cannot use ?: derive in a computed

  startA11y = { role: "button", label: "Start game" };

  start() {
    this.score.points.set(1);
  }
}
