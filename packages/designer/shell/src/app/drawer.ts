// The bottom drawer: the selected element's source and the last patch, the project's problems, the hot-update timeline,
// accessibility, performance, the network (network-panel.ts) and storage (storage-panel.ts). The tab strip stays when the drawer is closed, so its badges can still be read.
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import { CPU_RATES, NETWORK_PROFILES, type Throttle } from "../../../src/devices.js";
import type { PerfElement, PerfMetric } from "../../../src/protocol.js";
import { UiButton } from "../components/ui/button.js";
import { UiSelect } from "../components/ui/select.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { UiVirtualTable, type VirtualTableColumn } from "../components/ui/virtual-table.js";
import { UiIcon } from "../lib/ui/icon.js";
import { A11yState } from "./a11y-state.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import { SignalTimelineTab } from "./signal-timeline.js";
import { NetworkPanel } from "./network-panel.js";
import { StoragePanel } from "./storage-panel.js";
import { DEV_NOTE, PerfState, RATING_LABEL, elementText, formatBytes, formatMetric, formatMs } from "./perf-state.js";
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

const thresholdText = (m: PerfMetric): string => {
  const f = (v: number) => formatMetric({ value: v, unit: m.unit }).replace(" elements", "");
  return `good ≤ ${f(m.thresholds[0])}, poor > ${f(m.thresholds[1])}`;
};

/** A request's URL without the origin, and without Vite's cache-busting query. */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search && !/^\?(v|t)=/.test(u.search) ? u.search : "");
  } catch {
    return url;
  }
}

/**
 * The selected frame's performance as the browser measured it in the page (Performance Timeline, read by the Preview agent):
 * web-vitals with their ratings, the elements behind LCP and the layout shifts (a click selects one), long tasks, requests,
 * DOM size and what the devtools hook counts. Re-run reloads the frame and measures the fresh load. Not a Lighthouse run.
 */
export class PerformanceTab {
  static meta = {
    selector: "app-performance-tab",
    host: { class: "block" },
    imports: [UiButton, UiSelect, UiTooltip],
    template: html`
      <div class="dbar">
        <span class="chip" [class.err]="perf.poor() > 0" [class.warn]="mixed()" [class.ok]="allGood()" [class.off]="!perf.report()" data-part="perf-status">{{ status() }}</span>
        <span class="dim truncate perf-detail" [attr.title]="detail()">{{ detail() }}</span>
        <span class="spacer"></span>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="perf-rerun" uiTooltip="Reload the frame and measure the fresh load" [disabled]="!canRun()" (click)="perf.rerun()">{{ runLabel() }}</button>
      </div>
      <div class="perf-env">
        <span class="dim truncate" data-part="perf-device" [attr.title]="device()">{{ device() }}</span>
        <span class="spacer"></span>
        @if (ctx().cdp) {
          <span class="dim">CPU</span>
          <!-- TODO(gable-ui): UiSelect has no aria-label input, so these selects are named by the text before them only. -->
          <ui-select triggerClass="fld-select perf-throttle" data-part="perf-cpu" [items]="cpuItems" [(value)]="cpuPick"></ui-select>
          <span class="dim">Network</span>
          <ui-select triggerClass="fld-select perf-throttle" data-part="perf-network" [items]="networkItems" [(value)]="networkPick"></ui-select>
        } @else {
          <span class="chip off" data-part="perf-throttle-off" uiTooltip="CPU and network throttling go through CDP, which only the Windows desktop app has" tabindex="0">Throttling unavailable</span>
        }
      </div>
      @if (perf.error(); as e) {
        <p class="callout err" role="alert">The measurement did not run: {{ e }}</p>
      }
      @if (perf.report()) {
        <p class="callout info" data-part="perf-dev-note">{{ devNote }}</p>
        @for (m of metricRows(); track m.id) {
          <div class="tbl-row perf-row" data-part="perf-metric" [attr.data-metric]="m.id" [attr.data-rating]="m.rating">
            <span class="perf-what"><span>{{ m.label }}</span><span class="dim mono">{{ m.id }}</span></span>
            <span class="mono" data-part="perf-value">{{ m.value }}</span>
            <span><span class="chip" [class.ok]="m.good" [class.warn]="m.warn" [class.err]="m.bad" [class.off]="m.none">{{ m.ratingText }}</span></span>
            <span class="dim truncate" [attr.title]="m.note">{{ m.note }}</span>
            @if (m.elementKey) {
              <button class="chip mono elink" data-part="perf-element" [attr.data-for]="m.id" [attr.aria-current]="m.current" [disabled]="!m.linked" [attr.title]="m.elementTitle" (click)="choose(m.elementKey)" (mouseenter)="hover(m.elementKey)" (mouseleave)="hover(null)">{{ m.element }}</button>
            } @else {
              <span></span>
            }
          </div>
        }
        @if (shiftRows().length) {
          <div class="sec-h">Layout shifts in the CLS window</div>
          @for (s of shiftRows(); track s.key) {
            <div class="tbl-row perf-shift" data-part="perf-shift">
              <span class="mono">{{ s.value }}</span>
              <span class="mono dim">at {{ s.at }}</span>
              <span class="wrap">
                @for (e of s.sources; track e.key) {
                  <button class="chip mono elink" data-part="perf-shift-element" [attr.aria-current]="e.current" [disabled]="!e.linked" [attr.title]="e.title" (click)="choose(e.key)" (mouseenter)="hover(e.key)" (mouseleave)="hover(null)">{{ e.text }}</button>
                }
                @if (s.none) {
                  <span class="dim">the browser named no element</span>
                }
              </span>
            </div>
          }
        }
        <div class="perf-facts">
          @for (g of facts(); track g.title) {
            <div class="perf-fact" [attr.data-part]="g.part">
              <div class="sec-h">{{ g.title }}</div>
              @for (f of g.rows; track f.k) {
                <div class="perf-kv"><span class="dim">{{ f.k }}</span><span class="mono truncate" [attr.title]="f.v">{{ f.v }}</span></div>
              }
            </div>
          }
        </div>
        @if (unsupported()) {
          <p class="callout warn" data-part="perf-unsupported">{{ unsupported() }}</p>
        }
      } @else if (!perf.error()) {
        <div class="empty" data-part="perf-empty"><strong>{{ empty().title }}</strong>{{ empty().text }}</div>
      }
    `,
  };
  perf = inject(PerfState);
  state = inject(DesignerState);
  devNote = DEV_NOTE;
  cpuItems = CPU_RATES.map((r) => ({ value: String(r), label: r === 1 ? "No throttling" : `${r}× slower` }));
  networkItems = [{ value: "none", label: "No throttling" }, ...Object.entries(NETWORK_PROFILES).map(([value, p]) => ({ value, label: p.label }))];
  ctx = this.perf.context;

  // Throttling: the selects follow the selected frame's setting, and a pick sets it.
  cpuPick = signal("1");
  networkPick = signal("none");
  follow = effect(() => {
    const t = this.ctx().throttle;
    untracked(() => (this.cpuPick.set(String(t.cpu)), this.networkPick.set(t.network)));
  });
  apply = effect(() => {
    const cpu = Number(this.cpuPick());
    const network = this.networkPick() as Throttle["network"];
    const t = untracked(() => this.ctx().throttle);
    if (cpu !== t.cpu || network !== t.network) untracked(() => this.perf.setThrottle({ cpu, network }));
  });

  canRun = computed(() => this.state.connection() === "ready" && !this.perf.reloading());
  runLabel = computed(() => (this.perf.reloading() ? "Reloading…" : this.perf.running() ? "Measuring…" : "Re-run"));
  allGood = computed(() => !!this.perf.report() && this.perf.poor() === 0 && this.perf.needsWork() === 0);
  mixed = computed(() => this.perf.poor() === 0 && this.perf.needsWork() > 0);
  status = computed(() => {
    if (!this.perf.report()) return this.perf.reloading() ? "Reloading…" : this.perf.running() ? "Measuring…" : "Not measured";
    const poor = this.perf.poor();
    const work = this.perf.needsWork();
    if (!poor && !work) return "All measured metrics good";
    return [poor ? `${poor} poor` : "", work ? `${work} need${work === 1 ? "s" : ""} work` : ""].filter(Boolean).join(", ");
  });
  detail = computed(() => {
    const r = this.perf.report();
    if (!r) return "";
    return `After ${this.perf.reason() || "load"} · ${r.url} · measured ${formatMs(r.at)} after navigation start`;
  });
  device = computed(() => {
    const c = this.ctx();
    const r = this.perf.report();
    // The page's own viewport, when it is not the frame's (a scrollbar, an emulation that did not apply).
    const d = r?.device;
    const page = d && (d.width !== c.width || d.height !== c.height || d.dpr !== c.dpr) ? ` (the page sees ${d.width} × ${d.height} @${d.dpr}x)` : "";
    return `${c.frame} ${c.width} × ${c.height} @${c.dpr}x${page} · throttling: ${c.throttling}`;
  });

  /** Every element a row can link to, by key. */
  #elements = computed(() => {
    const r = this.perf.report();
    const map = new Map<string, PerfElement>();
    if (!r) return map;
    for (const m of r.metrics) if (m.element) map.set(m.id, m.element);
    r.shifts.forEach((s, i) => s.sources.forEach((e, j) => map.set(`shift:${i}:${j}`, e)));
    return map;
  });
  #link(key: string, e: PerfElement) {
    const picked = this.state.picked()?.node.id;
    return {
      key,
      text: elementText(e),
      linked: !!e.node,
      current: e.node && e.node.id === picked ? "true" : null,
      title: `${e.label}${e.connected ? "" : " (no longer on the page)"}\n${e.node ? "Select this element" : "No template renders this element"}`,
    };
  }

  metricRows = computed(() =>
    this.perf.metrics().map((m) => {
      const link = m.element ? this.#link(m.id, m.element) : null;
      return {
        id: m.id,
        label: m.label,
        value: formatMetric(m),
        rating: m.rating ?? "none",
        ratingText: m.rating ? RATING_LABEL[m.rating] : "n/a",
        good: m.rating === "good",
        warn: m.rating === "needs-improvement",
        bad: m.rating === "poor",
        none: !m.rating,
        note: m.unavailable ?? thresholdText(m),
        elementKey: link?.key ?? "",
        element: link?.text ?? "",
        elementTitle: link?.title ?? "",
        linked: link?.linked ?? false,
        current: link?.current ?? null,
      };
    }),
  );

  shiftRows = computed(() =>
    (this.perf.report()?.shifts ?? []).map((s, i) => ({
      key: `${i}:${s.at}`,
      value: s.value.toFixed(4),
      at: formatMs(s.at),
      sources: s.sources.map((e, j) => this.#link(`shift:${i}:${j}`, e)),
      none: s.sources.length === 0,
    })),
  );

  facts = computed(() => {
    const r = this.perf.report();
    if (!r) return [];
    const groups: Array<{ title: string; part: string; rows: Array<{ k: string; v: string }> }> = [];
    if (r.navigation) {
      const n = r.navigation;
      groups.push({
        title: "Navigation",
        part: "perf-navigation",
        rows: [
          { k: "Type", v: n.type },
          { k: "DOM interactive", v: formatMs(n.domInteractive) },
          { k: "DOMContentLoaded", v: formatMs(n.domContentLoaded) },
          { k: "Load", v: n.load ? formatMs(n.load) : "not finished" },
          { k: "Document", v: formatBytes(n.transferBytes) },
        ],
      });
    }
    if (r.longTasks) {
      const t = r.longTasks;
      groups.push({
        title: "Long tasks",
        part: "perf-long-tasks",
        rows: [
          { k: "Count", v: String(t.count) },
          { k: "Longest", v: t.count ? formatMs(t.longestMs) : "—" },
          { k: "Total", v: formatMs(t.totalMs) },
          ...t.tasks.slice(0, 3).map((x, i) => ({ k: `#${i + 1}`, v: `${formatMs(x.duration)} at ${formatMs(x.at)}` })),
        ],
      });
    }
    if (r.interactions) {
      const w = r.interactions.worst;
      groups.push({
        title: "Interactions",
        part: "perf-interactions",
        rows: [
          { k: "Count", v: String(r.interactions.count) },
          { k: "Slowest", v: w ? `${w.type} ${formatMs(w.duration)}` : "—" },
        ],
      });
    }
    if (r.resources) {
      const x = r.resources;
      groups.push({
        title: "Requests",
        part: "perf-resources",
        rows: [
          { k: "Count", v: `${x.count}${x.designer ? ` (+${x.designer} Designer)` : ""}` },
          { k: "Transferred", v: `${formatBytes(x.transferBytes)}${x.unsized ? ` (${x.unsized} unsized)` : ""}` },
          { k: "Decoded", v: formatBytes(x.decodedBytes) },
          { k: "By type", v: x.byType.map((b) => `${b.type} ${b.count}`).join(", ") || "—" },
          ...x.slowest.slice(0, 3).map((s, i) => ({ k: `Slowest #${i + 1}`, v: `${formatMs(s.duration)} ${shortUrl(s.name)}` })),
        ],
      });
    }
    groups.push({
      title: "DOM",
      part: "perf-dom",
      rows: [
        { k: "Elements", v: String(r.dom.elements) },
        { k: "Depth", v: String(r.dom.depth) },
        { k: "Most children", v: String(r.dom.maxChildren) },
      ],
    });
    if (r.gable) {
      const g = r.gable;
      const hot = g.lastHotUpdate;
      groups.push({
        title: "Gable",
        part: "perf-gable",
        rows: [
          { k: "First component tree", v: g.firstTree === null ? "—" : formatMs(g.firstTree) },
          { k: "Signal flushes", v: String(g.flushes) },
          { k: "Effect runs", v: `${g.effectRuns} (${formatMs(g.effectMs)})` },
          { k: "Slowest flush", v: g.slowestFlush ? `${g.slowestFlush.ms.toFixed(1)} ms${g.slowestFlush.effect ? ` · ${g.slowestFlush.effect}` : ""}` : "—" },
          { k: "Last hot update", v: hot ? `${hot.status}, next frame ${hot.toFrameMs === null ? "pending" : formatMs(hot.toFrameMs)} after it applied` : "none since load" },
        ],
      });
    }
    return groups;
  });

  unsupported = computed(() => {
    const u = this.perf.report()?.unsupported ?? [];
    return u.length ? `This engine does not report ${u.join(", ")} entries; the metrics that need them show n/a, not zero.` : "";
  });

  empty = computed(() => {
    if (this.state.connection() !== "ready") return { title: "No page to measure", text: "The selected frame's page is measured once it is connected." };
    if (this.perf.reloading()) return { title: "Reloading…", text: "The frame is reloading; its fresh load is measured when it is back." };
    return { title: "Measuring…", text: "The Preview agent reads what the browser measured once the page has loaded and painted." };
  });

  choose(key: string): void {
    this.perf.select(this.#elements().get(key));
  }
  hover(key: string | null): void {
    this.perf.hover(key ? this.#elements().get(key) : null);
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
  perf = inject(PerfState);
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
      { value: "state", label: "State timeline", badge: 0, err: false, warn: false },
      { value: "a11y", label: "Accessibility", badge: this.a11y.violations(), err: this.a11y.severe(), warn: !this.a11y.severe() && this.a11y.violations() > 0 },
      { value: "perf", label: "Performance", badge: this.perf.poor() + this.perf.needsWork(), err: this.perf.poor() > 0, warn: this.perf.poor() === 0 && this.perf.needsWork() > 0 },
      { value: "http", label: "Network", badge: 0, err: false, warn: false },
      { value: "storage", label: "Storage", badge: 0, err: false, warn: false },
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
    imports: [DrawerTabs, CodeTab, ProblemsTab, HmrTab, SignalTimelineTab, AccessibilityTab, PerformanceTab, NetworkPanel, StoragePanel],
    template: html`
      <app-drawer-tabs></app-drawer-tabs>
      <div class="dbody" role="tabpanel" [attr.aria-labelledby]="labelledBy()">
        @if (tab() === 'problems') {
          <app-problems-tab></app-problems-tab>
        } @else if (tab() === 'hmr') {
          <app-hmr-tab></app-hmr-tab>
        } @else if (tab() === 'state') {
          <app-signal-timeline></app-signal-timeline>
        } @else if (tab() === 'a11y') {
          <app-accessibility-tab></app-accessibility-tab>
        } @else if (tab() === 'perf') {
          <app-performance-tab></app-performance-tab>
        } @else if (tab() === 'http') {
          <app-network-panel></app-network-panel>
        } @else if (tab() === 'storage') {
          <app-storage-panel></app-storage-panel>
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
