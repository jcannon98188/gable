import { html } from "@gable/core";

export class Start {
  static meta = {
    selector: "site-start",
    template: html`
<section class="sec" id="start">
<div class="in" style="max-width: 860px; text-align: center">
<div class="eyebrow">Get started</div>
<h2 class="h2" style="margin: 0 auto">Make a counter. Edit it. Watch nothing reload.</h2>
<div class="win" style="margin: 40px auto 0; text-align: left"><pre class="code"><span class="c"># a counter app with Vite, TypeScript, Tailwind, tests and tooling</span>
<span class="t">npm</span> create gable&#64;latest my-app
<span class="t">cd</span> my-app
<span class="t">npm</span> install
<span class="t">npm</span> run dev</pre></div>
<div class="row" style="justify-content: center; margin-top: 32px"><a class="btn btn-a" href="https://github.com/jcannon98188/gable/tree/main/docs">Read the docs</a><a class="btn btn-o" href="https://github.com/jcannon98188/gable">View on GitHub</a></div>
<p class="mut" style="margin-top: 28px; font-size: 14px">Gable is pre-1.0. Expect the API to move while it settles.</p>
</div>
</section>
    `,
  };
}
