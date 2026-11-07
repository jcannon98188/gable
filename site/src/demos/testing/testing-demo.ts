import { computed, html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { demoStyles } from "../signals/demo-style.js";

/** The component under test: a button that counts clicks. */
export class Counter {
  static meta = {
    selector: "demo-counter",
    template: html`<button type="button" (click)="increment()">Count: {{ count() }}</button>`,
  };

  count = signal(0);

  increment() {
    this.count.update((n) => n + 1);
  }
}

/** The same component with a bug: each click adds 2. */
export class BrokenCounter extends Counter {
  static override meta = { ...Counter.meta, selector: "demo-broken-counter" };

  override increment() {
    this.count.update((n) => n + 2);
  }
}

/** Throws when the values differ, as any assertion library would. */
export function expectEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

type Subject = typeof Counter;

/** The tests. Each one mounts the component into the in-memory test renderer (no DOM involved), drives it and asserts. */
export const TESTS: ReadonlyArray<{ name: string; run: (C: Subject) => Promise<void> }> = [
  {
    name: "renders the initial count",
    async run(C) {
      const f = mount(C);
      try {
        expectEqual(f.text(), "Count: 0");
      } finally {
        f.destroy();
      }
    },
  },
  {
    name: "counts one click",
    async run(C) {
      const f = mount(C);
      try {
        f.dispatch(f.query("button")!, "click");
        await f.flush();
        expectEqual(f.text(), "Count: 1");
      } finally {
        f.destroy();
      }
    },
  },
  {
    name: "counts three clicks",
    async run(C) {
      const f = mount(C);
      try {
        const button = f.query("button")!;
        for (let i = 0; i < 3; i++) f.dispatch(button, "click");
        await f.flush();
        expectEqual(f.text(), "Count: 3");
      } finally {
        f.destroy();
      }
    },
  },
];

interface Result {
  name: string;
  ok: boolean;
  mark: string;
  message: string;
}

/**
 * Runs real `@gable/testing` tests in the page. `mount()` renders the component into the in-memory test renderer, so no
 * jsdom or browser is needed; `dispatch` fires the click and `flush` waits for the update. Tick the box to run the same
 * tests against the buggy component and watch them fail.
 */
export class TestingDemo {
  static meta = {
    selector: "testing-demo",
    styles: [
      demoStyles,
      `
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
li{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:baseline;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg2);font-size:14px}
li.fail{border-color:var(--badline)}
.mark{font:600 11px 'JetBrains Mono',monospace;letter-spacing:.06em;color:var(--ok)}
li.fail .mark{color:var(--tx)}
pre{grid-column:1 / -1;margin:0;white-space:pre-wrap;word-break:break-word;font:12.5px/1.5 'JetBrains Mono',monospace;color:var(--mut)}
pre.markup{padding:10px;border-radius:8px;background:var(--bg2);border:1px solid var(--line)}
label{display:inline-flex;align-items:center;gap:8px;font-size:14px;min-height:36px}
.status{margin:0;font-size:13px;padding:8px 10px;border-radius:8px;background:var(--bg2)}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>A component and its tests, running live</h3>
<p>The tests below mount a counter into the in-memory test renderer and click it.</p>
</div>
<div class="db">
<div class="row">
<label><input type="checkbox" [checked]="broken()" (change)="toggle()" /> Introduce a bug (each click adds 2)</label>
<button class="btn pri" type="button" (click)="run()">Run tests</button>
</div>
<ul aria-label="Test results">
@for (r of results(); track r.name) {
<li [class.fail]="!r.ok"><span class="mark">{{ r.mark }}</span><span>{{ r.name }}</span>@if (r.message) {<pre>{{ r.message }}</pre>}</li>
} @empty {
<li><span class="mark">...</span><span>Running</span></li>
}
</ul>
<p class="status" role="status">{{ summary() }}</p>
<div>
<p class="note">Output of <code>fixture.html()</code> after one click:</p>
<pre class="markup">{{ markup() }}</pre>
</div>
</div>
</div>
    `,
  };

  broken = signal(false);
  results = signal<Result[]>([]);
  markup = signal("");
  summary = computed(() => {
    const all = this.results();
    if (all.length === 0) return "";
    const failed = all.filter((r) => !r.ok).length;
    return failed === 0 ? `${all.length} passed` : `${failed} failed, ${all.length - failed} passed`;
  });

  private first = Promise.resolve().then(() => this.run());

  toggle(): void {
    this.broken.update((b) => !b);
    void this.run();
  }

  async run(): Promise<void> {
    const Subject = this.broken() ? BrokenCounter : Counter;
    const out: Result[] = [];
    for (const t of TESTS) {
      try {
        await t.run(Subject);
        out.push({ name: t.name, ok: true, mark: "PASS", message: "" });
      } catch (e) {
        out.push({ name: t.name, ok: false, mark: "FAIL", message: e instanceof Error ? e.message : String(e) });
      }
    }
    this.results.set(out);
    const f = mount(Subject);
    try {
      f.dispatch(f.query("button")!, "click");
      await f.flush();
      this.markup.set(f.html());
    } finally {
      f.destroy();
    }
  }
}
