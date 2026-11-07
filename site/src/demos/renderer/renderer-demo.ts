import { computed, createComponent, createInjector, effect, html, inject, RENDERER, signal, untracked, viewChild } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";
import { demoStyles } from "../signals/demo-style.js";

/** The component whose DOM writes are recorded. */
export class Subject {
  static meta = {
    selector: "renderer-subject",
    styles: `.box{padding:10px 12px;border:2px solid var(--line);border-radius:8px}.box.on{border-color:var(--acc)}p{margin:2px 0}`,
    template: html`
<div class="box" [class.on]="on()" [attr.data-count]="count()">
<p>Clicked {{ count() }} times</p>
<p>Highlight is {{ label() }}</p>
</div>
    `,
  };

  count = signal(0);
  on = signal(false);
  label = computed(() => (this.on() ? "on" : "off"));
}

/** Wraps a renderer so every write it receives is reported to `log`. Everything else passes straight through. */
export function recording<N>(base: Renderer<N>, log: (line: string) => void): Renderer<N> {
  const q = (v: unknown) => JSON.stringify(v);
  return {
    ...base,
    createElement: (tag, parent) => (log(`createElement <${tag}>`), base.createElement(tag, parent)),
    createText: (text) => (log(`createText ${q(text)}`), base.createText(text)),
    setProperty: (n, name, v) => (log(`setProperty ${name} = ${q(v)}`), base.setProperty(n, name, v)),
    setAttribute: (n, name, v) => (log(`setAttribute ${name} = ${q(v)}`), base.setAttribute(n, name, v)),
    setClass: (n, name, on) => (log(`setClass ${name} = ${on}`), base.setClass(n, name, on)),
    setStyle: (n, name, v) => (log(`setStyle ${name} = ${q(v)}`), base.setStyle(n, name, v)),
    setText: (n, text) => (log(`setText ${q(text)}`), base.setText(n, text)),
    insert: (parent, n, before) => (log("insert"), base.insert(parent, n, before)),
    remove: (n) => (log("remove"), base.remove(n)),
  };
}

/**
 * Mounts a small component through a thin wrapper around the page's real DOM renderer and lists every call the
 * renderer receives. Each signal change becomes the one precise write it needs; writing an equal value makes none.
 */
export class RendererDemo {
  static meta = {
    selector: "renderer-demo",
    styles: [
      demoStyles,
      `
.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
@media (max-width:560px){.cols{grid-template-columns:minmax(0,1fr)}}
h4{margin:0 0 6px;font:500 11px 'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;min-height:3.4em}
ol li{padding:5px 8px;border-radius:6px;background:var(--bg2);font:12.5px 'JetBrains Mono',monospace;word-break:break-word}
.stage{min-width:0}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>The DOM renderer at work</h3>
<p>The box on the left is rendered by the real DOM renderer. The list shows the calls it received for your last action.</p>
</div>
<div class="db">
<div class="row" role="group" aria-label="Change the component">
<button class="btn" type="button" (click)="click()">Count + 1</button>
<button class="btn" type="button" (click)="toggle()">Toggle highlight</button>
<button class="btn" type="button" (click)="same()">Write the same count</button>
</div>
<div class="cols">
<div><h4>Component</h4><div class="stage" #stage></div></div>
<div><h4>Renderer calls: {{ ops().length }}</h4>
<ol aria-live="polite">
@for (o of ops(); track o.id) {
<li>{{ o.text }}</li>
} @empty {
<li>None yet. Press a button.</li>
}
</ol></div>
</div>
</div>
</div>
    `,
  };

  ops = signal<Array<{ id: number; text: string }>>([]);

  private renderer = inject(RENDERER) as Renderer<unknown>;
  private stage = viewChild<unknown>("stage");
  private subject: Subject | null = null;
  private buffer: string[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private teardown: (() => void) | null = null;

  private readonly mounter = effect(() => {
    const stage = this.stage();
    if (stage === undefined) return;
    untracked(() => this.mount(stage));
  });
  private readonly cleanup = currentScope()?.onDispose(() => {
    this.teardown?.();
    if (this.timer !== null) clearTimeout(this.timer);
  });

  private record(line: string): void {
    this.buffer.push(line);
    this.timer ??= setTimeout(() => {
      this.timer = null;
      this.ops.set(this.buffer.map((text) => ({ id: ++this.seq, text })));
    }, 0);
  }

  private mount(stage: unknown): void {
    this.teardown?.();
    const renderer = recording(this.renderer, (line) => this.record(line));
    const injector = createInjector([{ provide: RENDERER, useValue: renderer }, ...(this.renderer.providers ?? [])]);
    const host = renderer.createElement("div", null);
    const ref = createComponent(Subject, { renderer, injector, host });
    this.renderer.insert(stage, host);
    this.subject = ref.instance;
    this.teardown = () => {
      ref.destroy();
      this.renderer.remove(host);
      this.subject = null;
      this.teardown = null;
    };
    this.buffer = []; // the first render is not an update
  }

  /** Starts a new recording, so the list shows only what the next change causes. */
  private act(change: (s: Subject) => void): void {
    if (!this.subject) return;
    this.buffer = [];
    this.ops.set([]);
    change(this.subject);
  }

  click(): void {
    this.act((s) => s.count.update((n) => n + 1));
  }
  toggle(): void {
    this.act((s) => s.on.update((v) => !v));
  }
  same(): void {
    this.act((s) => s.count.set(s.count()));
  }
}
