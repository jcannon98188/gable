import { ErrorBoundary, html } from "@gable/core";
import "./demos/data/data-demos.css";
import { FormDemo } from "./demos/data/form-demo.js";
import { I18nDemo } from "./demos/data/i18n-demo.js";
import { StoreDemo } from "./demos/data/store-demo.js";

export class Data {
  static meta = {
    selector: "site-data",
    imports: [ErrorBoundary, FormDemo, I18nDemo, StoreDemo],
    template: html`
<section class="sec" id="data">
<div class="in">
<div class="eyebrow">State, forms and language</div>
<h2 class="h2">The app-level pieces, already built and already hot-reloadable.</h2>
<p class="lead mut">Forms, translations and shared state are first-party and built on the same signals as everything else. No extra compiler step for any of them, and they keep their state across hot updates.</p>
<div class="dd-rows">

<div class="dd-row">
<div class="card dd-text"><div><div class="ico"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path></svg></div><h3>Signal forms</h3><p class="mut">A form is a signal over your data. Every property is a field with its own errors, touched, dirty and pending state, and rules are a typed schema. Type below to watch them change.</p></div>
<div class="win" style="margin-top:auto"><div class="wbar"><span>signup.ts</span></div>
<pre class="code" style="font-size:12px"><span class="k">const</span> f = <span class="f">form</span>(model, (p) =&gt; &#123;
  <span class="f">required</span>(p.email);
  <span class="f">email</span>(p.email);
  <span class="f">minLength</span>(p.password, <span class="a">8</span>);
  <span class="f">validate</span>(p.confirm, matchesPassword);
  <span class="f">validateAsync</span>(p.handle, isHandleFree);
&#125;);

f.email.state.<span class="f">errors</span>();
f.state.<span class="f">valid</span>();</pre></div>
</div>
<div class="dd-demo"><div class="dd-demo-h">Try it: sign up</div>
<gable-error-boundary>
<data-form-demo></data-form-demo>
<p slot="fallback" class="dd-fallback">The sign-up form demo failed to start. The rest of the page is unaffected.</p>
</gable-error-boundary>
</div>
</div>

<div class="dd-row">
<div class="card dd-text"><div><div class="ico"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"></path></svg></div><h3>Built-in i18n</h3><p class="mut">Mark text in a template and it translates at runtime. ICU plurals, selects, numbers and dates use <span class="mono">Intl</span>. Switch language and watch the same templates re-render.</p></div>
<div class="win" style="margin-top:auto"><div class="wbar"><span>inbox.ts</span></div>
<pre class="code" style="font-size:12px"><span class="t">&lt;h4</span> <span class="a">i18n</span>=<span class="s">"&#64;&#64;title"</span><span class="t">&gt;</span>Your inbox<span class="t">&lt;/h4&gt;</span>
<span class="t">&lt;p</span> <span class="a">i18n</span>=<span class="s">"&#64;&#64;unread"</span><span class="t">&gt;</span>
  &#123;&#123; unread() &#125;&#125; unread messages
<span class="t">&lt;/p&gt;</span>

<span class="c">// fr catalog: unread</span>
<span class="s">"&#123;0, plural, one &#123;# message non lu&#125;
  other &#123;# messages non lus&#125;&#125;"</span>

<span class="c">// in code</span>
title = <span class="f">i18n</span><span class="s">&#96;Inbox (&#36;&#123;count&#125;)&#96;</span>;</pre></div>
</div>
<div class="dd-demo"><div class="dd-demo-h">Try it: switch language</div>
<gable-error-boundary>
<data-i18n-demo></data-i18n-demo>
<p slot="fallback" class="dd-fallback">The i18n demo failed to start. The rest of the page is unaffected.</p>
</gable-error-boundary>
</div>
</div>

<div class="dd-row">
<div class="card dd-text"><div><div class="ico"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="8" ry="3"></ellipse><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path></svg></div><h3>Signal stores</h3><p class="mut"><span class="mono">&#64;gable/store</span> is a small, typed state container: read-only deep signals, computed values and methods as composable features. The JSON beside the cart is the live state.</p></div>
<div class="win" style="margin-top:auto"><div class="wbar"><span>cart-store.ts</span></div>
<pre class="code" style="font-size:12px"><span class="k">class</span> <span class="t">CartStore</span> <span class="k">extends</span> <span class="f">signalStore</span>(
  <span class="f">withState</span>(&#123; lines: [], coupon: <span class="a">false</span> &#125;),
  <span class="f">withStorage</span>(<span class="s">"cart"</span>, &#123; storage: <span class="s">"session"</span> &#125;),
  <span class="f">withComputed</span>(...),   <span class="c">// count, subtotal, total</span>
  <span class="f">withMethods</span>(...),    <span class="c">// add, remove, clear</span>
) &#123;&#125;</pre></div>
</div>
<div class="dd-demo"><div class="dd-demo-h">Try it: a cart store</div>
<gable-error-boundary>
<data-store-demo></data-store-demo>
<p slot="fallback" class="dd-fallback">The Store demo failed to start. The rest of the page is unaffected.</p>
</gable-error-boundary>
</div>
</div>

</div>
</div>
</section>
    `,
  };
}
