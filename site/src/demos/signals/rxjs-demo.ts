import { html, inject, signal, computed } from "@gable/core";
import { Observable, Subject, debounceTime, distinctUntilChanged, map, startWith, switchMap, timer } from "rxjs";
import { demoStyles } from "./demo-style.js";

/**
 * Counts subscriptions to the streams it wraps. `tracked` returns an Observable that records every subscribe and every
 * teardown, so the numbers shown come from RxJS itself running, not from a script. Signal writes are deferred a
 * microtask because a subscription can start in the middle of rendering.
 */
export class StreamHub {
  static scope = "root";

  active = signal(0);
  cancelled = signal(0);
  log = signal<{ id: number; text: string }[]>([]);
  private seq = 0;

  tracked<T>(name: string, source: Observable<T>): Observable<T> {
    return new Observable<T>((subscriber) => {
      this.record(1, `subscribed to ${name}`);
      const inner = source.subscribe(subscriber);
      return () => {
        inner.unsubscribe();
        this.record(-1, `unsubscribed from ${name}`);
      };
    });
  }

  countCancelled() {
    queueMicrotask(() => this.cancelled.update((n) => n + 1));
  }

  private record(delta: number, text: string) {
    const id = ++this.seq;
    queueMicrotask(() => {
      this.active.update((n) => n + delta);
      this.log.update((l) => [{ id, text: `#${id} ${text}` }, ...l].slice(0, 5));
    });
  }
}

const FRUIT = ["apple", "apricot", "banana", "blueberry", "cherry", "grape", "grapefruit", "kiwi", "lemon", "mango", "orange", "papaya", "peach", "pear", "plum"];

/** A fake network call: answers after 400 ms, and reports when switchMap cancels it before it answered. */
function fakeSearch(hub: StreamHub, query: string): Observable<string> {
  return new Observable<string>((subscriber) => {
    let answered = false;
    const id = setTimeout(() => {
      answered = true;
      const hits = query === "" ? [] : FRUIT.filter((f) => f.includes(query.toLowerCase()));
      subscriber.next(query === "" ? "Type to search fruit." : hits.length ? `${hits.length === 1 ? "1 match" : `${hits.length} matches`}: ${hits.join(", ")}` : `No fruit matches "${query}".`);
      subscriber.complete();
    }, 400);
    return () => {
      clearTimeout(id);
      if (!answered) hub.countCancelled();
    };
  });
}

/** The component that owns the streams. It binds them bare in its template, so the template owns the subscriptions. */
export class TickerView {
  static meta = {
    selector: "ticker-view",
    styles: [
      demoStyles,
      `
.line{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline;margin:0}
.k{font-size:12px;color:var(--mut);min-width:5.5em}
output{font:600 14px 'JetBrains Mono',monospace;color:var(--tx);overflow-wrap:anywhere}
.expr{box-sizing:border-box;width:100%;min-height:38px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font:14px Inter,system-ui,sans-serif}
label{font-size:13px;color:var(--mut)}
.box{display:flex;flex-direction:column;gap:8px}
`,
    ],
    template: html`
<div class="box">
<p class="line"><span class="k">ticker$</span><output>{{ tick$ }}</output></p>
<label for="q">Search (debounced 250 ms, then switchMap to a 400 ms fake request)</label>
<input id="q" class="expr" type="search" placeholder="try: ap, gr, an" autocomplete="off" (input)="type($event)">
<p class="line"><span class="k">results$</span><output>{{ results$ }}</output></p>
</div>
    `,
  };

  hub = inject(StreamHub);
  query$ = new Subject<string>();
  tick$ = this.hub.tracked("ticker$", timer(0, 1000).pipe(map((n) => `tick ${n}`)));
  results$ = this.hub.tracked(
    "results$",
    this.query$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((q) => fakeSearch(this.hub, q)),
      startWith("Type to search fruit."),
    ),
  );

  type(event: Event) {
    this.query$.next((event.target as HTMLInputElement).value);
  }
}

export class RxjsDemo {
  static meta = {
    selector: "rxjs-demo",
    imports: [TickerView],
    styles: [
      demoStyles,
      `
.stat{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline;padding:10px 12px;border-radius:8px;background:var(--bg2);font-size:14px}
.stat b{font:700 18px 'JetBrains Mono',monospace;color:var(--acc)}
ul{margin:0;padding:0;list-style:none;font:12.5px 'JetBrains Mono',monospace;color:var(--mut);display:flex;flex-direction:column;gap:2px;min-height:5.2em}
.off{margin:0;font-size:14px;color:var(--mut);padding:12px;border:1px dashed var(--line);border-radius:8px}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>Observables bind directly</h3>
<p>The template reads <code>tick$</code> and <code>results$</code> as plain references. No async pipe, no manual subscribe.</p>
</div>
<div class="db">
@if (show()) {
<ticker-view></ticker-view>
} @else {
<p class="off">ticker-view is removed from the page.</p>
}
<div class="row">
<button class="btn pri" type="button" [attr.aria-pressed]="show()" (click)="toggle()">{{ label() }}</button>
</div>
<div class="stat" aria-live="polite"><span>Active subscriptions <b>{{ hub.active() }}</b></span><span>Requests cancelled by switchMap <b>{{ hub.cancelled() }}</b></span></div>
<ul aria-label="Subscription log">
@for (line of hub.log(); track line.id) {
<li>{{ line.text }}</li>
}
</ul>
<p class="note">Remove the component: Gable disposes its scope, which unsubscribes both streams, and the count drops to 0. Show it again and they resubscribe.</p>
</div>
</div>
    `,
  };

  hub = inject(StreamHub);
  show = signal(true);
  label = computed(() => (this.show() ? "Remove ticker-view" : "Show ticker-view"));

  toggle() {
    this.show.update((v) => !v);
  }
}
