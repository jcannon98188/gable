import { html } from "@gable/core";

export class Tooling {
  static meta = {
    selector: "site-tooling",
    template: html`
<section class="sec s2">
<div class="in">
<div class="eyebrow">Tooling</div>
<h2 class="h2">Strong template tooling, without a compile step.</h2>
<div class="grid4">
<div class="card p"><h3 style="font-size: 18px">Language service</h3><p class="mut">Type-checks templates against your classes. Runs as a tsserver plugin and as the <span class="mono">gable-check</span> CLI for CI.</p></div>
<div class="card p"><h3 style="font-size: 18px">VS Code extension</h3><p class="mut">Diagnostics, completions and highlighting inside your templates.</p></div>
<div class="card p"><h3 style="font-size: 18px">Formatter</h3><p class="mut">A template formatter and a Prettier plugin keep markup consistent.</p></div>
<div class="card p"><h3 style="font-size: 18px">Testing</h3><p class="mut"><span class="mono">&#64;gable/testing</span> mounts components into an in-memory renderer.</p></div>
</div>
</div>
</section>
    `,
  };
}
