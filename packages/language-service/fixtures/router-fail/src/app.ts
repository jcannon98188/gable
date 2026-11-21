import { html, signal } from "@gablejs/core";
import { RouterLink } from "@gablejs/core/router";

export class Nav {
  static meta = {
    selector: "x-nav",
    imports: [RouterLink],
    template: html`
      <a routerLink="/home" routerLinkActive="on">Home</a>
      <a [routerLink]="count()">Count</a>
    `,
  };
  count = signal(3);
}

export class Bare {
  static meta = { selector: "x-bare", template: html`<a [routerLink]="'/x'">x</a>` };
}
