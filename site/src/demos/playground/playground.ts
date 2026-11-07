import { computed, effect, html, untracked, inject, RENDERER, signal, viewChild, ErrorBoundary } from "@gable/core";
import type { Renderer } from "@gable/core/renderer";
import { renderTemplate } from "./runtime-demo.js";
import { STARTER, SUGGESTIONS } from "./samples.js";

/**
 * Edit a template, see it render. The text is parsed at runtime by Gable's own template parser and rendered by the real
 * renderer into an isolated container: no build step, the same thing a bundler-less page would do.
 */
export class Playground {
  static meta = {
    selector: "site-playground",
    imports: [ErrorBoundary],
    encapsulation: "none" as const,
    styles: `
.pg{margin-top:56px;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:20px}
.pg-head{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.pg-head h3{font-size:22px}
.pg-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;align-items:center}
.pg-bar .lab{font-size:12px;letter-spacing:.06em;color:var(--mut);margin-right:4px}
.pg-chip{min-height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--card2);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer}
.pg-chip:hover{border-color:var(--acc)}
.pg-chip.err{border-style:dashed;border-color:var(--badline)}
.pg-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.pg-pane{min-width:0;display:flex;flex-direction:column;gap:6px}
.pg-pane>label,.pg-pane>.cap{font-size:12px;letter-spacing:.06em;color:var(--mut)}
.pg-src{width:100%;min-height:340px;resize:vertical;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--tx);font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;tab-size:2}
.pg-src[aria-invalid="true"]{border-color:var(--badline)}
.pg-out{min-height:340px;box-sizing:border-box;padding:14px 16px;border-radius:8px;border:1px solid var(--line);background:var(--bg);overflow:auto;font-size:15px;line-height:1.5}
.pg-out h3{font-size:20px;margin:8px 0}
.pg-out ul{padding-left:20px;margin:8px 0}
.pg-out p{margin:8px 0}
.pg-out input{min-height:36px;padding:0 10px;margin-left:8px;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--tx);font:inherit}
.pg-out button{min-height:36px;padding:0 12px;margin:4px 8px 4px 0;border-radius:6px;border:1px solid var(--line);background:var(--card2);color:var(--tx);font:inherit;font-size:14px;cursor:pointer}
.pg-status{margin-top:12px;font-size:14px;border-radius:8px;padding:10px 12px;border:1px solid var(--line);color:var(--mut)}
.pg-status.bad{background:var(--badbg);border-color:var(--badline);color:var(--tx)}
.pg-status.good{color:var(--okfg);background:var(--okbg);border-color:transparent}
.pg-status pre{margin:6px 0 0;white-space:pre-wrap;word-break:break-word;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.pg-note{font-size:13px;margin-top:10px}
.pg-fail{padding:14px;border:1px solid var(--badline);border-radius:8px;background:var(--badbg)}
@media (max-width:760px){.pg-cols{grid-template-columns:minmax(0,1fr)}.pg-src,.pg-out{min-height:220px}}
`,
    template: html`
<div class="pg" role="group" aria-labelledby="pg-title">
<div class="pg-head">
<h3 id="pg-title">Try it: edit a template</h3>
<span class="mut" style="font-size:13px">Parsed and rendered in your browser, right now. No build step.</span>
</div>
<div class="pg-bar">
<span class="lab mono">TRY</span>
@for (s of suggestions; track s.id) {
<button type="button" class="pg-chip" [class.err]="s.kind === 'error'" (click)="pick(s.id)">{{ s.label }}</button>
}
<button type="button" class="pg-chip" (click)="reset()">Reset</button>
</div>
<gable-error-boundary>
<div class="pg-cols">
<div class="pg-pane">
<label for="pg-source">TEMPLATE (a static html string)</label>
<textarea id="pg-source" class="pg-src" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="pg-status" [attr.aria-invalid]="invalid()" [value]="source()" (input)="edit($event.currentTarget.value)"></textarea>
</div>
<div class="pg-pane">
<div class="cap">RENDERED{{ stale() }}</div>
<div class="pg-out" #stage role="region" aria-label="Rendered template" aria-live="polite"></div>
</div>
</div>
<div class="pg-fail" slot="fallback" role="alert">The playground stopped. The rest of the page is unaffected. Reload to try again.</div>
</gable-error-boundary>
<div id="pg-status">
@if (error()) {
<div class="pg-status bad" role="alert"><b>Gable rejected this template.</b> The last good render is still shown.<pre>{{ error() }}</pre></div>
} @else {
<div class="pg-status good" role="status">Rendered by the real parser and renderer.</div>
}
</div>
<p class="pg-note mut">The template can read <span class="mono">name</span>, <span class="mono">loud</span>, <span class="mono">show</span>, <span class="mono">count</span>, <span class="mono">total</span> and <span class="mono">items</span> (signals, read as <span class="mono">name()</span>) and call <span class="mono">inc()</span>, <span class="mono">toggle()</span>, <span class="mono">add()</span> and <span class="mono">clear()</span>. The messages are the runtime's own. Checking templates against your classes is the language service's job, in your editor and in CI, not here.</p>
</div>
    `,
  };

  private readonly renderer = inject(RENDERER) as Renderer<unknown>;
  private readonly stage = viewChild<unknown>("stage");
  private current: (() => void) | null = null;
  private generation = 0;

  suggestions = SUGGESTIONS;
  source = signal(STARTER);
  /** The message Gable raised for the current text, or null. */
  error = signal<string | null>(null);
  invalid = computed(() => (this.error() ? "true" : "false"));
  stale = computed(() => (this.error() ? " (last good render)" : ""));

  private readonly render = effect(() => {
    const stage = this.stage();
    const source = this.source();
    if (stage === undefined) return;
    // Deferred and untracked: the demo component is built outside this effect, so its signals and scope are not ours.
    void Promise.resolve().then(() => untracked(() => this.mountSource(stage, source)));
  });

  edit(value: string): void {
    this.source.set(value);
  }
  pick(id: string): void {
    const s = SUGGESTIONS.find((x) => x.id === id);
    if (s) this.source.set(s.source);
  }
  reset(): void {
    this.source.set(STARTER);
  }

  private async mountSource(stage: unknown, source: string): Promise<void> {
    const run = ++this.generation;
    const host = this.renderer.createElement("div", null);
    const result = await renderTemplate(source, this.renderer, stage, host);
    if (run !== this.generation) {
      result.destroy?.();
      return;
    }
    if (result.error !== null) {
      this.error.set(result.error);
      return;
    }
    const previous = this.current;
    this.current = result.destroy;
    previous?.();
    this.error.set(null);
  }
}
