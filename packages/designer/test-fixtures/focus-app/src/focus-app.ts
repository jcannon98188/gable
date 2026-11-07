// The Designer's driven keyboard and accessibility-tree check (e2e/a11y-depth-check.mjs) runs against this app. It has
// keyboard problems ON PURPOSE: a positive tabindex, a control that is only a div with a role, a text field without a name,
// a button that hides its focus ring (index.html) and a skipped heading level. Do not fix them.
import { html, signal } from "@gable/core";

export class FocusApp {
  static meta = {
    selector: "app-root",
    template: html`
      <main>
        <h1>Keyboard fixture</h1>
        <nav aria-label="Main">
          <a href="/home">Home</a>
          <a href="/docs">Docs</a>
        </nav>
        <button type="button" tabindex="3">Pay first</button>
        <div role="button">Fake button</div>
        <input type="text" />
        <button type="button" class="noring">No ring</button>
        <button type="button" data-test="count" (click)="inc()">Count</button>
        <p data-test="counted">Count: {{ count() }}</p>
        <h3>Skipped heading</h3>
      </main>
    `,
  };
  count = signal(0);
  inc(): void {
    this.count.update((n) => n + 1);
  }
}
