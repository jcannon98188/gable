import { html } from "@gable/core";

export class Packages {
  static meta = {
    selector: "site-packages",
    template: html`
<section class="sec s2">
<div class="in">
<div class="eyebrow">All of it</div>
<h2 class="h2">One version number. One toolchain.</h2>
<p class="lead mut">Every package is released together, so the parts always fit.</p>
<div class="grid4">
<div class="card p"><h3 style="font-size: 18px">&#64;gable/core</h3><p class="mut">Signals, components, DI, templates. Router, forms, HTTP and RxJS entry points.</p></div>
<div class="card p"><h3 style="font-size: 18px">&#64;gable/store</h3><p class="mut">Application state on top of signals.</p></div>
<div class="card p"><h3 style="font-size: 18px">DevTools</h3><p class="mut">A browser extension to inspect components, signals and injectors.</p></div>
<div class="card p"><h3 style="font-size: 18px">&#64;gable/vite</h3><p class="mut">Dev-only HMR wiring and tsconfig checks.</p></div>
<div class="card p"><h3 style="font-size: 18px">gable-ui</h3><p class="mut">Components you own.</p></div>
<div class="card p"><h3 style="font-size: 18px">Gable Designer</h3><p class="mut">Visual editing that writes real source.</p></div>
<div class="card p"><h3 style="font-size: 18px">Gable Editor</h3><p class="mut">Collaborative rich text.</p></div>
<div class="card p"><h3 style="font-size: 18px">create-gable</h3><p class="mut">A starter with Vite, Tailwind, tests and tooling wired up.</p></div>
</div>
</div>
</section>
    `,
  };
}
