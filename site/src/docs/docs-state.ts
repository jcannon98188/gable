import { computed, inject, signal } from "@gable/core";
import { Router } from "@gable/core/router";
import { ApiData } from "./api-data.js";
import { pathOf } from "./base.js";
import { GUIDES } from "./content.js";
import type { TocItem } from "./markdown.js";
import { apiUrl, guideUrl, packageUrl } from "./urls.js";

export interface PageLink {
  title: string;
  url: string;
}

/** What the routed page tells the shell around it: the on-page contents, and (optionally) its own previous/next links. */
export class DocsPage {
  static scope = "root";

  toc = signal<TocItem[]>([]);
  /** A page that has its own neighbours (API symbols) sets them with the URL they belong to; others use the site order. */
  pager = signal<{ url: string; prev: PageLink | null; next: PageLink | null } | null>(null);
}

export interface NavItem {
  title: string;
  url: string;
  current: "page" | null;
}

export interface NavPackage {
  slug: string;
  name: string;
  url: string;
  apiUrl: string;
  current: "page" | null;
  apiCurrent: "page" | null;
  apiLabel: string;
}

const short = (name: string) => name.replace(/^@gable\//, "");

/** The sidebar and the previous/next order: the guides, then each package's overview and reference. */
export class DocsNav {
  static scope = "root";

  private router = inject(Router, { optional: true });
  private api = inject(ApiData);
  private page = inject(DocsPage);

  private load = this.api.loadIndex();

  /** The path of the current page, without query or hash. */
  path = computed(() => pathOf(this.router?.url() ?? "/"));

  private item = (title: string, url: string): NavItem => ({ title, url, current: this.path() === url ? "page" : null });

  start = computed(() => GUIDES.filter((g) => g.group === "Getting started").map((g) => this.item(g.title, guideUrl(g.slug))));
  guides = computed(() => GUIDES.filter((g) => g.group === "Guides").map((g) => this.item(g.title, guideUrl(g.slug))));

  packages = computed<NavPackage[]>(() =>
    (this.api.index()?.packages ?? []).map((p) => {
      const url = packageUrl(p.slug);
      const api = apiUrl(p.slug);
      const path = this.path();
      return { slug: p.slug, name: short(p.name), url, apiUrl: api, current: path === url ? "page" : null, apiLabel: `${short(p.name)} API reference`, apiCurrent: path === api || path.startsWith(api + "/") ? "page" : null };
    }),
  );

  /** Every page of the site order, for previous/next. */
  sequence = computed<PageLink[]>(() => [
    ...GUIDES.map((g) => ({ title: g.title, url: guideUrl(g.slug) })),
    ...(this.api.index()?.packages ?? []).flatMap((p) => [
      { title: `${short(p.name)} overview`, url: packageUrl(p.slug) },
      { title: `${short(p.name)} API reference`, url: apiUrl(p.slug) },
    ]),
  ]);

  private neighbours = computed(() => {
    const own = this.page.pager();
    if (own && sameUrl(own.url, this.path())) return own;
    const seq = this.sequence();
    const at = seq.findIndex((p) => p.url === this.path());
    return { url: this.path(), prev: at > 0 ? seq[at - 1]! : null, next: at >= 0 && at < seq.length - 1 ? seq[at + 1]! : null };
  });

  prev = computed(() => this.neighbours().prev);
  next = computed(() => this.neighbours().next);
}

/** Scrolls to the element a URL fragment names, once it exists. The browser has already tried before the page rendered. */
export function revealFragment(fragment: string | null | undefined): void {
  if (!fragment || typeof document === "undefined") return;
  const go = () => document.getElementById(fragment)?.scrollIntoView();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(go);
  else go();
}

function sameUrl(a: string, b: string): boolean {
  try {
    return decodeURIComponent(a) === decodeURIComponent(b);
  } catch {
    return a === b;
  }
}
