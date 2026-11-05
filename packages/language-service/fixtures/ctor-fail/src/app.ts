import { html, signal } from "@gable/core";

export class Counter {
  static meta = { selector: "x-counter", template: html`<p>{{ n() }}</p>` };
  n = signal(0);
  constructor() {
    this.n.set(1);
  }
}

export class Store {
  static scope = "root";
  n = signal(0);
  constructor() {}
}

export class Plain {
  constructor(readonly x: number) {}
}
