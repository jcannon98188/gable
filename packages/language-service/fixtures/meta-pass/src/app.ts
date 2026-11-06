import { InjectionToken, html, lazy, signal } from "@gable/core";
import type { ComponentMeta } from "@gable/core";

const GREETING = new InjectionToken<string>("greeting");
const shared = { selector: "x-shared", template: html`<i></i>` };

export class Leaf {
  static meta = { selector: "x-leaf", template: html`<i></i>` };
}

export class Full {
  static meta = {
    selector: "x-full",
    imports: [Leaf, lazy(() => import("./other.js"), "Other")],
    providers: [{ provide: GREETING, useValue: "hi" }],
    host: { role: "button", "(click)": "n.set(1)" },
    styles: ["p { color: red }"],
    encapsulation: "none",
    id: "full",
    template: html`<p>{{ n() }}</p>`,
  };
  n = signal(0);
}

// Already typed: the compiler enforces it, so the rule stays out.
export class Satisfied {
  static meta = { selector: "x-satisfied", template: html`<i></i>` } satisfies ComponentMeta;
}

export class Annotated {
  static meta: ComponentMeta = { selector: "x-annotated" };
}

// A shared object and an attribute directive (no template).
export class Reused {
  static meta = shared;
}

export class Directive {
  static meta = { selector: "[x-dir]", host: { class: "on" } };
}

// Not a component: no static meta.
export class Plain {
  static other = { selector: 1 };
}
