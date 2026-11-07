import { ErrorBoundary, html, lazy } from "@gable/core";
import "./hmr-demo/demo.css";

/**
 * The HMR section. The demo is the real thing: `HmrDemo` mounts a component, runs `@gable/core/hmr` on it in the page and
 * is a lazy chunk, loaded when it nears the viewport, so the HMR runtime stays out of the first load. The error boundary
 * keeps a demo that fails to start from affecting the rest of the page.
 */
export class Hmr {
  static meta = {
    selector: "site-hmr",
    imports: [ErrorBoundary, lazy(() => import("./hmr-demo/demo.js"), "HmrDemo")],
    template: html`
<section class="sec" id="hmr">
<div class="in">
<div class="grid2" style="align-items: start">
<div>
<div class="eyebrow">True HMR</div>
<h2 class="h2">Edit. Don't reload.</h2>
<p class="lead mut">Most hot reload keeps a page alive until it can't, then falls back to a full refresh and you lose your place. Gable swaps classes in place and moves live state into the new instance, so you stay where you were.</p>
<p class="lead" style="margin-top: 16px"><b>Try it.</b> The counter below is a real Gable component running the real HMR runtime in this page. Click +1 a few times, then pick an edit and watch the count stay.</p>
</div>
<ul class="chk">
<li><span><b>Components, templates, styles and services</b> all update in place.</span></li>
<li><span><b>State transfer</b> copies fields with the same name and kind. New fields start fresh and removed ones are dropped.</span></li>
<li><span><b>A broken edit changes nothing.</b> The update is rolled back and the running app is untouched.</span></li>
<li><span><b>Router state survives</b>, so you stay on the route you were editing.</span></li>
<li><span>Opt a class out with <span class="mono">static hmr = "reset"</span> when you want a clean slate.</span></li>
</ul>
</div>
<div style="margin-top: 48px">
<gable-error-boundary>
@defer (on viewport(400)) {
<site-hmr-demo></site-hmr-demo>
} @placeholder {
<div class="win dm dm-ph"><div class="wbar"><i></i><i></i><i></i><span style="margin-left: 8px">counter.js</span></div><p class="dm-ph-body">The live demo loads as you scroll to it.</p></div>
} @loading {
<div class="win dm dm-ph"><div class="wbar"><i></i><i></i><i></i><span style="margin-left: 8px">counter.js</span></div><p class="dm-ph-body">Loading the HMR runtime...</p></div>
} @error {
<div class="win dm"><p class="dm-ph-body">The live demo could not load. The rest of the page does not need it.</p></div>
}
<div slot="fallback" class="win dm"><p class="dm-ph-body">The live demo hit an error and stopped. The rest of the page is unaffected; reload to try again.</p></div>
</gable-error-boundary>
</div>
</div>
</section>
    `,
  };
}
