import { html, signal } from "@gablejs/core";

export class Bare {
  static meta = { selector: "bare-view", template: html`<p>{{ count }}</p>` };
  count = signal(0);
}
