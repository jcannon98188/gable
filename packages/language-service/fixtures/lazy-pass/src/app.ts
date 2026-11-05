import { html, lazy, signal } from "@gable/core";

export class Page {
  static meta = {
    selector: "x-page",
    imports: [lazy(() => import("./chart.js"), "Chart")],
    template: html`
      <h1>Charts</h1>
      @defer (on idle; when ready()) {
        <x-chart></x-chart>
      } @placeholder {
        <p>Waiting</p>
      } @loading {
        <p>Loading</p>
      } @error {
        <p>Failed</p>
      }
      @defer {
        @if (ready()) {
          <x-chart></x-chart>
        }
      }
    `,
  };
  ready = signal(true);
}
