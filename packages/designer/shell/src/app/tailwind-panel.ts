// The Tailwind tab: style panels (spacing, color, type, radius, shadow, layout, size) whose scales are the project's own theme, a
// state toolbar (hover, focus, disabled, group, dark) with forced-state preview, the element's classes (dynamic ones read-only),
// and a searchable class palette with live hover preview and autocomplete. All reading and planning happens in the backend
// (`/api/tailwind/*`); this component only shows it and turns a pick into a class edit.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import type { ControlDef, ControlOption, SearchHit } from "../../../src/server/tailwind/types.js";
import { UiBadge } from "../components/ui/badge.js";
import { UiButton } from "../components/ui/button.js";
import { UiCommand, type CommandItem } from "../components/ui/command.js";
import { UiSeparator } from "../components/ui/separator.js";
import { UiToggleGroup, type ToggleGroupItem } from "../components/ui/toggle-group.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { EditState } from "./edit-state.js";
import { TailwindState } from "./tailwind-state.js";

const SECTIONS: Array<{ id: ControlDef["section"]; title: string }> = [
  { id: "layout", title: "Layout" },
  { id: "size", title: "Size" },
  { id: "spacing", title: "Spacing" },
  { id: "type", title: "Typography" },
  { id: "color", title: "Color" },
  { id: "border", title: "Border & radius" },
  { id: "effects", title: "Shadow & effects" },
];

/** Passes the backend's ranking through: the palette shows what `/api/tailwind/search` returned, in that order. */
const asRanked = (items: readonly CommandItem[]): CommandItem[] => [...items];

export class TailwindPanel {
  static meta = {
    selector: "app-tailwind-panel",
    host: { class: "block" },
    imports: [UiBadge, UiButton, UiCommand, UiSeparator, UiToggleGroup, UiTooltip],
    // TODO(gable-ui): native <input> and plain <button> rows below stand in for an Input with a clear button and a swatch/scale grid.
    template: html`
      <div class="flex flex-col gap-3 p-2 text-sm">
        @if (tw.offMessage(); as why) {
          <p class="rounded-md border border-dashed p-2 text-xs text-muted-foreground" role="status" data-part="tailwind-off">Tailwind mode is off: {{ why }}</p>
        } @else if (loading()) {
          <p class="text-xs text-muted-foreground">Loading the project's Tailwind design system…</p>
        } @else if (edit.refused(); as why) {
          <p class="text-muted-foreground">{{ why }}</p>
        } @else if (edit.node(); as n) {
          <header class="flex flex-wrap items-center gap-2">
            <strong class="font-mono">{{ tagLabel() }}</strong>
            <span uiBadge variant="outline" uiTooltip="The breakpoint prefix comes from the selected frame's width, using this project's breakpoints" data-part="breakpoint">{{ breakpointText() }}</span>
            <span class="text-xs text-muted-foreground" data-part="tailwind-source">{{ sourceText() }}</span>
          </header>

          <section class="flex flex-col gap-1" aria-label="States">
            <h3 class="text-xs font-medium uppercase text-muted-foreground">State</h3>
            <ui-toggle-group [items]="stateItems()" [(value)]="tw.states" type="multiple" variant="outline" size="sm"></ui-toggle-group>
            @if (forcedText()) {
              <p class="text-xs text-muted-foreground" data-part="forced">{{ forcedText() }}</p>
            }
          </section>

          @if (tw.notice(); as note) {
            <p class="text-xs text-destructive" role="alert" data-part="tailwind-notice">{{ note }}</p>
          }
          @if (edit.notice(); as note) {
            <p class="text-xs" [class.text-destructive]="!note.ok" [class.text-muted-foreground]="note.ok" role="status">{{ note.text }}</p>
          }
          @if (readOnly()) {
            <p class="rounded-md border border-dashed p-2 text-xs text-muted-foreground" data-part="dynamic-class">The class list of this element is dynamic, so Tailwind mode shows it but does not edit it.</p>
          }

          <section class="flex flex-col gap-1" aria-label="Classes">
            <h3 class="text-xs font-medium uppercase text-muted-foreground">Classes</h3>
            <div class="flex flex-wrap gap-1">
              @for (t of tokens(); track t.token) {
                <span class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-xs" [class.opacity-50]="t.dim" [attr.data-token]="t.token" [attr.title]="t.title">
                  {{ t.token }}
                  @if (t.removable) {
                    <button class="text-muted-foreground hover:text-foreground" [attr.aria-label]="t.removeLabel" (click)="tw.remove(t.token)">×</button>
                  }
                </span>
              }
              @for (c of tw.conditionals(); track c.attr) {
                <span class="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 font-mono text-xs" data-part="conditional" [attr.title]="c.attr">conditional: {{ c.name }}</span>
              }
              @if (noClasses()) {
                <span class="text-xs text-muted-foreground">No classes yet.</span>
              }
            </div>
          </section>

          <section class="flex flex-col gap-1" aria-label="Class palette">
            <h3 class="text-xs font-medium uppercase text-muted-foreground">Add a class</h3>
            <div class="overflow-hidden rounded-md border" data-part="palette" (pointermove)="hoverFromList($event)" (pointerleave)="tw.clearPreview()" (keyup)="hoverFromList($event)">
              <ui-command [items]="hits()" [filter]="ranked" [(query)]="query" placeholder="Search or type a class… (md:hover:bg-brand)" label="Tailwind classes" emptyText="No such class. Enter writes it if it is valid." (selected)="pick($event)"></ui-command>
            </div>
          </section>

          @for (s of sections(); track s.id) {
            <div uiSeparator></div>
            <section class="flex flex-col gap-1" [attr.aria-label]="s.title" [attr.data-section]="s.id">
              <h3 class="text-xs font-medium uppercase text-muted-foreground">{{ s.title }}</h3>
              @for (c of s.controls; track c.id) {
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2">
                    <span class="w-28 shrink-0 truncate text-xs" [attr.title]="c.property">{{ c.label }}</span>
                    <button class="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border px-2 text-left font-mono text-xs hover:bg-accent" [attr.data-control]="c.id" [attr.aria-expanded]="c.expanded" (click)="toggle(c.id)">
                      @if (c.isSet) {
                        @if (c.swatch) {
                          <span class="size-3 shrink-0 rounded-sm border" [style.background]="c.swatch"></span>
                        }
                        <span class="truncate" [class.text-muted-foreground]="c.inherited" [attr.data-state]="c.state">{{ c.utility }} <span class="text-muted-foreground">{{ c.detail }}</span></span>
                        @if (c.badge) {
                          <span uiBadge variant="outline">{{ c.badge }}</span>
                        }
                      } @else {
                        <span class="text-muted-foreground">unset</span>
                      }
                    </button>
                    @if (c.clearToken) {
                      <button class="text-muted-foreground hover:text-foreground" [attr.aria-label]="c.clearLabel" (click)="tw.remove(c.clearToken)">×</button>
                    }
                  </div>
                  @if (c.open) {
                    <div class="flex flex-col gap-1 rounded-md border p-1" [attr.data-picker]="c.id" (pointerleave)="tw.clearPreview()">
                      @if (c.filterable) {
                        <input class="h-7 rounded-md border bg-transparent px-2 text-xs" placeholder="Filter…" [attr.aria-label]="c.filterLabel" [value]="optionFilter()" (input)="optionFilter.set($event.currentTarget.value)" />
                      }
                      <div class="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
                        @for (o of shown(); track o.utility) {
                          <button
                            class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-xs hover:bg-accent"
                            [attr.data-utility]="o.utility"
                            [attr.title]="o.title"
                            (pointerenter)="previewOption(o.utility)"
                            (focus)="previewOption(o.utility)"
                            (click)="choose(o.utility)"
                          >
                            @if (o.swatch) {
                              <span class="size-3 rounded-sm border" [style.background]="o.swatch"></span>
                            }
                            {{ o.label }}
                          </button>
                        }
                        @if (noOptions()) {
                          <span class="text-xs text-muted-foreground">Nothing in this project's theme matches.</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </section>
          }
        } @else {
          <p class="text-muted-foreground">Select an element on the canvas to style it with Tailwind.</p>
        }
      </div>
    `,
  };
  tw = inject(TailwindState);
  edit = inject(EditState);
  ranked = asRanked;

  query = signal("");
  hits = signal<CommandItem[]>([]);
  openId = signal<string | null>(null);
  options = signal<ControlOption[]>([]);
  optionFilter = signal("");

  tagLabel = computed(() => `<${this.edit.node()?.tag ?? ""}>`);
  loading = computed(() => !this.tw.enabled());
  readOnly = computed(() => !this.tw.writable());
  noClasses = computed(() => this.tokens().length === 0 && this.tw.conditionals().length === 0);
  breakpointText = computed(() => {
    const bp = this.tw.breakpoint();
    if (!bp) return "base (below the first breakpoint)";
    const min = this.tw.breakpoints().find((b) => b.name === bp)?.min;
    return `${bp}: ${min ?? "?"}px and up`;
  });
  sourceText = computed(() => {
    const i = this.tw.enabled();
    return i ? `Tailwind ${i.version} · ${i.entry}` : "";
  });
  stateItems = computed<ToggleGroupItem[]>(() => (this.tw.enabled()?.states ?? []).map((s) => ({ value: s, label: s })));
  forcedText = computed(() => {
    const f = this.tw.forced();
    if (f.cdp.length === 0 && f.injected.length === 0) return "";
    return [f.cdp.length ? `${f.cdp.join(", ")} forced through DevTools` : "", f.injected.length ? `${f.injected.join(", ")} shown with an injected rule` : ""].filter(Boolean).join("; ");
  });
  /** The style panels: one row per control, with everything the template shows worked out here (templates cannot compute). */
  sections = computed(() => {
    const info = this.tw.enabled();
    const values = this.tw.analysis()?.values ?? {};
    const open = this.openId();
    const writable = this.tw.writable();
    const filterable = this.options().length > 12;
    return SECTIONS.map((s) => ({
      ...s,
      controls: (info?.controls ?? [])
        .filter((c) => c.section === s.id)
        .map((c) => {
          const v = values[c.id] ?? null;
          const badge = !v ? "" : v.inherited ? `from ${v.at}` : v.fromBaseState ? "plain" : v.at !== "base" ? v.at : "";
          const clearable = !!v && !v.inherited && !v.fromBaseState && writable;
          return {
            id: c.id,
            label: c.label,
            property: c.property,
            open: open === c.id,
            expanded: String(open === c.id),
            isSet: !!v,
            utility: v?.utility ?? "",
            detail: v?.detail ?? "",
            swatch: v?.swatch ?? "",
            inherited: !!v?.inherited,
            state: v?.inherited ? "inherited" : "set",
            badge,
            clearToken: clearable ? v!.token : "",
            clearLabel: `Clear ${c.label}`,
            filterable: c.kind !== "choice" && filterable,
            filterLabel: `Filter ${c.label}`,
          };
        }),
    })).filter((s) => s.controls.length > 0);
  });
  /** The element's tokens, dimmed when they do not apply at the context being edited (another breakpoint or state). */
  tokens = computed(() => {
    const bp = this.tw.breakpoint();
    const states = new Set(this.tw.states());
    const writable = this.tw.writable();
    return (this.tw.analysis()?.tokens ?? []).map((t) => {
      const active = t.breakpoint === bp && t.states.length === states.size && t.states.every((s) => states.has(s));
      return {
        token: t.token,
        dim: !active,
        removable: writable,
        removeLabel: `Remove ${t.token}`,
        title: t.known ? t.claims.join(", ") || "sets no property of its own" : "Not a Tailwind utility of this project (its own CSS class): never changed",
      };
    });
  });
  shown = computed(() => {
    const q = this.optionFilter().trim().toLowerCase();
    const all = this.options();
    return (q ? all.filter((o) => (o.utility + " " + o.detail).toLowerCase().includes(q)) : all).map((o) => ({ utility: o.utility, label: o.label, swatch: o.swatch ?? "", title: `${o.utility} → ${o.detail}` }));
  });
  noOptions = computed(() => this.shown().length === 0);

  async toggle(id: string): Promise<void> {
    this.tw.clearPreview();
    if (this.openId() === id) return void this.openId.set(null);
    this.optionFilter.set("");
    this.openId.set(id);
    this.options.set(await this.tw.options(id));
  }

  previewOption(utility: string): void {
    void this.tw.preview([this.tw.variantPrefix() + utility]);
  }

  choose(utility: string): void {
    void this.tw.apply(utility);
  }

  // The palette: searches as the user types, previews the highlighted entry, writes the picked one.
  search = effect(() => {
    const q = this.query();
    const on = this.tw.enabled();
    untracked(() => void this.#search(on ? q : null));
  });
  #searchSeq = 0;
  async #search(q: string | null): Promise<void> {
    const seq = ++this.#searchSeq;
    if (q === null) return void this.hits.set([]);
    const hits: SearchHit[] = await this.tw.search(q.trim());
    if (seq !== this.#searchSeq) return;
    this.hits.set(hits.map((h) => ({ value: h.token, label: h.token, shortcut: h.css.length > 40 ? h.css.slice(0, 38) + "…" : h.css })));
  }

  /** The command list highlights on hover and with the arrow keys; the highlighted row's label is the class to preview. */
  hoverFromList(e: Event): void {
    queueMicrotask(() => {
      const root = (e.currentTarget as HTMLElement | null) ?? null;
      const row = root?.querySelector('[role="option"][data-selected="true"]');
      const token = row?.querySelector("span")?.textContent?.trim();
      if (token) void this.tw.preview([token]);
      else this.tw.clearPreview();
    });
  }

  pick(token: string): void {
    this.query.set("");
    void this.tw.applyTyped(token);
  }
}
