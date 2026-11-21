import { html } from "@gablejs/core";
import { RouterOutlet } from "@gablejs/core/router";

/** The app root: one outlet for the marketing page or the docs. */
export class App {
  static meta = {
    selector: "site-app",
    imports: [RouterOutlet],
    template: html`<router-outlet></router-outlet>`,
  };
}
