import { html, signal } from "@gable/core";

export class Bare {
  static meta = { selector: "bare-view", template: html`<p>{{ count }}</p>` };
  count = signal(0);
}
