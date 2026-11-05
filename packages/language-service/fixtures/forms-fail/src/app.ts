import { html, model, signal } from "@gable/core";
import { form } from "@gable/core/forms";

export class Rating {
  static meta = { selector: "x-rating", template: html`<i></i>` };
  value = model(0);
}

export class Plain {
  static meta = { selector: "x-plain", template: html`<i></i>` };
  text = signal("x");
}

export class Signup {
  static meta = {
    selector: "x-signup",
    imports: [Rating, Plain],
    template: html`
      <input [field]="notAField" />
      <input [field]="f.age" />
      <input type="number" [field]="f.name" />
      <x-rating [field]="f.name"></x-rating>
      <x-plain [field]="f.name"></x-plain>
      <p>{{ f.name.state.errors }}</p>
      @for (row of f.items.rows(); track row.label()) {
        <input [field]="row.label" />
      }
    `,
  };
  model = signal({ name: "", age: 0 as number | null, items: [{ label: "" }] });
  f = form(this.model);
  notAField = signal("x");
}

export function makeBad() {
  return form(signal({ title: "", state: "open" }));
}
