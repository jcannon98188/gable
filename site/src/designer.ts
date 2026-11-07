import { html, computed, inject } from "@gable/core";
import { ThemeStore } from "./theme.js";

export class DesignerSection {
  static meta = {
    selector: "site-designer",
    template: html`
<section class="sec s2" id="designer">
<div class="in">
<div class="grid2" style="align-items:start">
<div>
<div class="eyebrow">Gable Designer · in development</div>
<h2 class="h2">Design in the running app. Ship the same files.</h2>
<p class="lead mut">A desktop app for building and editing Gable apps by pointing. Developers and non-developers use the same tool. There is no separate design file: every edit becomes a small patch to your own templates, Tailwind classes and route config, and HMR shows it with state kept.</p>
</div>
<ul class="chk" style="margin-top:0">
<li><span><b>Frames</b>: mobile, tablet and desktop previews side by side, each its own app.</span></li>
<li><span><b>Scenarios</b>: empty, loading, error and long-title states for a component, written as TypeScript beside it.</span></li>
<li><span><b>Tailwind style panel</b> with breakpoints and states, plus a binding picker that lists your real signals.</span></li>
<li><span>Every change names its file and line. Undo is a reverse patch.</span></li>
</ul>
</div>
<div class="shotw"><img class="shot" [attr.src]="img()" alt="Gable Designer editing the gable-ui gallery: route tree, live frame, Tailwind style panel and source breadcrumb"><div class="cap">The Designer on a real app, with a button selected. The breadcrumb and source location sit under the frame.</div></div>
</div>
</section>
    `,
  };

  theme = inject(ThemeStore);
  img = computed(() => `${import.meta.env.BASE_URL}img/designer-${this.theme.theme()}.png`);
}
