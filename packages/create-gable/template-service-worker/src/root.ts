import { html } from "@gablejs/core";
import { Counter } from "./counter.js";
import { UpdateBanner } from "./update-banner.js";

export class Root {
  static meta = {
    selector: "app-root",
    imports: [Counter, UpdateBanner],
    template: html`
      <main class="mx-auto max-w-md p-8">
        <h1 class="text-2xl font-bold">Hello, Gable</h1>
        <app-counter></app-counter>
        <app-update-banner></app-update-banner>
      </main>
    `,
  };
}
