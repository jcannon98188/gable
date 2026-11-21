import { computed, html, inject } from "@gablejs/core";
import { Assets, provideAssets } from "@gablejs/renderer-pixi";

/** Declared once, in the app's root providers. Import single files normally so Vite hashes their URLs. */
export const assetProviders = provideAssets({
  bundles: {
    level1: [{ alias: "ship", src: "/sprites/ship.png" }],
  },
});

export class Level {
  static meta = {
    selector: "game-level",
    template: html`
      @if (level.error()) {
        <text label="failed">Could not load the level</text>
      } @else if (level.ready()) {
        <sprite label="ship" texture="ship" />
      } @else {
        <graphics label="loading">
          <rect [width]="barWidth()" height="8" fill="#ffffff"></rect>
        </graphics>
      }
    `,
  };

  level = inject(Assets).bundle("level1");
  barWidth = computed(() => this.level.progress() * 200); // templates cannot compute: derive in a computed
  // Counted against this component's scope: unloads when the last scene using it goes. A failure shows in level.error(), so swallow the rejection here.
  start = this.level.load().catch(() => {});
}
