import { html, signal } from "@gable/core";

export class Counter {
  static meta = { selector: "x-counter", template: html`<p>{{ n() }}</p>` };
  n = signal(0);
}

export class Store {
  static scope = "root";
  n = signal(0);
}

/** Neither a component nor a service: a constructor is fine. */
export class Plain {
  constructor(readonly x: number) {}
}
