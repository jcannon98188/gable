import { html } from "@gable/core";

export class Data {
  static meta = {
    selector: "site-data",
    template: html`
<section class="sec" id="data">
<div class="in">
<div class="eyebrow">State, forms and language</div>
<h2 class="h2">The app-level pieces, already built and already hot-reloadable.</h2>
<p class="lead mut">Forms, translations and shared state are first-party and built on the same signals as everything else. No extra compiler step for any of them, and they keep their state across hot updates.</p>
<div class="grid3">

<div class="card" style="display:flex;flex-direction:column;gap:18px">
<div><div class="ico"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path></svg></div><h3>Signal forms</h3><p class="mut">A form is a signal over your data. Every property is a field with its own errors, touched, dirty and pending state. Rules are a typed schema, they compose, and async checks and server errors are built in.</p></div>
<div class="win" style="margin-top:auto"><div class="wbar"><span>signup.ts</span></div>
<pre class="code" style="font-size:12px"><span class="k">const</span> f = <span class="f">form</span>(model, (p) =&gt; &#123;
  <span class="f">required</span>(p.email);
  <span class="f">email</span>(p.email);
  <span class="f">min</span>(p.age, <span class="a">18</span>);
  <span class="f">validateAsync</span>(p.handle, ...);
&#125;);

f.email.state.<span class="f">errors</span>();
f.state.<span class="f">valid</span>();</pre></div>
</div>

<div class="card" style="display:flex;flex-direction:column;gap:18px">
<div><div class="ico"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"></path></svg></div><h3>Built-in i18n</h3><p class="mut">Mark text in a template and it translates at runtime. ICU plurals, selects, numbers and dates use <span class="mono">Intl</span>. The Vite plugin extracts catalogs and exchanges XLIFF with translators, and the language service flags missing translations.</p></div>
<div class="win" style="margin-top:auto"><div class="wbar"><span>greeting.ts</span></div>
<pre class="code" style="font-size:12px"><span class="t">&lt;h1</span> <span class="a">i18n</span>=<span class="s">"page title"</span><span class="t">&gt;</span>
  Welcome
<span class="t">&lt;/h1&gt;</span>
<span class="t">&lt;p</span> <span class="a">i18n</span><span class="t">&gt;</span>
  Hello &#123;&#123; name() &#125;&#125;
<span class="t">&lt;/p&gt;</span>

<span class="c">// in code</span>
title = <span class="f">i18n</span><span class="s">&#96;Inbox (&#36;&#123;count&#125;)&#96;</span>;</pre></div>
</div>

<div class="card" style="display:flex;flex-direction:column;gap:18px">
<div><div class="ico"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="8" ry="3"></ellipse><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path></svg></div><h3>Signal stores</h3><p class="mut"><span class="mono">&#64;gable/store</span> gives you a small, typed state container. State is read-only deep signals, computed values and methods are composable features, and entities, RxJS methods and localStorage persistence are add-ons. Stores keep their state across HMR and show up in the devtools.</p></div>
<div class="win" style="margin-top:auto"><div class="wbar"><span>todo-store.ts</span></div>
<pre class="code" style="font-size:12px"><span class="k">class</span> <span class="t">TodoStore</span> <span class="k">extends</span> <span class="f">signalStore</span>(
  <span class="f">withState</span>(&#123; todos: [] &#125;),
  <span class="f">withComputed</span>(...),
  <span class="f">withMethods</span>(...),
  <span class="f">withStorage</span>(<span class="s">"todos"</span>),
  <span class="f">withDevtools</span>(<span class="s">"todos"</span>),
) &#123; <span class="k">static</span> scope = <span class="s">"root"</span>; &#125;</pre></div>
</div>

</div>
</div>
</section>
    `,
  };
}
