import { html } from "@gable/core";

export class Hero {
  static meta = {
    selector: "site-hero",
    template: html`
<div class="hero">
<div class="in">
<span class="pill"><i></i>Pre-1.0 · the API can still change</span>
<h1 style="margin-top: 24px">Angular's best ideas. <em>Real</em> hot reload. No compiler.</h1>
<p class="lead mut" style="font-size: 21px; max-width: 760px">Gable is a client-side framework with components, dependency injection, a router, forms and an HTTP client. Edit a component, template, style or service and the running app updates in place, with its state intact. Templates are plain tagged template literals, read at runtime.</p>
<div class="row" style="margin-top: 36px">
<div class="cmd"><b>$</b> npm create gable&#64;latest my-app</div>
<a class="btn btn-o" href="#framework">See how it works</a>
</div>

<div class="hero-g">
<div class="win">
<div class="wbar"><i></i><i></i><i></i><span style="margin-left: 8px">counter.ts</span></div>
<pre class="code"><span class="k">export class</span> <span class="t">Counter</span> &#123;
  <span class="k">static</span> meta = &#123;
    selector: <span class="s">"app-counter"</span>,
    template: <span class="f">html</span><span class="s">&#96;</span>
<span class="hl">      <span class="t">&lt;p&gt;</span>Count: &#123;&#123; count() &#125;&#125; (doubled: &#123;&#123; doubled() &#125;&#125;)<span class="t">&lt;/p&gt;</span></span>      <span class="t">&lt;button</span> <span class="a">(click)</span>=<span class="s">"increment()"</span><span class="t">&gt;</span>+1<span class="t">&lt;/button&gt;</span>
    <span class="s">&#96;</span>,
  &#125;;

  count = <span class="f">signal</span>(<span class="a">0</span>);
  doubled = <span class="f">computed</span>(() =&gt; <span class="k">this</span>.count() * <span class="a">2</span>);
  increment() &#123; <span class="k">this</span>.count.<span class="f">update</span>((n) =&gt; n + <span class="a">1</span>); &#125;
&#125;</pre>
</div>
<div class="win" style="display: flex; flex-direction: column">
<div class="wbar"><i></i><i></i><i></i><span style="margin-left: 8px">localhost:5173</span></div>
<div style="padding: 32px; display: flex; flex-direction: column; gap: 16px; flex: 1">
<p style="font-size: 22px; font-weight: 600">Count: 7 (doubled: 14)</p>
<div class="row"><span class="btn btn-a" style="min-height:34px;padding:0 14px;font-size:14px">+1</span><span class="btn btn-o" style="min-height:34px;padding:0 14px;font-size:14px">Save</span></div>
<span style="flex: 1"></span>
<div style="display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 8px; background: var(--okbg); color: var(--okfg); font-size: 14px"><span class="tag" style="background: var(--okfg); color: var(--bg)">HMR</span><span>Template patched. <b>count = 7</b> carried over, no reload.</span></div>
</div>
</div>
</div>
</div>
</div>
    `,
  };
}
