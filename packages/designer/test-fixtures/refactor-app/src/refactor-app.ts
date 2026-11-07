// The Designer's driven refactor check (e2e/refactor-check.mjs) and src/refactor.test.ts run against this app: a component used
// twice in a template (rename, find uses) and a section that reads two signals (extract with props).
import { html, signal } from "@gable/core";
import { Badge } from "./badge.js";

export class RefactorApp {
  static meta = {
    selector: "app-root",
    imports: [Badge],
    template: html`
      <main>
        <section class="panel">
          <h2>{{ heading() }}</h2>
          <p class="note" [title]="note()">Notes</p>
        </section>
        <app-badge></app-badge>
        <app-badge></app-badge>
      </main>
    `,
  };

  heading = signal<string>("Refactors");
  note = signal("keep");
}
