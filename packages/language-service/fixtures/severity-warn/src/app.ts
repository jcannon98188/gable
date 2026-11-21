import { html, signal } from "@gablejs/core";

export class Bare {
  static meta = { selector: "bare-view", template: html`<p>{{ count }}</p><p>{{ nope() }}</p>` };
  count = signal(0);
}
