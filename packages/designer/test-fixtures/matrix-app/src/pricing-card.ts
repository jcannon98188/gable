// The matrix fixture (TASK-56.22): a card whose layout depends on the viewport width (a column on a phone, a row from 700px),
// so the same Scenario looks different at each breakpoint. The check edits pricing-card.css (pixels change) and the template
// (an invisible attribute: the markup changes, the pixels do not), then restores both.
import { html, input } from "@gable/core";
import "./pricing-card.css";

export class PricingCard {
  static meta = {
    selector: "app-pricing-card",
    template: html`
      <section class="card">
        <h2 class="name">{{ name() }}</h2>
        <p class="price">{{ price() }}</p>
        <ul class="perks">
          @for (p of perks(); track p) {
            <li>{{ p }}</li>
          }
        </ul>
        <button class="cta">Choose</button>
      </section>
    `,
  };
  name = input("Starter");
  price = input("$9");
  perks = input<string[]>(["One project", "Email support"]);
}
