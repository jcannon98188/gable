import { html } from "@gable/core";

export class Framework {
  static meta = {
    selector: "site-framework",
    template: html`
<section class="sec s2" id="framework">
<div class="in">
<div class="eyebrow">The framework</div>
<h2 class="h2">Angular you already know. Fewer moving parts.</h2>
<p class="lead mut">Components with dependency injection, a hierarchical injector tree, a router with guards and outlets, signal-based forms, an HTTP client and control-flow blocks in templates. Plain classes, no decorators, no base class.</p>
<div class="grid2" style="margin-top: 56px; align-items: start">
<div class="win">
<div class="wbar"><i></i><i></i><i></i><span style="margin-left: 8px">user-card.ts</span></div>
<pre class="code"><span class="k">export class</span> <span class="t">UserCard</span> &#123;
  <span class="k">static</span> meta = &#123;
    selector: <span class="s">"user-card"</span>,
    template: <span class="f">html</span><span class="s">&#96;</span>
      <span class="a">&#64;if</span> (user$) &#123;
        <span class="t">&lt;h2&gt;</span>&#123;&#123; name() &#125;&#125;<span class="t">&lt;/h2&gt;</span>
      &#125;
      <span class="a">&#64;for</span> (t <span class="k">of</span> tags(); <span class="k">track</span> t.id) &#123;
        <span class="t">&lt;span&gt;</span>&#123;&#123; t.label &#125;&#125;<span class="t">&lt;/span&gt;</span>
      &#125;
    <span class="s">&#96;</span>,
  &#125;;
  http = <span class="f">inject</span>(HttpClient);
  user$ = <span class="k">this</span>.http.<span class="f">get</span>(<span class="s">"/api/me"</span>);
  name = <span class="f">computed</span>(() =&gt; <span class="c">/* a view model */</span>);
&#125;</pre>
</div>
<div style="display: flex; flex-direction: column; gap: 14px">
<div class="card" style="padding: 20px 24px"><h3 style="font-size: 18px">Setup is declarative</h3><p class="mut">State lives in field initialisers, so classes have no constructors and are safe to run again. That is what makes HMR honest.</p></div>
<div class="card" style="padding: 20px 24px"><h3 style="font-size: 18px">Observables bind directly</h3><p class="mut">A bare reference like <span class="mono">user$</span> shows the latest value. Promises work the same way.</p></div>
<div class="card" style="padding: 20px 24px"><h3 style="font-size: 18px">Simple template expressions</h3><p class="mut">Property reads, signal reads and comparisons. Derived values belong in <span class="mono">computed</span> signals, and quick fixes extract them for you.</p></div>
<div class="card" style="padding: 20px 24px"><h3 style="font-size: 18px">One renderer seam</h3><p class="mut">The DOM is one renderer. Tests use an in-memory one, with no jsdom.</p></div>
</div>
</div>
</div>
</section>
    `,
  };
}
