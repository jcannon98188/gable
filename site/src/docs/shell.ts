import { computed, effect, html, inject, signal } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { FocusManager } from "@gable/core/renderer";
import { RouterOutlet } from "@gable/core/router";
import { REPO } from "./base.js";
import { DocLink } from "./doc-link.js";
import { DocsSearch } from "./docs-search.js";
import { DocsNav, DocsPage } from "./docs-state.js";
import { ThemeStore } from "../theme.js";

interface KeyLike {
  key: string;
}

/**
 * The docs frame: skip link, header with search and theme, the sidebar (a drawer on narrow screens), the page in
 * `<main>` with previous/next links, and the on-page contents. The router moves focus to the page's `h1` after each
 * navigation; this shell handles the drawer's focus and the skip link.
 */
export class DocsShell {
  static meta = {
    selector: "docs-shell",
    imports: [RouterOutlet, DocLink, DocsSearch],
    template: html`
<div class="dx" (keydown)="onKey($event)">
<a class="skip" href="#docs-main" (click)="skip($event)">Skip to content</a>
<header class="dx-head">
<button type="button" class="dx-menu" aria-controls="docs-nav" [attr.aria-expanded]="menuOpen()" aria-label="Navigation menu" (click)="toggleMenu()"><svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
<a class="logo" docLink="/"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20L12 4l9 16"></path><path d="M8 20l4-7 4 7"></path></svg>Gable</a>
<a class="dx-tag" docLink="/docs">Docs</a>
<span class="dx-grow"></span>
<docs-search></docs-search>
<a class="dx-link" [attr.href]="repo">GitHub</a>
<button type="button" class="theme-btn" (click)="theme.toggle()" [attr.aria-label]="theme.label()" [attr.title]="theme.label()">
@if (theme.theme() === 'dark') {
<svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
} @else {
<svg class="svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"></path></svg>
}
</button>
</header>
<div class="dx-body">
<nav id="docs-nav" class="dx-side" aria-label="Documentation" [class.open]="menuOpen()">
<div class="sb-g"><h2 class="sb-t">Getting started</h2><ul>@for (i of nav.start(); track i.url) {<li><a [docLink]="i.url" [attr.aria-current]="i.current">{{ i.title }}</a></li>}</ul></div>
<div class="sb-g"><h2 class="sb-t">Guides</h2><ul>@for (i of nav.guides(); track i.url) {<li><a [docLink]="i.url" [attr.aria-current]="i.current">{{ i.title }}</a></li>}</ul></div>
@if (nav.packages().length) {
<div class="sb-g"><h2 class="sb-t">Packages</h2><ul>@for (p of nav.packages(); track p.slug) {<li class="sb-pkg"><a [docLink]="p.url" [attr.aria-current]="p.current">{{ p.name }}</a>@if (p.apiUrl) {<a class="sb-api" [docLink]="p.apiUrl" [attr.aria-current]="p.apiCurrent" [attr.aria-label]="p.apiLabel">API</a>}</li>}</ul></div>
}
</nav>
@if (menuOpen()) {
<button type="button" class="dx-scrim" tabindex="-1" aria-label="Close navigation" (click)="closeMenu()"></button>
}
<main id="docs-main" class="dx-main" tabindex="-1" [attr.inert]="inert()">
<router-outlet></router-outlet>
@if (hasPager()) {
<nav class="pager" aria-label="Previous and next page">
@if (prevUrl()) {
<a class="prev" [docLink]="prevUrl()"><small>Previous</small><b>{{ prevTitle() }}</b></a>
}
@if (nextUrl()) {
<a class="next" [docLink]="nextUrl()"><small>Next</small><b>{{ nextTitle() }}</b></a>
}
</nav>
}
</main>
<aside class="dx-toc" aria-label="On this page" [attr.inert]="inert()">
@if (toc().length) {
<h2 class="sb-t">On this page</h2>
<ul>@for (t of toc(); track t.id) {<li [class.sub]="t.sub"><a [attr.href]="t.href">{{ t.text }}</a></li>}</ul>
}
</aside>
</div>
</div>
    `,
  };

  theme = inject(ThemeStore);
  nav = inject(DocsNav);
  private page = inject(DocsPage);
  private focus = inject(FocusManager, { optional: true });
  repo = REPO;

  menuOpen = signal(false);
  inert = computed(() => (this.menuOpen() ? "" : null));

  toc = computed(() => this.page.toc().map((t) => ({ id: t.id, text: t.text, href: "#" + t.id, sub: t.level === 3 })));
  prevUrl = computed(() => this.nav.prev()?.url ?? "");
  prevTitle = computed(() => this.nav.prev()?.title ?? "");
  nextUrl = computed(() => this.nav.next()?.url ?? "");
  nextTitle = computed(() => this.nav.next()?.title ?? "");
  hasPager = computed(() => !!this.prevUrl() || !!this.nextUrl());

  private opened = false;
  /** Closes the drawer on navigation; focus goes where the router puts it. */
  private onRoute = effect(() => {
    this.nav.path();
    this.menuOpen.set(false);
  });
  /** Opening the drawer moves focus into it; closing it (not the first run) returns focus to the button. */
  private drawerFocus = effect(() => {
    const open = this.menuOpen();
    if (open) {
      this.opened = true;
      this.focus?.focus("#docs-nav a");
    } else if (this.opened) {
      this.opened = false;
      this.focus?.focus(".dx-menu");
    }
  });
  /** The drawer only exists on narrow screens: widening the window closes it. */
  private widen = (() => {
    if (typeof matchMedia !== "function") return null;
    const query = matchMedia("(min-width: 901px)");
    const onChange = () => query.matches && this.menuOpen.set(false);
    query.addEventListener?.("change", onChange);
    return currentScope()?.onDispose(() => query.removeEventListener?.("change", onChange));
  })();

  toggleMenu(): void {
    this.menuOpen.set(!this.menuOpen());
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  onKey(event: KeyLike): void {
    if (event.key === "Escape" && this.menuOpen()) this.menuOpen.set(false);
  }

  /** The skip link moves focus (a same-page anchor only scrolls in some browsers). */
  skip(event?: { preventDefault?(): void }): void {
    event?.preventDefault?.();
    this.focus?.focus("#docs-main");
  }
}
