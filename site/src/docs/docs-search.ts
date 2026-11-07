import { computed, effect, html, inject, signal } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { Router } from "@gable/core/router";
import { ApiData } from "./api-data.js";
import { GUIDES, loadGuide, loadPackageGuide } from "./content.js";
import { DocLink } from "./doc-link.js";
import type { MarkdownDoc } from "./markdown.js";
import { buildSearchIndex, search, type SearchEntry } from "./search.js";

interface ResultVM {
  key: number;
  id: string;
  title: string;
  where: string;
  kind: string;
  url: string;
  selected: "true" | "false";
}

interface KeyLike {
  key: string;
  target?: unknown;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  preventDefault?(): void;
}

/**
 * Search over the guides (headings and text) and every documented API symbol. The index is built in memory the first
 * time the box is used; `/` focuses it from anywhere on the page. A listbox of results opens under the input.
 */
export class DocsSearch {
  static meta = {
    selector: "docs-search",
    imports: [DocLink],
    template: html`
<div class="srch" role="search">
<label class="sr-only" for="docs-search-input">Search the documentation</label>
<input id="docs-search-input" class="srch-in" type="text" autocomplete="off" spellcheck="false" placeholder="Search docs" role="combobox" aria-autocomplete="list" aria-controls="docs-search-results" [attr.aria-expanded]="expanded()" [attr.aria-activedescendant]="activeId()" [value]="query()" (input)="onInput($event)" (focus)="onFocus()" (keydown)="onKey($event)" (blur)="onBlur()" />
<kbd class="srch-key" aria-hidden="true">/</kbd>
<ul id="docs-search-results" class="srch-list" role="listbox" aria-label="Search results" [hidden]="!expanded()">@for (r of results(); track r.key) {<li role="presentation"><a role="option" [docLink]="r.url" [attr.id]="r.id" [attr.aria-selected]="r.selected" tabindex="-1" (mousedown)="keepOpen($event)" (click)="close()"><b>{{ r.title }}</b><span>{{ r.kind }} · {{ r.where }}</span></a></li>}</ul>
<p class="sr-only" role="status" aria-live="polite">{{ status() }}</p>
@if (showEmpty()) {
<p class="srch-empty">{{ empty() }}</p>
}
</div>
    `,
  };

  private api = inject(ApiData);
  private router = inject(Router, { optional: true });

  query = signal("");
  open = signal(false);
  active = signal(0);
  private index = signal<SearchEntry[] | null>(null);
  private building = false;

  private hits = computed(() => (this.index() ? search(this.index()!, this.query()) : []));
  results = computed<ResultVM[]>(() =>
    this.hits().map((h, key) => ({
      key,
      id: `docs-result-${key}`,
      title: h.entry.title,
      where: h.entry.where,
      kind: h.entry.kind,
      url: h.entry.url,
      selected: key === this.active() ? "true" : "false",
    })),
  );
  expanded = computed(() => this.open() && this.query().trim().length > 0 && this.results().length > 0);
  activeId = computed(() => (this.expanded() ? `docs-result-${this.active()}` : null));
  showEmpty = computed(() => this.open() && this.query().trim().length > 0 && this.results().length === 0);
  empty = computed(() => (this.index() ? "No results" : "Loading the index"));
  status = computed(() => (this.query().trim() ? (this.results().length ? `${this.results().length} results` : this.index() ? "No results" : "") : ""));

  private clear = effect(() => {
    // A navigation (a result, a link, back) closes the box and empties it.
    this.router?.url();
    this.query.set("");
    this.open.set(false);
  });

  private shortcut = (() => {
    if (typeof document === "undefined") return null;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        document.getElementById("docs-search-input")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return currentScope()?.onDispose(() => document.removeEventListener("keydown", onKey));
  })();

  /** Loads every guide and package once, then builds the in-memory index. */
  private async ensureIndex(): Promise<void> {
    if (this.index() || this.building) return;
    this.building = true;
    const guides = new Map<string, MarkdownDoc>();
    const loadGuides = Promise.all(
      GUIDES.map(async (g) => {
        const doc = await loadGuide(g.slug);
        if (doc) guides.set(g.slug, doc);
      }),
    );
    const packages = await this.api.loadAll();
    const packageGuides = new Map<string, MarkdownDoc>();
    await Promise.all([
      loadGuides,
      ...packages.map(async (p) => {
        const doc = await loadPackageGuide(p.slug).catch(() => null);
        if (doc) packageGuides.set(p.slug, doc);
      }),
    ]);
    this.index.set(buildSearchIndex(guides, packages, packageGuides));
  }

  onFocus(): void {
    this.open.set(true);
    void this.ensureIndex();
  }

  onBlur(): void {
    // Results use mousedown (see keepOpen), so a blur here is a real focus loss.
    this.open.set(false);
  }

  keepOpen(event?: { preventDefault?(): void }): void {
    event?.preventDefault?.();
  }

  close(): void {
    this.open.set(false);
  }

  onInput(event: { target?: unknown }): void {
    this.query.set(String((event.target as { value?: string } | null)?.value ?? ""));
    this.active.set(0);
    this.open.set(true);
    void this.ensureIndex();
  }

  onKey(event: KeyLike): void {
    const count = this.results().length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault?.();
      this.open.set(true);
      if (count) this.active.set((this.active() + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
    } else if (event.key === "Enter") {
      const hit = this.results()[this.active()];
      if (hit && this.expanded()) {
        event.preventDefault?.();
        void this.router?.navigate(hit.url);
      }
    } else if (event.key === "Escape") {
      if (this.open() || this.query()) event.preventDefault?.();
      this.open.set(false);
      this.query.set("");
    }
  }
}
