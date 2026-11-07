import { computed, effect, html, inject, signal, untracked, viewChild, ErrorBoundary, ErrorHandler } from "@gable/core";
import { provideRouter, Router, RouterOutlet, type NavigationEvent } from "@gable/core/router";
import { DemoLink as RouterLink, DemoLinkActive as RouterLinkActive } from "./links.js";
import { toSignal } from "@gable/core/rxjs";
import { scan } from "rxjs";
import { MemoryNav, memoryPlatform } from "./memory-nav.js";
import { MiniErrors, Session, routes } from "./mini-app.js";
import { demoStyles } from "./styles.js";

const describeEvent = (e: NavigationEvent): string => {
  if (e.type === "cancel") return `cancel ${e.url} (${e.reason})`;
  return `${e.type} ${e.url}`;
};

interface Line {
  id: number;
  text: string;
}

/**
 * A mini app with its own Router. Its Location and History are in-memory (see memory-nav.ts), so it never reads or writes
 * the page URL, and it is provided in this component's own injector, so the site's router is untouched. Everything in the
 * state panel is read from that real Router.
 */
export class RouterDemo {
  static meta = {
    selector: "site-router-demo",
    template: html`
<div class="rd" role="group" aria-label="Router demo: a mini app with its own router">
<gable-error-boundary>
<div class="rd-bar">
<button type="button" class="rd-btn" aria-label="Back" [disabled]="!canBack()" (click)="back()">← Back</button>
<button type="button" class="rd-btn" aria-label="Forward" [disabled]="!canForward()" (click)="forward()">Forward →</button>
<form class="rd-addr" (submit)="go($event)">
<input aria-label="Address bar. Type a path such as /users/2?tab=posts and press Enter." [value]="shown()" (input)="type($event)" spellcheck="false" autocomplete="off" autocapitalize="off">
<button type="submit" class="rd-btn">Go</button>
</form>
<button type="button" class="rd-btn" [attr.aria-pressed]="session.loggedIn()" (click)="session.toggle()">{{ session.label() }}</button>
</div>
<div class="rd-grid">
<div class="rd-app">
<div class="rd-head">mini app (its own router, not the page URL)</div>
<nav class="rd-nav" aria-label="Mini app">
<a routerLink="/home" routerLinkActive="on">Home</a>
<a routerLink="/users" routerLinkActive="on">Users</a>
<a routerLink="/admin" routerLinkActive="on">Admin (guarded)</a>
<a routerLink="/reports" routerLinkActive="on">Reports (lazy)</a>
</nav>
<div class="rd-view">
<router-outlet></router-outlet>
@if (router.navigating()) {<div class="rd-loading"><span>loading...</span></div>}
</div>
</div>
<div class="rd-state" role="region" aria-label="Router state">
<div class="rd-head">router state, read live from the Router</div>
<dl>
<dt>url()</dt><dd>{{ router.url() }}</dd>
<dt>params()</dt><dd>{{ params() }}</dd>
<dt>queryParams()</dt><dd>{{ query() }}</dd>
<dt>navigating()</dt><dd>{{ busy() }}</dd>
<dt>signed in</dt><dd>{{ session.loggedIn() }}</dd>
<dt>matched</dt>
<dd><ol>
@for (level of chain(); track level.id) {<li>{{ level.text }}</li>} @empty {<li class="rd-mut">none yet</li>}
</ol></dd>
<dt>history</dt>
<dd><ul aria-label="History stack, oldest first">
@for (entry of history(); track entry.i) {<li [class.on]="entry.current" [class.future]="entry.future">{{ entry.href }}</li>}
</ul></dd>
<dt>events</dt>
<dd><ul aria-label="Navigation events, newest first">
@for (line of log(); track line.id) {<li>{{ line.text }}</li>} @empty {<li class="rd-mut">none yet</li>}
</ul></dd>
@if (errors()) {<dt>errors</dt><dd class="rd-err">{{ errors() }}</dd>}
</dl>
</div>
</div>
<p class="rd-note" role="status">{{ last() }}</p>
<p class="rd-note">The router, route table, guard and lazy loading are the real <span class="mono">@gable/core/router</span>. The history stack is in memory, and the 900 ms delay on /reports is artificial so the load is visible.</p>
<div slot="fallback" class="rd-fallback" role="alert">
<p>The demo hit an error and stopped. The rest of the page is fine.</p>
<button type="button" class="rd-btn" (click)="reset()">Restart the demo</button>
</div>
</gable-error-boundary>
</div>
    `,
    imports: [ErrorBoundary, RouterLink, RouterLinkActive, RouterOutlet],
    providers: [...memoryPlatform, ...provideRouter(routes), Session, { provide: ErrorHandler, useClass: MiniErrors }],
    styles: demoStyles,
    encapsulation: "none" as const,
  };

  router = inject(Router);
  // Not read by the template: it has `subscribe`, which a template would take for a stream. The members below are the view of it.
  mem = inject(MemoryNav);
  canBack = this.mem.canBack;
  canForward = this.mem.canForward;
  session = inject(Session);
  failures = inject(ErrorHandler) as MiniErrors;
  boundary = viewChild(ErrorBoundary);

  /** What the visitor has typed but not submitted; null means show the router's url. */
  draft = signal<string | null>(null);
  shown = computed(() => this.draft() ?? this.router.url());
  last = signal("Ready.");

  params = computed(() => JSON.stringify(this.router.params()));
  query = computed(() => JSON.stringify(this.router.queryParams()));
  busy = computed(() => (this.router.navigating() ? "true" : "false"));
  errors = computed(() => this.failures.errors().join("; "));

  // The rendered levels: one per route that has a component, taken from the Router's own outlet tree.
  levels = [0, 1, 2].map((depth) => this.router.levelAt(depth));
  chain = computed(() =>
    this.levels.flatMap((level, id) => {
      const at = level();
      return at ? [{ id, text: `${id}: path "${at.route.path}" renders <${at.component.meta.selector}>` }] : [];
    }),
  );
  history = computed(() => {
    const at = this.mem.index();
    return this.mem.entries().map((href, i) => ({ i, href, current: i === at, future: i > at }));
  });

  // Every navigation event the Router emits, newest first.
  log = toSignal(
    this.router.events$.pipe(scan((all: readonly Line[], e) => [{ id: (all[0]?.id ?? 0) + 1, text: describeEvent(e) }, ...all].slice(0, 6), [] as readonly Line[])),
    { initialValue: [] as readonly Line[] },
  );

  // Once the router reaches a URL, the address bar follows it again.
  follow = effect(() => {
    this.router.url();
    untracked(() => this.draft.set(null));
  });
  // The mini router does not drive the page's live region, so say what happened here.
  announce = effect(() => {
    const latest = this.log()[0];
    if (latest && !latest.text.startsWith("start")) this.last.set(`Router: ${latest.text}.`);
  });

  back() {
    this.mem.back();
  }

  forward() {
    this.mem.forward();
  }

  type(event: { currentTarget: { value: string } }) {
    this.draft.set(event.currentTarget.value);
  }

  go(event: { preventDefault(): void }) {
    event.preventDefault();
    const value = (this.draft() ?? this.router.url()).trim() || "/";
    void this.router.navigate(value).then(() => this.draft.set(null));
  }

  reset() {
    this.failures.errors.set([]);
    this.boundary()?.reset();
  }
}
