// The Designer's driven accessibility and patch-diff check (e2e/a11y-diff-check.mjs) runs against this app. It is
// inaccessible ON PURPOSE: an image without alt text, a text field without a label and grey-on-white text are what the
// Preview agent's checks must find and link back here. Do not fix them.
import { html } from "@gable/core";

export class A11yApp {
  static meta = {
    selector: "app-root",
    template: html`
      <main>
        <h1>Fixture</h1>
        <img src="/missing.png" width="40" height="40" />
        <input type="text" />
        <p style="color: #c4c4c4">Faint text</p>
        <button type="button">Save</button>
      </main>
    `,
  };
}
