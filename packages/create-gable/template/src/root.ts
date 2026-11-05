import { html } from "@gable/core";
import { Counter } from "./counter.js";

export class Root {
  static meta = {
    selector: "app-root",
    imports: [Counter],
    template: html`
      <main class="mx-auto max-w-md p-8">
        <h1 class="text-2xl font-bold">Hello, Gable</h1>
        <app-counter></app-counter>
      </main>
    `,
  };
}
