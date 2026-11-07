// The bottom drawer: the selected element's source and the last patch, the project's problems, the hot-update timeline,
// accessibility, and the mocked HTTP traffic. The tab strip stays when the drawer is closed, so its badges can still be read.
import { computed, html, inject, signal } from "@gable/core";
import { UiButton } from "../components/ui/button.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiVirtualTable, type VirtualTableColumn } from "../components/ui/virtual-table.js";
import { UiIcon } from "../lib/ui/icon.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import { HttpPanel } from "./page-mode.js";

/** The selected element's source on the left; what the last edit did on the right. */
export class CodeTab {
  static meta = {
    selector: "app-code-tab",
    host: { class: "block h-full" },
    imports: [UiButton, UiTooltip],
    template: html`
      <div class="split">
        <div>
          @if (source(); as s) {
            <div class="dbar">
              <span class="chip on mono">{{ s.file }}</span>
              <span class="dim mono">lines {{ s.lines }}</span>
            </div>
            <pre class="code" aria-label="Source of the selected element"><!--
              -->@for (l of s.rows; track l.n) {<span class="ln"><span class="n">{{ l.n }}</span>{{ l.text }}</span>}</pre>
          } @else {
            <div class="empty"><strong>No source to show</strong>{{ noSource() }}</div>
          }
        </div>
        <div>
          <div class="dbar">
            <strong>Last patch</strong>
            @if (last(); as l) {
              <span class="chip" [class.ok]="!l.stale" [class.warn]="l.stale">{{ l.state }}</span>
            }
            <span class="spacer"></span>
            <button uiButton variant="outline" size="sm" class="btn sm" [disabled]="!edit.canUndo()" (click)="edit.undo()">Undo patch</button>
            <button uiButton variant="outline" size="sm" class="btn sm" [disabled]="!edit.canRedo()" (click)="edit.redo()">Redo</button>
          </div>
          @if (last(); as l) {
            <div class="pad patch">
              <div>{{ l.label }}</div>
              <div class="mono dim">{{ l.file }}</div>
              <p class="dim" uiTooltip="The backend applies patches but does not return them yet">The patch itself is not shown yet: the backend does not return its diff.</p>
            </div>
          } @else {
            <div class="empty">Edits made here are written to the source. The latest one appears here, with Undo.</div>
          }
          @if (edit.external().length > 0) {
            <p class="callout warn" role="status">Edited outside the Designer: {{ externalText() }}. Undo still works where it can find its place.</p>
          }
        </div>
      </div>
    `,
  };
  state = inject(DesignerState);
  edit = inject(EditState);
  source = computed(() => {
    const s = this.state.picked()?.source;
    if (!s || "error" in s) return null;
    return {
      file: this.state.relative(s.file),
      lines: `${s.from.line}–${s.to.line}`,
      rows: s.text.split("\n").map((text, i) => ({ n: s.from.line + i, text })),
    };
  });
  noSource = computed(() => {
    const s = this.state.picked()?.source;
    if (s && "error" in s) return s.error;
    return this.state.picked() ? "Locating this element in the source…" : "Select an element on the canvas to see where it is written.";
  });
  last = computed(() => {
    const undo = this.edit.history().undo;
    const item = undo[undo.length - 1];
    return item ? { label: item.label, file: this.state.relative(item.file), stale: item.stale, state: item.stale ? "file changed" : "applied" } : null;
  });
  externalText = computed(() => this.edit.external().join(", "));
}

const PROBLEM_COLUMNS: VirtualTableColumn[] = [
  { key: "severity", label: "Severity", width: "80px" },
  { key: "message", label: "Message", width: "minmax(0, 1fr)" },
  { key: "rule", label: "Rule", width: "180px" },
  { key: "where", label: "Location", width: "260px" },
];

/** Language-service diagnostics, with how many are shown on the canvas. */
export class ProblemsTab {
  static meta = {
    selector: "app-problems-tab",
    host: { class: "flex h-full flex-col" },
    imports: [UiButton, UiTooltip, UiVirtualTable],
    template: html`
      <div class="dbar">
        @for (f of filterChips(); track f.value) {
          <button class="chip" [class.on]="f.on" [attr.aria-pressed]="f.pressed" [attr.data-problems-filter]="f.value" (click)="filter.set(f.value)">{{ f.label }}</button>
        }
        <span class="dim">{{ summary() }}</span>
        <span class="spacer"></span>
        <button uiButton variant="outline" size="sm" class="btn sm" uiTooltip="Run the language service again" (click)="state.refreshDiagnostics()">Refresh</button>
      </div>
      @for (e of configErrors(); track e) {
        <p class="callout err">{{ e }}</p>
      }
      @if (none()) {
        <div class="empty"><strong>{{ noneTitle() }}</strong>{{ noneText() }}</div>
      } @else {
        <ui-virtual-table class="min-h-0 flex-1" [columns]="columns" [rows]="rows()" rowKey="id" [rowHeight]="28" label="Problems"></ui-virtual-table>
      }
    `,
  };
  state = inject(DesignerState);
  columns = PROBLEM_COLUMNS;
  filter = signal("all");
  all = computed(() => this.state.analysis()?.diagnostics ?? []);
  errors = computed(() => this.all().filter((d) => d.severity === "error").length);
  warnings = computed(() => this.all().length - this.errors());
  filterChips = computed(() =>
    [
      { value: "all", label: `All ${this.all().length}` },
      { value: "error", label: `Errors ${this.errors()}` },
      { value: "warning", label: `Warnings ${this.warnings()}` },
    ].map((f) => ({ ...f, on: f.value === this.filter(), pressed: String(f.value === this.filter()) })),
  );
  rows = computed(() => {
    const f = this.filter();
    return this.all()
      .filter((d) => f === "all" || (f === "error" ? d.severity === "error" : d.severity !== "error"))
      .map((d) => ({ id: d.id, severity: d.severity, message: d.message, rule: d.rule, where: `${this.state.relative(d.file)}:${d.line}:${d.column}` }));
  });
  none = computed(() => this.rows().length === 0);
  noneTitle = computed(() => (this.state.analysis() ? "No problems" : "Analyzing…"));
  noneText = computed(() => (this.state.analysis() ? "The language service found nothing here." : "The language service is reading the project."));
  configErrors = computed(() => this.state.analysis()?.configErrors ?? []);
  summary = computed(() => {
    if (!this.state.analysis()) return "Analyzing…";
    return `${this.state.placement().placed} shown on the canvas`;
  });
}

const KIND: Record<string, { label: string; warn: boolean }> = {
  patch: { label: "patch", warn: false },
  view: { label: "view swap", warn: false },
  resetup: { label: "re-setup", warn: true },
};

/** One row per hot update, with what it did to each changed class: patch (state kept), view swap (template replaced) or re-setup (instance rebuilt). */
export class HmrTab {
  static meta = {
    selector: "app-hmr-tab",
    host: { class: "block" },
    imports: [UiButton],
    template: html`
      <div class="dbar">
        <span class="dim">{{ summary() }}</span>
        <span class="spacer"></span>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="hmr-clear" [disabled]="none()" (click)="clear()">Clear</button>
      </div>
      @if (hasResetup()) {
        <p class="callout warn">A re-setup rebuilt a component, so that component's signals started over.</p>
      }
      @for (e of entries(); track e.seq) {
        <div class="tbl-row hmr-row">
          <span class="mono dim">{{ e.time }}</span>
          <span class="mono truncate" [attr.title]="e.modules">{{ e.modules }}</span>
          <span class="wrap">
            @for (c of e.changes; track c.name) {
              <span class="chip" [class.warn]="c.warn" [attr.title]="c.name">{{ c.label }} · {{ c.name }}</span>
            }
            @if (e.status !== 'ok') {
              <span class="chip err">{{ e.status }}</span>
            }
          </span>
        </div>
        @for (err of e.errors; track err) {
          <p class="callout err">{{ err }}</p>
        }
      }
      @if (none()) {
        <div class="empty"><strong>No hot updates yet</strong>Edit a source file and the hot updates appear here.</div>
      }
    `,
  };
  state = inject(DesignerState);
  /** Clearing is local to this view: everything up to this sequence number is hidden. */
  clearedTo = signal(-1);
  entries = computed(() =>
    [...this.state.hmr()]
      .filter((e) => e.seq > this.clearedTo())
      .reverse()
      .map((e) => ({
        seq: e.seq,
        status: e.status,
        time: `${(e.at / 1000).toFixed(1)}s`,
        modules: e.modules.join(", "),
        errors: e.errors,
        changes: e.changes.map((c) => ({ name: c.name, label: KIND[c.kind]?.label ?? c.kind, warn: KIND[c.kind]?.warn ?? false })),
      })),
  );
  none = computed(() => this.entries().length === 0);
  hasResetup = computed(() => this.entries().some((e) => e.changes.some((c) => c.warn)));
  summary = computed(() => {
    const n = this.entries().length;
    return n === 0 ? "Nothing since the last clear" : `${n} update${n === 1 ? "" : "s"}, newest first`;
  });
  clear(): void {
    const all = this.state.hmr();
    this.clearedTo.set(all[all.length - 1]?.seq ?? -1);
  }
}

/** Honest about what is missing: no checks run yet, so this says that instead of implying the page passed. */
export class AccessibilityTab {
  static meta = {
    selector: "app-accessibility-tab",
    host: { class: "block" },
    imports: [UiButton, UiTooltip],
    template: html`
      <div class="dbar">
        <span class="chip off" uiTooltip="Needs a checker running in the preview agent" tabindex="0">Not checked</span>
        <span class="spacer"></span>
        <span uiTooltip="Accessibility checks are not available yet" tabindex="0"><button uiButton variant="outline" size="sm" class="btn sm" disabled>Re-run</button></span>
      </div>
      <div class="empty">
        <strong>Accessibility checks are not available yet</strong>
        The Designer has no checker to run against the canvas, so nothing here means this page passed.
      </div>
    `,
  };
}

/** The tab strip and the open tab. */
export class DrawerTabs {
  static meta = {
    selector: "app-drawer-tabs",
    host: { class: "block" },
    imports: [UiIcon, UiTooltip],
    template: html`
      <div class="dtabs" [class.collapsed]="closed()" role="tablist" aria-label="Drawer">
        @for (t of tabs(); track t.value) {
          <button role="tab" [attr.aria-selected]="t.selected" [attr.id]="t.tabId" (click)="choose(t.value)">
            {{ t.label }}
            @if (t.badge) {
              <span class="count" [class.err]="t.err" [class.warn]="t.warn">{{ t.badge }}</span>
            }
          </button>
        }
        <span class="spacer"></span>
        <button class="btn-plain" [uiTooltip]="toggleText()" [attr.aria-label]="toggleText()" [attr.aria-expanded]="open()" (click)="chrome.toggleDrawer()">
          <svg [uiIcon]="toggleIcon()" class="ico"></svg>
        </button>
      </div>
    `,
  };
  state = inject(DesignerState);
  chrome = inject(ChromeState);
  open = this.chrome.drawerOpen;
  closed = computed(() => !this.chrome.drawerOpen());
  toggleText = computed(() => (this.chrome.drawerOpen() ? "Collapse the drawer" : "Open the drawer"));
  toggleIcon = computed(() => (this.chrome.drawerOpen() ? "panel-bottom-close" : "panel-bottom-open"));
  tabs = computed(() => {
    const diagnostics = this.state.analysis()?.diagnostics ?? [];
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const problems = diagnostics.length;
    const current = this.chrome.drawerOpen() ? this.chrome.drawerTab() : "";
    return [
      { value: "code", label: "Code", badge: 0, err: false, warn: false },
      { value: "problems", label: "Problems", badge: problems, err: errors > 0, warn: errors === 0 && problems > 0 },
      { value: "hmr", label: "HMR timeline", badge: 0, err: false, warn: false },
      { value: "a11y", label: "Accessibility", badge: 0, err: false, warn: false },
      { value: "http", label: "HTTP", badge: 0, err: false, warn: false },
    ].map((t) => ({ ...t, selected: String(t.value === current), tabId: `drawer-tab-${t.value}` }));
  });
  /** Clicking the open tab closes the drawer; any other tab opens it there. */
  choose(tab: string): void {
    if (this.chrome.drawerOpen() && this.chrome.drawerTab() === tab) this.chrome.setDrawer(false);
    else this.chrome.showDrawer(tab);
  }
}

/** The open drawer's body. Only the selected tab is built. */
export class DrawerBody {
  static meta = {
    selector: "app-drawer-body",
    host: { class: "drawer" },
    imports: [DrawerTabs, CodeTab, ProblemsTab, HmrTab, AccessibilityTab, HttpPanel],
    template: html`
      <app-drawer-tabs></app-drawer-tabs>
      <div class="dbody" role="tabpanel" [attr.aria-labelledby]="labelledBy()">
        @if (tab() === 'problems') {
          <app-problems-tab></app-problems-tab>
        } @else if (tab() === 'hmr') {
          <app-hmr-tab></app-hmr-tab>
        } @else if (tab() === 'a11y') {
          <app-accessibility-tab></app-accessibility-tab>
        } @else if (tab() === 'http') {
          <app-http-panel></app-http-panel>
        } @else {
          <app-code-tab></app-code-tab>
        }
      </div>
    `,
  };
  chrome = inject(ChromeState);
  tab = this.chrome.drawerTab;
  labelledBy = computed(() => `drawer-tab-${this.chrome.drawerTab()}`);
}
