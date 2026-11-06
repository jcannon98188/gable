import { html, signal } from "@gable/core";

export class Leaf {
  static meta = { selector: "x-leaf", template: html`<i></i>` };
}

export class NotAComponent {
  n = signal(0);
}

export class Plain {
  constructor(readonly x: number) {}
}

export class Typo {
  static meta = { selectr: "x-typo", template: html`<i></i>` };
}

export class BadValues {
  static meta = {
    selector: "x-bad",
    imports: [Leaf, NotAComponent, Plain, "x-leaf"],
    host: { role: 3 },
    encapsulation: "shadow",
    styles: 7,
  };
}

export class NoSelector {
  static meta = { template: html`<i></i>` };
}
