import { html } from "@gable/core";

export class WhatYouGet {
  static meta = {
    selector: "site-what-you-get",
    template: html`
<section class="sec">
<div class="in">
<div class="eyebrow">What you get</div>
<h2 class="h2">The parts of Angular worth keeping, minus the build step you didn't ask for.</h2>
<div class="grid3">
<div class="card"><div class="ico"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"></path></svg></div><h3>No framework compiler</h3><p class="mut">Nothing has to understand your templates before the browser can run them. Vite and plain TypeScript transpiling are all you need.</p></div>
<div class="card"><div class="ico"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0114-5M20 12a8 8 0 01-14 5M18 3v4h-4M6 21v-4h4"></path></svg></div><h3>True HMR</h3><p class="mut">Components, templates, styles and services swap in place. Component, service and router state carry across. No page reload.</p></div>
<div class="card"><div class="ico"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"></path></svg></div><h3>Signals and RxJS</h3><p class="mut">State is TC39-style signals. Async and events are Observables. Templates bind either one directly.</p></div>
</div>
</div>
</section>
    `,
  };
}
