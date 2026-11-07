import { html, ErrorBoundary } from "@gable/core";
import { SignalsDemo } from "./signals-demo.js";
import { RxjsDemo } from "./rxjs-demo.js";
import { ExpressionsDemo } from "./expressions-demo.js";

/** The three Framework demos. Each sits in its own error boundary, so one failing demo shows a note and nothing else. */
export class FrameworkDemos {
  static meta = {
    selector: "framework-demos",
    imports: [ErrorBoundary, SignalsDemo, RxjsDemo, ExpressionsDemo],
    styles: `
:host{display:block}
.g{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start}
.wide{grid-column:1 / -1}
.fb{margin:0;padding:16px;border:1px solid var(--badline);background:var(--badbg);border-radius:12px;font-size:14px;color:var(--tx)}
@media (max-width:900px){.g{grid-template-columns:minmax(0,1fr)}}
`,
    template: html`
<div class="g">
<gable-error-boundary>
<signals-demo></signals-demo>
<p slot="fallback" class="fb">The signals demo hit an error and was switched off. The rest of the page is unaffected.</p>
</gable-error-boundary>
<gable-error-boundary>
<rxjs-demo></rxjs-demo>
<p slot="fallback" class="fb">The RxJS demo hit an error and was switched off. The rest of the page is unaffected.</p>
</gable-error-boundary>
<gable-error-boundary class="wide">
<expressions-demo></expressions-demo>
<p slot="fallback" class="fb">The expressions demo hit an error and was switched off. The rest of the page is unaffected.</p>
</gable-error-boundary>
</div>
    `,
  };
}
