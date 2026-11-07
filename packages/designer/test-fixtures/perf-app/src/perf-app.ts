// The Designer's driven performance check (e2e/perf-check.mjs) runs against this app. It is slow ON PURPOSE: a banner
// that appears late pushes the content down (a layout shift), and a busy loop blocks the main thread once the page has
// painted (a long task). The paragraph is the largest text, so it is the LCP element. Do not fix them.
import { html, signal } from "@gable/core";

export class PerfApp {
  static meta = {
    selector: "app-root",
    template: html`
      <main style="font-family: sans-serif; padding: 16px">
        @if (late()) {
          <div class="banner" style="height: 320px; background: #fde68a">A banner that arrives late</div>
        }
        <h1 class="title">Performance fixture</h1>
        <p class="lead" style="font-size: 22px; max-width: 900px; min-height: 320px">
          This paragraph is the largest piece of content the page paints, so the browser names it as the largest contentful
          paint. A banner inserted above it a moment after the first paint moves it down, which the browser records as a layout
          shift with this paragraph and the heading as its sources. Then a busy loop holds the main thread for a while.
        </p>
      </main>
    `,
  };
  late = signal(false);
  // The banner arrives late, then a long task runs after the first paint, so it counts toward total blocking time.
  slowStart = setTimeout(() => {
    this.late.set(true);
    setTimeout(() => {
      const until = performance.now() + 160;
      while (performance.now() < until) {
        // busy
      }
    }, 50);
  }, 400);
}
