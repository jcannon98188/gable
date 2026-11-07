import { html } from "@gable/core";

export class Compiler {
  static meta = {
    selector: "site-compiler",
    template: html`
<section class="sec s2" id="compiler">
<div class="in">
<div class="eyebrow">No compiler</div>
<h2 class="h2">The fastest build step is the one that doesn't exist.</h2>
<p class="lead mut">A framework compiler is a tool that must transform your templates before anything runs. Gable has none as a baseline. Your bundler and dev server stay general-purpose, and they never need to know what a Gable template is.</p>
<div style="display: flex; flex-direction: column; gap: 28px; margin-top: 56px">
<div>
<div class="mono mut" style="font-size: 12px; margin-bottom: 10px; letter-spacing: .06em">A FRAMEWORK WITH A TEMPLATE COMPILER</div>
<div class="lane"><div class="step">Your source<small>components and templates</small></div><span class="arr">→</span><div class="step bad">Framework compiler<small>required before anything runs</small></div><span class="arr">→</span><div class="step">Bundle<small>generated code</small></div><span class="arr">→</span><div class="step">Browser</div></div>
</div>
<div>
<div class="mono" style="font-size: 12px; margin-bottom: 10px; letter-spacing: .06em; color: var(--ok)">GABLE</div>
<div class="lane"><div class="step">Your source<small>html tagged template literals</small></div><span class="arr">→</span><div class="step good">TypeScript transpile<small>types stripped. Any tool will do</small></div><span class="arr">→</span><div class="step good">Browser<small>templates parsed at runtime</small></div></div>
</div>
</div>
<div class="grid3">
<div class="card"><h3>What you read is what runs</h3><p class="mut">The code in your editor and the code in the debugger are the same code. There is no generated layer between them.</p></div>
<div class="card"><h3>Type-checking is tooling</h3><p class="mut">The template language service checks templates against your component classes in the editor and in CI. It never ships and never runs your app.</p></div>
<div class="card"><h3>Swap the toolchain freely</h3><p class="mut">Vite is the default. Anything that serves TypeScript works, because nothing downstream is Gable-specific.</p></div>
</div>
</div>
</section>
    `,
  };
}
