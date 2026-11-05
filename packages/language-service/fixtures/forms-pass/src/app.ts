import { html, input, model, output, signal } from "@gable/core";
import { form, required } from "@gable/core/forms";

export class Rating {
  static meta = { selector: "x-rating", template: html`<i></i>` };
  value = model(0);
  disabled = input(false);
  touched = output();
}

export class Signup {
  static meta = {
    selector: "x-signup",
    imports: [Rating],
    template: html`
      <input [field]="f.name" />
      <input type="number" [field]="f.age" />
      <input type="checkbox" [field]="f.agree" />
      <textarea [field]="f.name"></textarea>
      <x-rating [field]="f.stars"></x-rating>
      <p>{{ f.name.state.errors().length }} {{ f.state.valid() }}</p>
      @for (row of f.items.rows(); track row.state.key) {
        <input [field]="row.label" />
      }
      @for (item of plain(); track item) {
        <p>{{ item }}</p>
      }
    `,
  };
  model = signal({ name: "", age: null as number | null, agree: false, stars: 0, items: [{ label: "" }] });
  f = form(this.model, (p) => {
    required(p.name);
  });
  plain = signal(["a"]);
}
