import { html } from "@gable/core";

export class Badge {
  static meta = {
    selector: "app-badge",
    template: html`<span class="pill">New</span>`,
  };
}
