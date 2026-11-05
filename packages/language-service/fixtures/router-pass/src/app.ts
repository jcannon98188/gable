import { html, signal } from "@gable/core";
import { RouterLink, RouterLinkActive } from "@gable/core/router";

export class Nav {
  static meta = {
    selector: "x-nav",
    imports: [RouterLink, RouterLinkActive],
    template: html`
      <a routerLink="/home" routerLinkActive="on">Home</a>
      <a [routerLink]="target()">Target</a>
      <a href="/plain">No router link here</a>
    `,
  };
  target = signal("/x");
}
