import { html } from "@gable/core";

/** The lazy route's page. It lives in its own module so the bundler splits it into a chunk the router loads on demand. */
export class ReportsPage {
  static meta = {
    selector: "mini-reports",
    template: html`
<h3>Reports</h3>
<p>This page came from a separate chunk. The router loaded it before it committed the navigation, so the previous page stayed on screen until now.</p>
<p class="rd-mut">The chunk is cached after the first visit, so the next navigation here is instant.</p>
    `,
  };
}
