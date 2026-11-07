// The Style tab: style panels (spacing, color, type, radius, shadow, layout, size) whose scales are the project's own theme, a
// state toolbar (hover, focus, disabled, group, dark) with forced-state preview, the element's classes (dynamic ones read-only),
// and a searchable class palette with live hover preview and autocomplete. All reading and planning happens in the backend
// (`/api/tailwind/*`); this component only shows it and turns a pick into a class edit.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import type { ControlDef, ControlOption, SearchHit } from "../../../src/server/tailwind/types.js";
import { UiButton } from "../components/ui/button.js";
import { UiCommand, type CommandItem } from "../components/ui/command.js";
import { UiToggleGroup, type ToggleGroupItem } from "../components/ui/toggle-group.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiIcon } from "../lib/ui/icon.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
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
    imports: [UiButton, UiCommand, UiIcon, UiToggleGroup, UiTooltip],
    // TODO(gable-ui): native <input> and plain <button> rows below stand in for an Input with a clear button and a swatch/scale grid.
    template: html`
      @if (tw.offMessage(); as why) {
        <div class="empty" role="status" data-part="tailwind-off"><strong>No Style panel for this project</strong>Tailwind mode is off: {{ why }}</div>
      } @else if (loading()) {
        <div class="empty">Loading the project's Tailwind design system…</div>
      } @else if (edit.refused(); as why) {
        <div class="callout warn" data-part="read-only">
          <span class="chip warn">Read-only</span>
          <p class="mt-1">{{ why }}</p>
          <button uiButton variant="outline" size="sm" class="btn sm mt-2" (click)="chrome.showDrawer('code')">Edit in code</button>
        </div>
      } @else if (edit.node(); as n) {
        <div class="dbar">
          <span class="chip on mono">{{ tagLabel() }}</span>
          <span class="chip">{{ classCount() }}</span>
          <span class="chip" uiTooltip="The design system this panel's scales come from" data-part="tailwind-source">{{ sourceText() }}</span>
        </div>

        <div class="sec">
          <div class="prop">
            <span class="l">Breakpoint</span>
            <ui-toggle-group class="seg small fill" style="flex: 1 1 0; min-width: 0" [items]="breakpointItems()" [(value)]="breakpointPick" type="single" variant="outline" size="sm" data-part="breakpoint-seg"></ui-toggle-group>
          </div>
          <div class="prop" aria-label="States">
            <span class="l">State</span>
            <ui-toggle-group class="seg small" style="flex: 1 1 0; min-width: 0" [items]="stateItems()" [(value)]="tw.states" type="multiple" variant="outline" size="sm"></ui-toggle-group>
          </div>
          <div class="pad dim follow" data-part="breakpoint" uiTooltip="The breakpoint prefix comes from the selected frame's width, using this project's breakpoints">{{ breakpointText() }}</div>
          @if (forcedText()) {
            <p class="callout info" data-part="forced">{{ forcedText() }}</p>
          }
        </div>

        @if (tw.notice(); as note) {
          <p class="callout err" role="alert" data-part="tailwind-notice">{{ note }}</p>
        }
        @if (edit.notice(); as note) {
          <p class="callout" [class.err]="!note.ok" role="status">{{ note.text }}</p>
        }
        @if (readOnly()) {
          <div class="callout warn" data-part="dynamic-class">
            <span class="chip warn">Read-only</span>
            <p class="mt-1">The class list of this element is dynamic, so Tailwind mode shows it but does not edit it.</p>
          </div>
        }

        @for (s of sections(); track s.id) {
          <div class="sec" [attr.aria-label]="s.title" [attr.data-section]="s.id">
            <div class="sec-h">{{ s.title }}</div>
            @for (c of s.controls; track c.id) {
              <div class="prop" [class.overridden]="c.overridden">
                <span class="l" [attr.title]="c.property">{{ c.label }}</span>
                <button class="fld" [attr.data-control]="c.id" [attr.aria-expanded]="c.expanded" [attr.aria-label]="c.label" (click)="toggle(c.id)">
                  @if (c.isSet) {
                    @if (c.swatch) {
                      <span class="sw" [style.background]="c.swatch"></span>
                    }
                    <span class="mono truncate" [class.dim]="c.inherited" [class.italic]="c.inherited" [attr.data-state]="c.state">{{ c.utility }} <span class="dim">{{ c.detail }}</span></span>
                    @if (c.badge) {
                      <span class="chip" style="margin-left: auto" [class.ov]="c.overridden">{{ c.badge }}</span>
                    }
                  } @else {
                    <span class="dim">unset</span>
                  }
                </button>
                @if (c.clearToken) {
                  <button class="btn-plain" [attr.aria-label]="c.clearLabel" (click)="tw.remove(c.clearToken)"><svg uiIcon="x" class="ico-sm"></svg></button>
                }
              </div>
              @if (c.open) {
                <div class="card picker" [attr.data-picker]="c.id" (pointerleave)="tw.clearPreview()">
                  @if (c.filterable) {
                    <input class="fld" placeholder="Filter…" [attr.aria-label]="c.filterLabel" [value]="optionFilter()" (input)="optionFilter.set($event.currentTarget.value)" />
                  }
                  <div class="scale">
                    @for (o of shown(); track o.utility) {
                      <button
                        class="cls option"
                        [attr.data-utility]="o.utility"
                        [attr.title]="o.title"
                        (pointerenter)="previewOption(o.utility)"
                        (focus)="previewOption(o.utility)"
                        (click)="choose(o.utility)"
                      >
                        @if (o.swatch) {
                          <span class="sw" [style.background]="o.swatch"></span>
                        }
                        {{ o.label }}
                      </button>
                    }
                    @if (noOptions()) {
                      <span class="dim">Nothing in this project's theme matches.</span>
                    }
                  </div>
                </div>
              }
            }
          </div>
        }

        <div class="sec" aria-label="Classes">
          <div class="sec-h">Classes</div>
          <div class="pad wrap">
            @for (t of tokens(); track t.token) {
              <span class="cls" [class.new]="t.fresh" [class.bp]="t.scoped" [class.ro]="t.dim" [attr.data-token]="t.token" [attr.data-marker]="t.marker" [attr.title]="t.title">
                {{ t.token }}
                @if (t.removable) {
                  <button [attr.aria-label]="t.removeLabel" (click)="tw.remove(t.token)"><svg uiIcon="x" class="ico-sm"></svg></button>
                }
              </span>
            }
            @for (c of tw.conditionals(); track c.attr) {
              <span class="cls ro" data-part="conditional" [attr.title]="c.attr">conditional: {{ c.name }}</span>
            }
            @if (noClasses()) {
              <span class="dim">No classes yet.</span>
            }
          </div>
        </div>

        <div class="sec" aria-label="Class palette">
          <div class="sec-h">Add a class</div>
          <div class="pad">
            <div class="card overflow-hidden" data-part="palette" (pointermove)="hoverFromList($event)" (pointerleave)="tw.clearPreview()" (keyup)="hoverFromList($event)">
              <ui-command [items]="hits()" [filter]="ranked" [(query)]="query" placeholder="Search or type a class… (md:hover:bg-brand)" label="Tailwind classes" emptyText="No such class. Enter writes it if it is valid." (selected)="pick($event)"></ui-command>
            </div>
          </div>
        </div>
      } @else {
        <div class="empty"><strong>Nothing selected</strong>Select something to edit, or press Ctrl K to search and run commands.</div>
      }
    `,
  };
  tw = inject(TailwindState);
  edit = inject(EditState);
  chrome = inject(ChromeState);
  state = inject(DesignerState);
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
    const min = this.tw.breakpoints().find((b) => b.name === bp)?.min;
    const scope = bp ? `${bp}: ${min ?? "?"}px and up` : "base (below the first breakpoint)";
    const frame = this.state.frames.selected().config().name;
    return this.tw.pinned() ? `Pinned to ${scope}. Writes there whatever the frame's width.` : `Following ${frame}, writes ${scope}`;
  });
  sourceText = computed(() => {
    const i = this.tw.enabled();
    return i ? `Tailwind ${i.version} · ${i.entry}` : "";
  });
  breakpointItems = computed<ToggleGroupItem[]>(() => [{ value: "base", label: "base" }, ...this.tw.breakpoints().map((b) => ({ value: b.name, label: b.name }))]);
  /** The segment shows the breakpoint being written. Pressing the one the frame already reaches goes back to following the frame. */
  breakpointPick = signal<string[]>(["base"]);
  followBreakpoint = effect(() => {
    const shown = this.tw.breakpoint() ?? "base";
    untracked(() => {
      if (this.breakpointPick()[0] !== shown) this.breakpointPick.set([shown]);
    });
  });
  chooseBreakpoint = effect(() => {
    const picked = this.breakpointPick()[0];
    untracked(() => {
      const shown = this.tw.breakpoint() ?? "base";
      if (!picked) return this.breakpointPick.set([shown]);
      if (picked !== shown) this.tw.pin(picked);
    });
  });
  classCount = computed(() => {
    const n = this.tw.analysis()?.tokens.length ?? 0;
    return `${n} class${n === 1 ? "" : "es"}`;
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
          const badge = !v ? "" : v.inherited ? `from ${v.at}` : v.fromBaseState ? "from base" : v.at !== "base" ? `${v.at}:` : "";
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
            overridden: !!v && !v.inherited && !v.fromBaseState && v.at !== "base",
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
      const scoped = active && (t.breakpoint !== null || t.states.length > 0);
      const fresh = this.tw.written().includes(t.token);
      return {
        token: t.token,
        dim: !active,
        scoped: scoped && !fresh,
        fresh,
        // Inherited: applies from another breakpoint or state. Override: set at this one. New: written since this element was selected.
        marker: fresh ? "new" : !active ? "inherited" : scoped ? "override" : "base",
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
  // Declared before the effect: its first run reads it.
  #searchSeq = 0;
  search = effect(() => {
    const q = this.query();
    const on = this.tw.enabled();
    untracked(() => void this.#search(on ? q : null));
  });
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
