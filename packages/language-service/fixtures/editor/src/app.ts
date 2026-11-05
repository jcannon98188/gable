import { html, signal } from "@gable/core";

export class Counter {
  static meta = {
    selector: "x-counter",
    template: html`
      <h1>{{ title() }}</h1>
      <p>{{ count }}</p>
      <p>{{ cuont() }}</p>
      @for (item of items(); track item.id) {
        <li>{{ item.label }}</li>
      }
    `,
  };

  /** The page title. */
  title = signal("Counter");
  count = signal(0);
  items = signal<Array<{ id: number; label: string }>>([]);
}
