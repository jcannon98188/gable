// The bottom drawer: the selected element's source and the last patch, the project's problems, the hot-update timeline,
// accessibility, and the mocked HTTP traffic. The tab strip stays when the drawer is closed, so its badges can still be read.
import { computed, html, inject, signal } from "@gable/core";
import { UiButton } from "../components/ui/button.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiVirtualTable, type VirtualTableColumn } from "../components/ui/virtual-table.js";
import { UiIcon } from "../lib/ui/icon.js";
import { A11yState } from "./a11y-state.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import { HttpPanel } from "./page-mode.js";
import { staleNote } from "./stale-canvas.js";

/** The selected element's source on the left; what the last edit did on the right. */
export class CodeTab {
  static meta = {
    selector: "app-code-tab",
    host: { class: "block h-full" },
    imports: [UiButton],
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
              <div>{{ l.label }} <span class="mono"><span class="diff-add">+{{ l.added }}</span> <span class="diff-del">−{{ l.removed }}</span></span></div>
              <div class="mono dim">{{ l.file }}</div>
            </div>
            @if (diffRows().length > 0) {
              <pre class="code diff" data-part="patch-diff" aria-label="Unified diff of the last patch"><!--
                -->@for (r of diffRows(); track r.key) {<span class="ln" [class.add]="r.add" [class.del]="r.del" [class.hunk]="r.hunk"><span class="n">{{ r.old }}</span><span class="n">{{ r.new }}</span>{{ r.text }}</span>}</pre>
            } @else {
              <p class="pad dim">The patch left every line as it was.</p>
            }
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
    const item = this.edit.history().last;
    return item
      ? { label: item.label, file: this.state.relative(item.file), stale: item.stale, state: item.stale ? "file changed" : "applied", added: item.diff.added, removed: item.diff.removed }
      : null;
  });
  /** The unified diff, one row per line: hunk headers, then context, removed and added lines with their old and new numbers. */
  diffRows = computed(() => {
    const diff = this.edit.history().last?.diff;
    if (!diff) return [];
    return diff.hunks.flatMap((h, i) => [
      { key: `${i}@`, add: false, del: false, hunk: true, old: "", new: "", text: h.header },
      ...h.lines.map((l, j) => ({ key: `${i}:${j}`, add: l.kind === "+", del: l.kind === "-", hunk: false, old: l.old ?? "", new: l.new ?? "", text: l.kind + l.text })),
    ]);
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
      @if (fixable().length) {
        <!-- TODO(gable-ui): UiVirtualTable cells cannot hold buttons, so the quick fixes get their own strip above the table. -->
        <div class="fixes" aria-label="Quick fixes" data-part="quick-fixes">
          @for (f of fixable(); track f.key) {
            <div class="tbl-row fix-row">
              <span class="chip" [class.err]="f.error" [class.warn]="!f.error">{{ f.rule }}</span>
              <span class="truncate" [attr.title]="f.message">{{ f.message }}</span>
              <span class="mono dim truncate">{{ f.where }}</span>
              <button uiButton variant="outline" size="sm" class="btn sm" data-part="problem-fix" [attr.data-problem]="f.id" [attr.aria-label]="f.label" [disabled]="edit.busy()" (click)="edit.fix(f.id, 0)">Fix: {{ f.title }}</button>
            </div>
          }
        </div>
      }
      @if (none()) {
        <div class="empty"><strong>{{ noneTitle() }}</strong>{{ noneText() }}</div>
      } @else {
        <ui-virtual-table class="min-h-0 flex-1" [columns]="columns" [rows]="rows()" rowKey="id" [rowHeight]="28" label="Problems"></ui-virtual-table>
      }
    `,
  };
  state = inject(DesignerState);
  edit = inject(EditState);
  columns = PROBLEM_COLUMNS;
  filter = signal("all");
  /** The shown problems the language service has a quick fix for (applied as one undoable edit). */
  fixable = computed(() => {
    const f = this.filter();
    return this.all()
      .filter((d) => d.fixes?.length && (f === "all" || (f === "error" ? d.severity === "error" : d.severity !== "error")))
      .slice(0, 30)
      .map((d) => ({
        key: d.id + ":" + d.line + ":" + d.column,
        id: d.id,
        error: d.severity === "error",
        rule: d.rule,
        message: d.message,
        where: `${this.state.relative(d.file)}:${d.line}`,
        title: d.fixes![0]!.title,
        label: `${d.fixes![0]!.title} (${this.state.relative(d.file)}:${d.line})`,
      }));
  });
  all = this.state.problems;
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
      @if (state.stale(); as st) {
        <p class="callout err" data-part="hmr-stale"><span class="mono">{{ st.where }}</span> · {{ st.message }} {{ staleNote() }}</p>
      }
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
  staleNote = computed(() => {
    const s = this.state.stale();
    return s ? staleNote(s) : "";
  });
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

/**
 * What the Preview agent's checker (axe-core) found on the selected frame's page: one row per element and rule, failures
 * first. A row selects its element on the canvas. Checks the checker could not decide are listed as "review", never as passed.
 */
export class AccessibilityTab {
  static meta = {
    selector: "app-accessibility-tab",
    host: { class: "block" },
    imports: [UiButton, UiTooltip],
    template: html`
      <div class="dbar">
        <span class="chip" [class.err]="a11y.violations() > 0" [class.ok]="passedAll()" [class.off]="!a11y.report()" data-part="a11y-status">{{ status() }}</span>
        @if (a11y.reviews() > 0) {
          <span class="chip warn" uiTooltip="The checker could not decide these; look at them yourself" tabindex="0">{{ a11y.reviews() }} to review</span>
        }
        <span class="dim">{{ detail() }}</span>
        <span class="spacer"></span>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="a11y-rerun" [disabled]="!canRun()" (click)="a11y.run()">{{ runLabel() }}</button>
      </div>
      @if (a11y.error(); as e) {
        <p class="callout err" role="alert">The checks did not run: {{ e }}</p>
      }
      @for (r of rows(); track r.id) {
        <div class="tbl-row a11y-row" data-part="a11y-row" [attr.data-rule]="r.rule" [attr.aria-current]="r.current" (click)="choose(r.id)" (mouseenter)="hover(r.id)" (mouseleave)="hover(null)">
          <span class="chip" [class.err]="r.err" [class.warn]="r.warn">{{ r.impact }}</span>
          <span class="a11y-what">
            <span><span class="mono" [attr.title]="r.helpUrl">{{ r.rule }}</span> · {{ r.help }}</span>
            <span class="dim">{{ r.summary }}</span>
          </span>
          <button class="chip mono elink" data-part="a11y-element" [disabled]="!r.linked" [attr.title]="r.elementTitle">{{ r.element }}</button>
        </div>
      }
      @if (empty(); as e) {
        <div class="empty"><strong>{{ e.title }}</strong>{{ e.text }}</div>
      }
    `,
  };
  a11y = inject(A11yState);
  state = inject(DesignerState);
  canRun = computed(() => this.state.connection() === "ready" && !this.a11y.running());
  runLabel = computed(() => (this.a11y.running() ? "Checking…" : "Re-run"));
  passedAll = computed(() => !!this.a11y.report() && this.a11y.checks().length === 0);
  status = computed(() => {
    if (!this.a11y.report()) return this.a11y.running() ? "Checking…" : "Not checked";
    const n = this.a11y.violations();
    return n === 0 ? "No violations" : `${n} violation${n === 1 ? "" : "s"}`;
  });
  detail = computed(() => {
    const r = this.a11y.report();
    if (!r) return "";
    const off = r.skipped.length ? `, ${r.skipped.length} page rules off in component mode` : "";
    return `${r.engine}: ${r.rules} rules, ${r.passed} passed${off} · ${r.url} · ${r.ms} ms`;
  });
  rows = computed(() => {
    const picked = this.state.picked()?.node.id;
    return this.a11y.checks().map((c) => ({
      id: c.id,
      rule: c.rule,
      help: c.help,
      helpUrl: c.helpUrl,
      summary: c.summary,
      impact: c.kind === "review" ? "review" : (c.impact ?? "issue"),
      err: c.kind === "violation" && (c.impact === "critical" || c.impact === "serious"),
      warn: c.kind === "review" || (c.impact !== "critical" && c.impact !== "serious"),
      linked: !!c.node,
      element: c.node ? `<${c.node.tag}>${c.node.component ? ` in ${c.node.component}` : ""}` : "not in a template",
      elementTitle: c.node ? `${c.html}\nSelect this element` : `${c.html}\nNo template renders this element (${c.selector})`,
      current: c.node && c.node.id === picked ? "true" : null,
    }));
  });
  empty = computed(() => {
    if (this.a11y.checks().length > 0 || this.a11y.error()) return null;
    if (this.state.connection() !== "ready") return { title: "No page to check", text: "The checks run in the selected frame once its page is connected." };
    if (!this.a11y.report()) return { title: "Checking…", text: "The Preview agent is running the checker on this page." };
    return { title: "No violations found", text: "Every rule that applies passed on this page as it is rendered now. Automated checks catch only part of the problems; keyboard and screen reader use still need a person." };
  });
  #byId = (id: string) => this.a11y.checks().find((c) => c.id === id) ?? null;
  choose(id: string): void {
    const c = this.#byId(id);
    if (c) this.a11y.select(c);
  }
  hover(id: string | null): void {
    this.a11y.hover(id ? this.#byId(id) : null);
  }
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
  a11y = inject(A11yState);
  open = this.chrome.drawerOpen;
  closed = computed(() => !this.chrome.drawerOpen());
  toggleText = computed(() => (this.chrome.drawerOpen() ? "Collapse the drawer" : "Open the drawer"));
  toggleIcon = computed(() => (this.chrome.drawerOpen() ? "panel-bottom-close" : "panel-bottom-open"));
  tabs = computed(() => {
    const diagnostics = this.state.problems();
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const problems = diagnostics.length;
    const current = this.chrome.drawerOpen() ? this.chrome.drawerTab() : "";
    return [
      { value: "code", label: "Code", badge: 0, err: false, warn: false },
      { value: "problems", label: "Problems", badge: problems, err: errors > 0, warn: errors === 0 && problems > 0 },
      { value: "hmr", label: "HMR timeline", badge: 0, err: false, warn: false },
      { value: "a11y", label: "Accessibility", badge: this.a11y.violations(), err: this.a11y.severe(), warn: !this.a11y.severe() && this.a11y.violations() > 0 },
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
