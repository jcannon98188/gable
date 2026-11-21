import { html, signal } from "@gablejs/core";

export class Typing {
  static meta = {
    selector: "x-typing",
    template: html`
      <p>start</p>
    `,
  };

  /** The page title. */
  title = signal("Typing");
  items = signal<string[]>([]);
}
