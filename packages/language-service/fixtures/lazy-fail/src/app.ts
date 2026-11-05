import { html, lazy } from "@gable/core";

export class Page {
  static meta = {
    selector: "x-page",
    imports: [lazy(() => import("./chart.js"), "Chart")],
    template: html`
      <x-chart></x-chart>
      @defer (on timer(2s)) {
        <x-chart></x-chart>
      } @placeholder {
        <x-chart></x-chart>
      }
    `,
  };
}
