import { html } from "@gable/core";

export class Hmr {
  static meta = {
    selector: "site-hmr",
    template: html`
<section class="sec" id="hmr">
<div class="in">
<div class="grid2">
<div>
<div class="eyebrow">True HMR</div>
<h2 class="h2">Edit. Don't reload.</h2>
<p class="lead mut">Most hot reload keeps a page alive until it can't, then falls back to a full refresh and you lose your place. Gable swaps classes in place and moves live state into the new instance, so you stay where you were.</p>
<ul class="chk">
<li><span><b>Components, templates, styles and services</b> all update in place.</span></li>
<li><span><b>State transfer</b> copies fields with the same name and kind. New fields start fresh and removed ones are dropped.</span></li>
<li><span><b>Router state survives</b>, so you stay on the route you were editing.</span></li>
<li><span>Opt a class out with <span class="mono">static hmr = "reset"</span> when you want a clean slate.</span></li>
</ul>
</div>
<div class="win">
<div class="wbar"><i></i><i></i><i></i><span style="margin-left: 8px">What happens when you save</span></div>
<div style="padding: 24px; display: flex; flex-direction: column; gap: 14px">
<div class="pl"><span>BEFORE</span><div class="mono"><span style="font-size: 13px">Counter &#123; count: <b>7</b> &#125;</span></div></div>
<div class="pl"><span>YOU EDIT</span><div class="">Change the template, add a <span class="mono">label</span> field</div></div>
<div class="pl"><span>SWAP</span><div class="">New class replaces the old one. Fields match by name and kind.</div></div>
<div class="pl"><span>AFTER</span><div class="ok mono"><span style="font-size: 13px">Counter &#123; count: <b>7</b>, label: "" &#125;</span></div></div>
</div>
</div>
</div>
</div>
</section>
    `,
  };
}
