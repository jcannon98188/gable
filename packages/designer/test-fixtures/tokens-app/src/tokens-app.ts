// The Designer's driven token check (e2e/tokens-check.mjs) and src/tokens.test.ts run against this app: its own tokens in
// src/styles.css next to gable-ui's theme.css, read through a rule (.card), an inline style and Tailwind classes.
import { html } from "@gable/core";

export class TokensApp {
  static meta = {
    selector: "app-root",
    template: html`
      <main class="p-6">
        <section class="card">
          <h1 class="text-brand text-2xl font-semibold">Tokens</h1>
          <p style="color: var(--brand)">Inline brand</p>
          <button type="button" class="bg-primary text-primary-foreground rounded-md px-3 py-1">Primary</button>
        </section>
      </main>
    `,
  };
}
