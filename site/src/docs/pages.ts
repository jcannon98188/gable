import { computed, effect, html, inject, input, signal } from "@gable/core";
import { Title } from "@gable/core/renderer";
import { Router } from "@gable/core/router";
import { ApiData } from "./api-data.js";
import type { ApiIndexEntry, ApiPackage, ApiSymbol } from "./api-types.js";
import { SymbolView, symbolToc } from "./api-view.js";
import { PACKAGE_GUIDES, GUIDES, guideBySlug, loadGuide } from "./content.js";
import { DocLink } from "./doc-link.js";
import { DocInline } from "./doc-inline.js";
import { DocMarkdown } from "./doc-markdown.js";
import { DocsPage, revealFragment, type PageLink } from "./docs-state.js";
import { parseInline, slugify, type Inline, type MarkdownDoc, type TocItem } from "./markdown.js";
import { apiUrl, guideUrl, packageUrl, symbolUrl } from "./urls.js";

const SUFFIX = " | Gable docs";

type State = "loading" | "ready" | "missing";

/** The docs landing page. */
export class DocsHome {
  static meta = {
    selector: "docs-home",
    imports: [DocLink],
    template: html`
<article class="md">
<h1 class="md-h">Gable documentation</h1>
<p class="lead">Guides for the framework and its tools, and a reference for every package, generated from the source.</p>
<h2 class="md-h" id="guides">Guides</h2>
<ul class="cards">@for (g of guides; track g.slug) {<li><a [docLink]="g.url"><b>{{ g.title }}</b><span>{{ g.summary }}</span></a></li>}</ul>
<h2 class="md-h" id="packages">Packages</h2>
@if (packages().length) {
<ul class="cards">@for (p of packages(); track p.slug) {<li><a [docLink]="p.url"><b>{{ p.name }}</b><span>{{ p.description }}</span></a></li>}</ul>
} @else {
<p class="mut">The package reference is generated from the source with <code>npm run api -w site</code>.</p>
}
</article>
    `,
  };

  private api = inject(ApiData);
  private page = inject(DocsPage);
  private title = inject(Title, { optional: true });

  guides = GUIDES.map((g) => ({ slug: g.slug, title: g.title, summary: g.summary, url: guideUrl(g.slug) }));
  packages = computed(() => (this.api.index()?.packages ?? []).map((p) => ({ slug: p.slug, name: p.name, description: p.description, url: packageUrl(p.slug) })));

  private init = effect(() => {
    this.page.toc.set([
      { id: "guides", text: "Guides", level: 2 },
      { id: "packages", text: "Packages", level: 2 },
    ]);
    this.title?.set("Documentation" + SUFFIX);
  });
}

/** A markdown guide from the repository's docs/ folder. */
export class GuidePage {
  static meta = {
    selector: "docs-guide",
    imports: [DocMarkdown],
    template: html`
@if (state() === 'ready') {
<article class="md"><doc-markdown [doc]="doc()"></doc-markdown></article>
} @else if (state() === 'missing') {
<article class="md"><h1 class="md-h">Guide not found</h1><p>There is no guide with this name. Pick one from the menu.</p></article>
} @else {
<p class="mut" role="status">Loading</p>
}
    `,
  };

  slug = input<string>("");

  private page = inject(DocsPage);
  private router = inject(Router, { optional: true });
  private title = inject(Title, { optional: true });

  state = signal<State>("loading");
  doc = signal<MarkdownDoc | null>(null);

  private load = effect(() => {
    const slug = this.slug();
    this.state.set("loading");
    this.page.toc.set([]);
    void loadGuide(slug).then((doc) => {
      if (this.slug() !== slug) return;
      this.doc.set(doc);
      this.page.toc.set(doc?.toc ?? []);
      this.state.set(doc ? "ready" : "missing");
      this.title?.set(`${guideBySlug(slug)?.title ?? "Not found"}${SUFFIX}`);
      revealFragment(this.router?.fragment());
    });
  });
}

/** A package's overview: what it is, its entry points and the guides that cover it. */
export class PackagePage {
  static meta = {
    selector: "docs-package",
    imports: [DocLink],
    template: html`
@if (state() === 'ready') {
<article class="md">
<h1 class="md-h">{{ name() }}</h1>
<p class="lead">{{ description() }}</p>
<p><a class="btn btn-a" [docLink]="reference()">API reference</a></p>
<h2 class="md-h" id="entry-points">Entry points</h2>
<ul>@for (e of entryPoints(); track e) {<li><code>{{ e }}</code></li>}</ul>
<p class="mut">{{ counts() }}</p>
@if (guides().length) {
<h2 class="md-h" id="guides">Guides</h2>
<ul>@for (g of guides(); track g.url) {<li><a [docLink]="g.url">{{ g.title }}</a></li>}</ul>
}
</article>
} @else if (state() === 'missing') {
<article class="md"><h1 class="md-h">Package not found</h1><p>No package has this name. Pick one from the menu.</p></article>
} @else {
<p class="mut" role="status">Loading</p>
}
    `,
  };

  pkg = input<string>("");

  private api = inject(ApiData);
  private page = inject(DocsPage);
  private title = inject(Title, { optional: true });

  state = signal<State>("loading");
  private entry = signal<ApiIndexEntry | null>(null);
  name = computed(() => this.entry()?.name ?? "");
  description = computed(() => this.entry()?.description ?? "");
  entryPoints = computed(() => this.entry()?.entryPoints ?? []);
  reference = computed(() => apiUrl(this.pkg()));
  counts = computed(() => {
    const e = this.entry();
    return e ? `${e.symbolCount} symbols, ${e.symbolCount - e.undocumentedCount} documented. Version ${e.version}.` : "";
  });
  guides = computed<PageLink[]>(() =>
    (PACKAGE_GUIDES[this.pkg()] ?? []).flatMap((slug) => {
      const g = guideBySlug(slug);
      return g ? [{ title: g.title, url: guideUrl(slug) }] : [];
    }),
  );

  private load = effect(() => {
    const slug = this.pkg();
    this.state.set("loading");
    this.page.toc.set([]);
    void this.api.loadIndex().then((index) => {
      if (this.pkg() !== slug) return;
      const entry = index?.packages.find((p) => p.slug === slug) ?? null;
      this.entry.set(entry);
      this.state.set(entry ? "ready" : "missing");
      const toc: TocItem[] = entry ? [{ id: "entry-points", text: "Entry points", level: 2 }] : [];
      if (entry && this.guides().length) toc.push({ id: "guides", text: "Guides", level: 2 });
      this.page.toc.set(toc);
      this.title?.set(`${entry?.name ?? "Not found"}${SUFFIX}`);
    });
  });
}

interface SymbolRow {
  key: number;
  name: string;
  kind: string;
  url: string;
  summary: Inline[];
  deprecated: boolean;
}
interface EntryGroup {
  key: number;
  id: string;
  path: string;
  symbols: SymbolRow[];
}

/** A package's reference index: every entry point with its symbols and one-line summaries. */
export class ApiIndexPage {
  static meta = {
    selector: "docs-api-index",
    imports: [DocLink, DocInline],
    template: html`
@if (state() === 'ready') {
<article class="md">
<h1 class="md-h">{{ heading() }}</h1>
@for (g of groups(); track g.key) {
<h2 class="md-h" [attr.id]="g.id"><code>{{ g.path }}</code></h2>
<ul class="symbols">@for (s of g.symbols; track s.key) {<li><a [docLink]="s.url"><code>{{ s.name }}</code></a><span class="api-kind">{{ s.kind }}</span>@if (s.deprecated) {<span class="api-kind">deprecated</span>}<span class="sum"><doc-inline [runs]="s.summary"></doc-inline></span></li>}</ul>
}
</article>
} @else if (state() === 'missing') {
<article class="md"><h1 class="md-h">Reference not found</h1><p>The API reference for this package is not available. It is generated with <code>npm run api -w site</code>.</p></article>
} @else {
<p class="mut" role="status">Loading</p>
}
    `,
  };

  pkg = input<string>("");

  private api = inject(ApiData);
  private page = inject(DocsPage);
  private title = inject(Title, { optional: true });

  state = signal<State>("loading");
  data = signal<ApiPackage | null>(null);
  heading = computed(() => `${this.data()?.name ?? ""} API reference`);
  groups = computed<EntryGroup[]>(() =>
    (this.data()?.entryPoints ?? []).map((ep, key) => ({
      key,
      id: slugify(ep.path),
      path: ep.path,
      symbols: ep.symbols.map((s, k) => ({
        key: k,
        name: s.name,
        kind: s.kind,
        url: symbolUrl(this.pkg(), s),
        summary: parseInline(firstSentence(s.summary)),
        deprecated: !!s.deprecated,
      })),
    })),
  );

  private load = effect(() => {
    const slug = this.pkg();
    this.state.set("loading");
    this.page.toc.set([]);
    void this.api.loadPackage(slug).then((pkg) => {
      if (this.pkg() !== slug) return;
      this.data.set(pkg);
      this.state.set(pkg ? "ready" : "missing");
      this.page.toc.set((pkg?.entryPoints ?? []).map((ep) => ({ id: slugify(ep.path), text: ep.path, level: 2 as const })));
      this.title?.set(`${pkg?.name ?? "Not found"} API${SUFFIX}`);
    });
  });
}

/** The first sentence of a summary, for lists. */
function firstSentence(text: string | undefined): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(flat);
  return m ? m[1]! : flat;
}

/** One symbol's reference page. The symbol segment is the extractor's id (URL-encoded); a plain name works too. */
export class ApiSymbolPage {
  static meta = {
    selector: "docs-api-symbol",
    imports: [SymbolView, DocLink],
    template: html`
@if (state() === 'ready') {
<nav class="crumbs" aria-label="Breadcrumb"><a [docLink]="indexUrl()">{{ packageName() }}</a></nav>
<docs-symbol [symbol]="symbol()"></docs-symbol>
} @else if (state() === 'missing') {
<article class="md"><h1 class="md-h">Symbol not found</h1><p>This package has no symbol with that name. See the <a [docLink]="indexUrl()">reference index</a>.</p></article>
} @else {
<p class="mut" role="status">Loading</p>
}
    `,
  };

  pkg = input<string>("");
  sym = input<string>("");

  private api = inject(ApiData);
  private page = inject(DocsPage);
  private router = inject(Router, { optional: true });
  private title = inject(Title, { optional: true });

  state = signal<State>("loading");
  symbol = signal<ApiSymbol>({ id: "", name: "", kind: "", signature: "", summary: "", examples: [] });
  packageName = signal("");
  indexUrl = computed(() => apiUrl(this.pkg()));

  private load = effect(() => {
    const slug = this.pkg();
    const wanted = this.sym();
    this.state.set("loading");
    this.page.toc.set([]);
    void this.api.loadPackage(slug).then((pkg) => {
      if (this.pkg() !== slug || this.sym() !== wanted) return;
      const all = (pkg?.entryPoints ?? []).flatMap((ep) => ep.symbols);
      const at = all.findIndex((s) => s.id === wanted);
      const found = at >= 0 ? at : all.findIndex((s) => s.name === wanted);
      const symbol = found >= 0 ? all[found]! : null;
      this.packageName.set(pkg?.name ?? "");
      if (symbol) {
        this.symbol.set(symbol);
        this.page.toc.set(symbolToc(symbol));
        const link = (s: ApiSymbol | undefined): PageLink | null => (s ? { title: s.name, url: symbolUrl(slug, s) } : null);
        this.page.pager.set({ url: symbolUrl(slug, symbol), prev: link(all[found - 1]), next: link(all[found + 1]) });
      }
      this.state.set(symbol ? "ready" : "missing");
      this.title?.set(`${symbol?.name ?? "Not found"} | ${pkg?.name ?? slug}${SUFFIX}`);
      revealFragment(this.router?.fragment());
    });
  });
}

/** Any /docs URL no other route matched. */
export class DocsNotFound {
  static meta = {
    selector: "docs-not-found",
    imports: [DocLink],
    template: html`
<article class="md"><h1 class="md-h">Page not found</h1><p>There is nothing at this address. Start from the <a docLink="/docs">documentation home</a>.</p></article>
    `,
  };

  private page = inject(DocsPage);
  private init = effect(() => this.page.toc.set([]));
}
