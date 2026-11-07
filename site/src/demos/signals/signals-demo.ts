import { html, signal, computed, effect, untracked, injectHost } from "@gable/core";
import { demoStyles } from "./demo-style.js";

type Key = "a" | "b" | "sum" | "product" | "parity";
const KEYS: readonly Key[] = ["a", "b", "sum", "product", "parity"];

/**
 * Two writable signals and a computed chain. The "ran" column counts real runs of each computed function; the
 * "painted" column and the highlight come from a MutationObserver on this demo's DOM, so a cell lights up only when the
 * renderer actually wrote its text. Nothing here is scripted: change `a` by 2 and `parity` re-runs but does not repaint.
 */
export class SignalsDemo {
  static meta = {
    selector: "signals-demo",
    styles: [
      demoStyles,
      `
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}
thead th{font:500 11px 'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
tbody th{font-weight:600}
td.n{font-variant-numeric:tabular-nums;color:var(--mut)}
.val{display:inline-block;min-width:3.2em;padding:2px 8px;border-radius:6px;font:600 15px 'JetBrains Mono',monospace;background:var(--card2);border:1px solid transparent}
.val.flash{animation:flash .8s ease-out;background:var(--hl);border-color:var(--acc)}
@keyframes flash{from{background:var(--acc);color:var(--accfg)}to{background:var(--hl);color:var(--tx)}}
@media (prefers-reduced-motion:reduce){.val.flash{animation:none}}
.status{margin:0;min-height:2.6em;font-size:13px;color:var(--tx);padding:8px 10px;border-radius:8px;background:var(--bg2)}
@media (max-width:520px){th,td{padding:6px 4px}.hide-s{display:none}}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>Signals and computed, live</h3>
<p>Press a button. Only the text that actually changed is written to the page, and it lights up.</p>
</div>
<div class="db">
<div class="row" role="group" aria-label="Change the signals">
<button class="btn" type="button" (click)="bump('a', 1)">a + 1</button>
<button class="btn" type="button" (click)="bump('a', 2)">a + 2</button>
<button class="btn" type="button" (click)="bump('b', 1)">b + 1</button>
<button class="btn" type="button" (click)="reset()">Reset</button>
</div>
<div class="tbl">
<table>
<thead><tr><th scope="col">Name</th><th scope="col" class="hide-s">Defined as</th><th scope="col">Value</th><th scope="col">Ran</th><th scope="col">Painted</th></tr></thead>
<tbody>
<tr><th scope="row">a</th><td class="hide-s"><code>signal(2)</code></td><td><span class="val" data-track="a">{{ a() }}</span></td><td class="n">n/a</td><td class="n">{{ paints().a }}x</td></tr>
<tr><th scope="row">b</th><td class="hide-s"><code>signal(3)</code></td><td><span class="val" data-track="b">{{ b() }}</span></td><td class="n">n/a</td><td class="n">{{ paints().b }}x</td></tr>
<tr><th scope="row">sum</th><td class="hide-s"><code>a() + b()</code></td><td><span class="val" data-track="sum">{{ sum() }}</span></td><td class="n">{{ runs().sum }}x</td><td class="n">{{ paints().sum }}x</td></tr>
<tr><th scope="row">product</th><td class="hide-s"><code>a() * b()</code></td><td><span class="val" data-track="product">{{ product() }}</span></td><td class="n">{{ runs().product }}x</td><td class="n">{{ paints().product }}x</td></tr>
<tr><th scope="row">parity</th><td class="hide-s"><code>sum() is even?</code></td><td><span class="val" data-track="parity">{{ parity() }}</span></td><td class="n">{{ runs().parity }}x</td><td class="n">{{ paints().parity }}x</td></tr>
</tbody>
</table>
</div>
<p class="status" aria-live="polite">{{ last() }}</p>
<p class="note"><b>Ran</b> counts executions of the computed function. <b>Painted</b> counts DOM text writes seen by a MutationObserver. Try <b>a + 2</b>: <code>parity</code> re-runs, finds the same answer and writes nothing.</p>
</div>
</div>
    `,
  };

  a = signal(2);
  b = signal(3);

  private calls = { sum: 0, product: 0, parity: 0 };
  sum = computed(() => {
    this.calls.sum++;
    return this.a() + this.b();
  });
  product = computed(() => {
    this.calls.product++;
    return this.a() * this.b();
  });
  parity = computed(() => {
    this.calls.parity++;
    return this.sum() % 2 === 0 ? "even" : "odd";
  });

  /** Run counts, mirrored into a signal after each flush so the table can show them. */
  runs = signal({ sum: 0, product: 0, parity: 0 });
  /** DOM text writes per tracked cell, from the observer. */
  paints = signal<Record<Key, number>>({ a: 0, b: 0, sum: 0, product: 0, parity: 0 });
  last = signal("Nothing has changed yet.");

  private mirror = effect(() => {
    this.sum();
    this.product();
    this.parity();
    untracked(() => this.runs.set({ ...this.calls }));
  });

  private host = injectHost<unknown>().host;
  private started = setTimeout(() => this.observe(), 0);

  bump(which: string, by: number) {
    const target = which === "a" ? this.a : this.b;
    target.update((n) => n + by);
  }

  reset() {
    this.a.set(2);
    this.b.set(3);
  }

  /** Watches this demo's DOM. Runs only in a browser; the in-memory test renderer has no MutationObserver. */
  private observe() {
    const host = this.host;
    if (typeof MutationObserver === "undefined" || !(host instanceof HTMLElement)) return;
    new MutationObserver((records) => {
      const hit = new Set<HTMLElement>();
      for (const r of records) {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        const cell = el?.closest<HTMLElement>("[data-track]");
        if (cell && host.contains(cell)) hit.add(cell);
      }
      if (hit.size === 0) return;
      const names = [...hit].map((c) => c.dataset.track as Key);
      this.paints.update((p) => {
        const next = { ...p };
        for (const k of names) if (KEYS.includes(k)) next[k]++;
        return next;
      });
      const total = host.querySelectorAll("[data-track]").length;
      this.last.set(`Re-rendered ${names.length} of ${total} text nodes: ${KEYS.filter((k) => names.includes(k)).join(", ")}.`);
      for (const cell of hit) {
        cell.classList.remove("flash");
        void cell.offsetWidth;
        cell.classList.add("flash");
        setTimeout(() => cell.classList.remove("flash"), 900);
      }
    }).observe(host, { subtree: true, characterData: true, childList: true });
  }
}
