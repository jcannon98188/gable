import { computed, html, signal } from "@gable/core";
import { formatTemplateLiterals } from "@gable/template-format";
import { demoStyles } from "../signals/demo-style.js";

/** A component with a badly laid out template: the sample the demo starts with. */
export const SAMPLE = [
  "export class Card {",
  "  static meta = {",
  '    selector: "app-card",',
  "    template: html`",
  '<section class="card"><h2>{{ title() }}</h2>',
  "      <p>Hello <b>{{ name() }}</b>, you have {{ count() }} new messages in your inbox today.</p>",
  '  @if (count() > 0) { <button type="button" class="primary" aria-label="Open the inbox" (click)="open()">Open</button> } @else {<p>All caught up</p>}',
  "</section>",
  "    `,",
  "  };",
  "}",
].join("\n");

/**
 * The real `formatTemplateLiterals` from `@gable/template-format`, the function behind the `gable-format` CLI and the
 * Prettier plugin. It rewrites only the `html` template literals in the source; everything else is left byte for byte.
 */
export class FormatDemo {
  static meta = {
    selector: "format-demo",
    styles: [
      demoStyles,
      `
label{font-size:13px;color:var(--mut)}
.src{box-sizing:border-box;width:100%;min-height:150px;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font:12.5px/1.5 'JetBrains Mono',ui-monospace,monospace;resize:vertical}
.src:focus-visible,.num:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.num{width:72px;min-height:36px;padding:0 8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font:14px 'JetBrains Mono',ui-monospace,monospace}
.res{margin:0;padding:12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);overflow-x:auto;font:12.5px/1.5 'JetBrains Mono',ui-monospace,monospace;white-space:pre}
.h{font:500 11px 'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin:0}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>Format a template</h3>
<p>Edit the TypeScript below. Only the html template literal is rewritten.</p>
</div>
<div class="db">
<div>
<label for="fmt-src">Source</label>
<textarea id="fmt-src" class="src" spellcheck="false" [value]="source()" (input)="edit($event)"></textarea>
</div>
<div class="row">
<label for="fmt-width">Print width</label>
<input id="fmt-width" class="num" type="number" min="20" max="200" [value]="width()" (input)="setWidth($event)">
<label for="fmt-indent">Indent</label>
<input id="fmt-indent" class="num" type="number" min="1" max="8" [value]="indent()" (input)="setIndent($event)">
<button class="btn" type="button" [attr.aria-pressed]="tabs()" (click)="toggleTabs()">{{ tabsLabel() }}</button>
</div>
<p class="h">Formatted</p>
<pre class="res" aria-live="polite">{{ formatted() }}</pre>
<p class="note">{{ status() }}</p>
</div>
</div>
    `,
  };

  source = signal(SAMPLE);
  width = signal(80);
  indent = signal(2);
  tabs = signal(false);

  formatted = computed(() => {
    try {
      return formatTemplateLiterals(this.source(), { printWidth: this.width(), indentSize: this.indent(), useTabs: this.tabs() });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  tabsLabel = computed(() => (this.tabs() ? "Use tabs: on" : "Use tabs: off"));
  status = computed(() => (this.formatted() === this.source() ? "Already formatted: nothing to change." : "gable-format would rewrite this file."));

  edit(event: Event) {
    this.source.set((event.target as HTMLTextAreaElement).value);
  }
  setWidth(event: Event) {
    const n = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(n) && n >= 1) this.width.set(n);
  }
  setIndent(event: Event) {
    const n = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(n) && n >= 1) this.indent.set(n);
  }
  toggleTabs() {
    this.tabs.update((t) => !t);
  }
}
