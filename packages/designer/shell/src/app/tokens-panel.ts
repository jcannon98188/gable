// The Tokens tab (TASK-56.23): the project's design tokens (CSS custom properties) with their light and dark values, each
// editable in place as one minimal patch with undo; how many places use a token, with the list of them and a jump to the
// element; and every definition with its context, read-only ones (a package's theme.css) marked as overridden on edit.
// `ElementTokens` is the Style tab's (and this tab's) list of the tokens the selected element reads.
// All reading happens in the backend (tokens-state.ts); this only shows it and turns a typed value into an edit.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import type { TokenDef, TokenInfo, TokenKind, TokenUsage, TokenValue } from "../../../src/server/tokens/types.js";
import { UiButton } from "../components/ui/button.js";
import { UiToggleGroup, type ToggleGroupItem } from "../components/ui/toggle-group.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiIcon } from "../lib/ui/icon.js";
import { ChromeState } from "./chrome-state.js";
import { EditState } from "./edit-state.js";
import { TokensState } from "./tokens-state.js";
import "./tokens.css";

type Slot = "light" | "dark" | `def:${number}`;

const KINDS: Array<{ id: TokenKind; title: string }> = [
  { id: "color", title: "Colors" },
  { id: "length", title: "Sizes" },
  { id: "number", title: "Numbers" },
  { id: "other", title: "Other" },
];

const where = (v: TokenValue | null) => (v ? v.at : "");
const contextOf = (atRules: string[], selector: string | null) => [...atRules, ...(selector !== null ? [selector] : [])].join(" ");
/** `@gable/ui` for `@gable/ui/theme.css`, `pkg` for `pkg/x.css`. */
const packageOf = (file: string) => {
  const parts = file.split("/");
  return (parts[0]!.startsWith("@") ? parts.slice(0, 2) : parts.slice(0, 1)).join("/");
};

/** Shows the swatch only for values a browser takes as a colour (`var()` chains are resolved by the backend first). */
function swatchOf(kind: TokenKind, value: string): string {
  if (kind !== "color" || !value) return "";
  return typeof CSS !== "undefined" && CSS.supports?.("color", value) ? value : "";
}

/** Focuses the inline value field once the template has rendered it. */
function focusField(): void {
  setTimeout(() => {
    const el = document.querySelector<HTMLInputElement>('input[data-part="token-input"]');
    el?.focus();
    el?.select();
  });
}

/** The tokens the selected element reads, each a link to it in the Tokens tab. */
export class ElementTokens {
  static meta = {
    selector: "app-element-tokens",
    host: { class: "block" },
    imports: [UiTooltip],
    template: html`
      @if (shown()) {
        <div class="sec" aria-label="Design tokens" data-part="element-tokens">
          <div class="sec-h">Design tokens</div>
          <div class="pad wrap">
            @for (t of rows(); track t.key) {
              <button class="cls tok-chip" [attr.data-token]="t.name" [attr.title]="t.title" (click)="open(t.name)">
                @if (t.swatch) {
                  <span class="sw" [style.background]="t.swatch"></span>
                }
                {{ t.name }}
              </button>
            }
          </div>
        </div>
      }
    `,
  };
  tokens = inject(TokensState);
  chrome = inject(ChromeState);

  shown = computed(() => this.tokens.element().length > 0);
  rows = computed(() => {
    const byName = this.tokens.byName();
    return this.tokens.element().map((e, i) => {
      const t = byName.get(e.name);
      const v = t?.light ?? t?.dark ?? null;
      return {
        key: `${e.name}:${i}`,
        name: e.name,
        swatch: t && v ? swatchOf(t.kind, v.resolved) : "",
        title: `${e.via}${v ? `: ${v.value}${t?.dark ? ` (dark ${t.dark.value})` : ""}` : ""}. Click to edit it in the Tokens tab.`,
      };
    });
  });

  open(name: string): void {
    this.tokens.focus.set(null);
    this.tokens.focus.set(name);
    this.chrome.right.set("tokens");
  }
}

export class TokensPanel {
  static meta = {
    selector: "app-tokens-panel",
    host: { class: "block" },
    imports: [UiButton, UiIcon, UiToggleGroup, UiTooltip, ElementTokens],
    // TODO(gable-ui): native <input class="fld"> stands in for an Input at panel density, and the value buttons for a token/colour field.
    template: html`
      @if (tokens.error(); as e) {
        <p class="callout err" role="alert" data-part="tokens-error">{{ e }}</p>
      }
      @if (loading()) {
        <div class="empty">Reading the project's stylesheets…</div>
      } @else if (empty()) {
        <div class="empty" data-part="tokens-empty"><strong>No design tokens</strong>None of this project's stylesheets defines a CSS custom property (--name: value).</div>
      } @else {
        <app-element-tokens></app-element-tokens>
        <div class="sec">
          <div class="prop">
            <input class="fld" type="search" data-part="tokens-filter" placeholder="Filter tokens…" aria-label="Filter tokens" spellcheck="false" [value]="filter()" (input)="filter.set($event.currentTarget.value)" />
          </div>
          <div class="prop">
            <ui-toggle-group class="seg small fill" style="flex: 1 1 0; min-width: 0" [items]="kindItems()" [(value)]="kindPick" type="single" variant="outline" size="sm" data-part="tokens-kind"></ui-toggle-group>
          </div>
          <div class="pad dim tok-src" data-part="tokens-source">{{ sourceText() }}</div>
        </div>
        @if (errorNote()) {
          <p class="callout err" role="status" data-part="tokens-notice">{{ errorNote() }}</p>
        }
        @if (jumpNote()) {
          <p class="callout info" role="status" data-part="jump-note">{{ jumpNote() }}</p>
        }
        @for (g of groups(); track g.id) {
          <div class="sec" [attr.aria-label]="g.title" [attr.data-kind]="g.id">
            <div class="sec-h">{{ g.title }} <span class="dim">{{ g.count }}</span></div>
            @for (t of g.rows; track t.name) {
              <div class="tok" [class.open]="t.open" [attr.data-token]="t.name">
                <div class="tok-h">
                  <button class="btn-plain tok-name mono" [attr.aria-expanded]="t.expanded" [attr.title]="t.nameTitle" (click)="toggle(t.name)">
                    <svg [uiIcon]="t.chevron" class="ico-sm"></svg>{{ t.name }}
                  </button>
                  @if (t.pkg) {
                    <span class="chip" uiTooltip="Defined in a package stylesheet: an edit writes an override in the project's stylesheet" data-part="token-package">{{ t.pkg }}</span>
                  }
                  <button class="chip tok-uses" data-part="token-uses" [attr.aria-label]="t.usesLabel" [attr.title]="t.usesLabel" (click)="toggle(t.name)">{{ t.uses }}</button>
                </div>
                @for (v of t.values; track v.slot) {
                  <div class="prop tok-val" [attr.data-scheme]="v.slot">
                    <span class="l">{{ v.label }}</span>
                    @if (v.editing) {
                      <input class="fld mono" data-part="token-input" spellcheck="false" [attr.aria-label]="v.aria" [value]="draft()" (input)="draft.set($event.currentTarget.value)" (keydown)="onKey($event.key)" (blur)="cancel()" />
                    } @else {
                      <button class="fld" data-part="token-value" [class.ro]="!v.editable" [attr.aria-label]="v.aria" [attr.title]="v.title" (click)="startEdit(t.name, v.slot)">
                        @if (v.swatch) {
                          <span class="sw" [style.background]="v.swatch"></span>
                        }
                        <span class="mono truncate" [class.dim]="v.inherited">{{ v.text }}</span>
                        @if (v.badge) {
                          <span class="chip" style="margin-left: auto">{{ v.badge }}</span>
                        }
                      </button>
                    }
                  </div>
                }
                @if (t.open) {
                  <div class="tok-detail">
                    @if (t.why) {
                      <p class="callout warn">{{ t.why }}</p>
                    }
                    <div class="sec-h">Definitions</div>
                    @for (d of t.defs; track d.key) {
                      <div class="tok-def" [class.lost]="d.lost" data-part="token-def" [attr.data-context]="d.context">
                        <span class="mono truncate tok-ctx" [attr.title]="d.title">{{ d.context }}</span>
                        @if (d.editing) {
                          <input class="fld mono" data-part="token-input" spellcheck="false" [attr.aria-label]="d.aria" [value]="draft()" (input)="draft.set($event.currentTarget.value)" (keydown)="onKey($event.key)" (blur)="cancel()" />
                        } @else {
                          <button class="fld" [class.ro]="!d.editable" [attr.aria-label]="d.aria" [attr.title]="d.title" (click)="startEdit(t.name, d.slot)">
                            @if (d.swatch) {
                              <span class="sw" [style.background]="d.swatch"></span>
                            }
                            <span class="mono truncate">{{ d.value }}</span>
                          </button>
                        }
                        @if (d.removable) {
                          <button class="btn-plain" [attr.aria-label]="d.removeLabel" [attr.title]="d.removeLabel" (click)="remove(t.name, d.index)"><svg uiIcon="x" class="ico-sm"></svg></button>
                        }
                      </div>
                    }
                    <div class="sec-h">Uses <span class="dim">{{ t.useCount }}</span></div>
                    @if (t.usagesError) {
                      <p class="callout err">{{ t.usagesError }}</p>
                    } @else if (t.usagesLoading) {
                      <p class="pad dim">Finding uses…</p>
                    } @else if (t.noUsages) {
                      <p class="pad dim">Nothing in the project reads {{ t.name }}.</p>
                    }
                    @for (u of t.usages; track u.key) {
                      <button class="tok-use" data-part="token-usage" [attr.data-kind]="u.kind" [attr.title]="u.title" (click)="jump(t.name, u.index)">
                        <span class="chip">{{ u.kind }}</span>
                        <span class="mono truncate">{{ u.what }}</span>
                        <span class="dim truncate tok-at">{{ u.at }}</span>
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
        @if (noMatch()) {
          <div class="empty">No token matches.</div>
        }
      }
    `,
  };
  tokens = inject(TokensState);
  edit = inject(EditState);
  chrome = inject(ChromeState);

  filter = signal("");
  kindPick = signal<string[]>(["all"]);
  open = signal<string[]>([]);
  editing = signal<{ name: string; slot: Slot } | null>(null);
  draft = signal("");
  jumpNote = signal("");

  loading = computed(() => this.tokens.list() === null && !this.tokens.error());
  empty = computed(() => this.tokens.list()?.tokens.length === 0);
  kindItems = computed<ToggleGroupItem[]>(() => [{ value: "all", label: "All" }, ...KINDS.filter((k) => this.tokens.list()?.tokens.some((t) => t.kind === k.id)).map((k) => ({ value: k.id, label: k.title }))]);
  sourceText = computed(() => {
    const l = this.tokens.list();
    if (!l) return "";
    const files = l.sheets.map((s) => s.file + (s.editable ? "" : " (read-only)")).join(", ");
    const dark = l.darkVia.length ? `dark values from ${l.darkVia.join(", ")}` : "no dark values";
    return `${l.tokens.length} tokens in ${files}; ${dark}${l.tailwind ? "" : ". Tailwind mode is off: classes count only where they spell var()"}.`;
  });

  errorNote = computed(() => {
    const n = this.edit.notice();
    return n && !n.ok ? n.text : "";
  });

  /** The Style tab's click on an element's token: open it here, unfiltered, and scroll to it. */
  reveal = effect(() => {
    const f = this.tokens.focus();
    if (!f) return;
    untracked(() => {
      this.filter.set("");
      this.kindPick.set(["all"]);
      if (!this.open().includes(f)) this.toggle(f);
      setTimeout(() => document.querySelector(`.tok[data-token="${CSS.escape(f)}"]`)?.scrollIntoView({ block: "nearest" }));
    });
  });

  groups = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const kind = this.kindPick()[0] ?? "all";
    const open = new Set(this.open());
    const usages = this.tokens.usages();
    const editing = this.editing();
    const all = (this.tokens.list()?.tokens ?? []).filter((t) => (!q || t.name.toLowerCase().includes(q) || t.light?.value.toLowerCase().includes(q)) && (kind === "all" || t.kind === kind));
    return KINDS.map((k) => {
      const rows = all.filter((t) => t.kind === k.id).map((t) => this.#row(t, open.has(t.name), usages[t.name], editing));
      return { id: k.id, title: k.title, count: String(rows.length), rows };
    }).filter((g) => g.rows.length > 0);
  });
  noMatch = computed(() => !this.loading() && !this.empty() && this.groups().length === 0);

  #row(t: TokenInfo, isOpen: boolean, used: TokenUsage[] | { error: string } | undefined, editing: { name: string; slot: Slot } | null) {
    const pkgDef = t.defs.find((d) => !d.editable);
    const isEditing = (slot: Slot) => editing?.name === t.name && editing.slot === slot;
    const value = (slot: "light" | "dark") => {
      const v = slot === "light" ? t.light : t.dark;
      const target = slot === "light" ? t.edit.light : t.edit.dark;
      const shown = v ?? (slot === "dark" ? t.light : null);
      return {
        slot,
        label: slot === "light" ? "Light" : "Dark",
        editing: isEditing(slot),
        editable: !!target,
        inherited: !v,
        text: shown ? shown.value : "unset",
        swatch: shown ? swatchOf(t.kind, shown.resolved) : "",
        badge: !v && slot === "dark" && t.light ? "same as light" : target?.override ? "override" : "",
        title: !target
          ? (t.edit.why ?? "Edited in code")
          : `${v ? `${v.value}${v.resolved !== v.value ? ` → ${v.resolved}` : ""} at ${where(v)}. ` : ""}Click to edit${target.override ? `: writes an override in ${target.file} (${contextOf(target.atRules, target.selector)})` : ` in ${target.file} (${contextOf(target.atRules, target.selector) || "top level"})`}.`,
        aria: `${t.name} ${slot} value`,
      };
    };
    const values = [value("light"), ...(t.dark || t.edit.dark ? [value("dark")] : [])];
    const list = Array.isArray(used) ? used : [];
    return {
      name: t.name,
      open: isOpen,
      expanded: String(isOpen),
      chevron: isOpen ? "chevron-down" : "chevron-right",
      nameTitle: [t.refs.length ? `reads ${t.refs.join(", ")}` : "", t.aliases.length ? `read by ${t.aliases.join(", ")}` : ""].filter(Boolean).join("; ") || t.name,
      pkg: pkgDef && t.defs.every((d) => !d.editable) ? packageOf(pkgDef.file) : "",
      uses: `${t.uses} use${t.uses === 1 ? "" : "s"}`,
      useCount: String(t.uses),
      usesLabel: `${t.name}: used in ${t.uses} place${t.uses === 1 ? "" : "s"}. Show them`,
      values,
      why: t.edit.why ?? "",
      defs: t.defs.map((d, i) => this.#def(t, d, i, isEditing(`def:${i}`))),
      usagesLoading: isOpen && used === undefined,
      usagesError: used && !Array.isArray(used) ? used.error : "",
      noUsages: Array.isArray(used) && used.length === 0,
      usages: list.map((u, i) => ({
        key: `${u.file}:${u.line}:${u.column}:${u.className ?? u.property ?? ""}:${i}`,
        index: i,
        kind: u.kind,
        what: u.kind === "css" ? `${u.context} { ${u.property} }` : u.kind === "class" ? `<${u.tag}> ${u.className}` : `<${u.tag}> style`,
        at: `${u.file}:${u.line}`,
        title: `${u.text}${u.via ? ` (through ${u.via})` : ""}${u.readOnly ? " (package stylesheet)" : ""}. Click to select it on the canvas.`,
      })),
    };
  }

  #def(t: TokenInfo, d: TokenDef, i: number, editing: boolean) {
    return {
      key: `${d.file}:${d.line}:${d.column}`,
      index: i,
      slot: `def:${i}` as Slot,
      context: d.context || "(top level)",
      value: d.value,
      swatch: swatchOf(t.kind, d.value),
      editing,
      editable: !!d.target,
      lost: !!d.overriddenBy,
      removable: d.editable && !!d.target,
      removeLabel: `Remove ${t.name} from ${d.context || "the top level"}`,
      aria: `${t.name} in ${d.context}`,
      title: `${d.file}:${d.line}${d.overriddenBy ? `, overridden by ${d.overriddenBy}` : ""}${d.editable ? "" : ". Package stylesheet: an edit writes an override in the project's stylesheet"}${d.target ? "" : ". Nested rule: edit it in code"}`,
    };
  }

  toggle(name: string): void {
    const isOpen = this.open().includes(name);
    this.open.set(isOpen ? this.open().filter((n) => n !== name) : [...this.open(), name]);
    if (isOpen) this.tokens.forgetUsages(name);
    else void this.tokens.loadUsages(name);
  }

  startEdit(name: string, slot: Slot): void {
    const t = this.tokens.byName().get(name);
    if (!t) return;
    let current: string | null;
    if (slot === "light" || slot === "dark") {
      if (!(slot === "light" ? t.edit.light : t.edit.dark)) return;
      current = (slot === "dark" ? (t.dark ?? t.light) : t.light)?.value ?? "";
    } else {
      const d = t.defs[Number(slot.slice(4))];
      if (!d?.target) return;
      current = d.value;
    }
    this.draft.set(current);
    this.editing.set({ name, slot });
    focusField();
  }

  cancel(): void {
    this.editing.set(null);
  }

  onKey(key: string): void {
    if (key === "Escape") return this.cancel();
    if (key === "Enter") void this.commit();
  }

  async commit(): Promise<void> {
    const e = this.editing();
    if (!e) return;
    const t = this.tokens.byName().get(e.name);
    const value = this.draft().trim();
    this.editing.set(null);
    if (!t || !value) return;
    if (e.slot === "light" || e.slot === "dark") {
      const now = (e.slot === "dark" ? t.dark : t.light)?.value;
      if (now === value) return;
      await this.tokens.set(t, e.slot, value);
    } else {
      const d = t.defs[Number(e.slot.slice(4))];
      if (d && d.value !== value) await this.tokens.setDef(d, value);
    }
  }

  async remove(name: string, index: number): Promise<void> {
    const d = this.tokens.byName().get(name)?.defs[index];
    if (d) await this.tokens.setDef(d, null);
  }

  async jump(name: string, index: number): Promise<void> {
    const used = this.tokens.usages()[name];
    const u = Array.isArray(used) ? used[index] : undefined;
    if (!u) return;
    this.jumpNote.set("");
    if (!(await this.tokens.jump(u))) this.jumpNote.set(`Nothing on the selected frame's page matches ${u.kind === "css" ? (u.selector ?? u.context) : `that <${u.tag}>`} (${u.file}:${u.line}): it may be on another route or under a false @if.`);
  }
}

