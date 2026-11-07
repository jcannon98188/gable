// The drawer's Matrix tab (TASK-56.22): every Scenario (each scene of each *.scenes.ts file) at each breakpoint as a grid of
// real renders, with Save baseline and a diff against the saved one. The renders are made by the backend in a headless
// browser against the project's own dev server (see src/server/matrix.ts); nothing is simulated, and nothing is written into
// the project. Opening a cell shows the current picture, the baseline, the pixel diff, and the rendered markup's diff with
// gable-ui's code block (a unified diff).
import { computed, effect, html, inject, signal, untracked } from "@gable/core";
import { cellId, type CellKey, type MatrixCell } from "../../../src/matrix.js";
import { UiButton } from "../components/ui/button.js";
import { UiCodeBlock } from "../components/ui/code-block.js";
import { UiToggleGroup } from "../components/ui/toggle-group.js";
import { DesignerState } from "./designer-state.js";
import { MatrixState, STATUS_LABEL, cellText } from "./matrix-state.js";
import "./matrix.css";

const CHIP: Record<MatrixCell["status"], string> = { new: "chip", same: "chip ok", changed: "chip warn", markup: "chip warn", error: "chip err" };
const TAG = (status: MatrixCell["status"]): string => `${CHIP[status]} mx-tag`;

/** What one cell of the grid says, as words (the chip and the aria label). */
export class MatrixPanel {
  static meta = {
    selector: "app-matrix-panel",
    host: { class: "flex h-full min-h-0 flex-col" },
    imports: [UiButton, UiCodeBlock, UiToggleGroup],
    template: html`
      <div class="dbar">
        <label class="dim" for="mx-widths">Breakpoints</label>
        <input id="mx-widths" class="fld mono mx-widths" aria-label="Breakpoint widths in CSS pixels" data-part="mx-widths" [value]="matrix.widths()" (input)="matrix.widths.set($event.currentTarget.value)" />
        <button uiButton size="sm" class="btn sm" data-part="mx-run" [disabled]="!canRun()" (click)="runClicked()">{{ runText() }}</button>
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="mx-save-changed" [disabled]="!canSaveChanged()" (click)="saveChanged()">{{ saveChangedText() }}</button>
        <button uiButton variant="ghost" size="sm" class="btn sm" data-part="mx-save-all" [disabled]="!canSave()" (click)="saveAll()">Save all as baselines</button>
        <button uiButton variant="ghost" size="sm" class="btn sm" data-part="mx-forget" [disabled]="!canForget()" (click)="forgetAll()">Forget baselines</button>
        <span class="spacer"></span>
        @if (counts(); as c) {
          <span class="chip ok" data-part="mx-count-same">{{ c.same }} same</span>
          <span class="chip warn" data-part="mx-count-changed">{{ c.changed }} changed</span>
          <span class="chip" data-part="mx-count-new">{{ c.fresh }} new</span>
          @if (c.markup > 0) {
            <span class="chip warn" data-part="mx-count-markup">{{ c.markup }} markup</span>
          }
          @if (c.error > 0) {
            <span class="chip err" data-part="mx-count-error">{{ c.error }} failed</span>
          }
        }
      </div>
      @if (matrix.error(); as e) {
        <p class="callout err" role="alert" data-part="mx-error">{{ e }}</p>
      }
      @if (note()) {
        <p class="dim pad" data-part="mx-note">{{ note() }}</p>
      }
      <div class="mx" [class.open]="isOpen()">
        <div class="mx-grid" data-part="mx-grid">
          @if (grid(); as g) {
            <div class="mx-table" role="table" aria-label="Scenarios by breakpoint" [style.grid-template-columns]="g.columns">
              <div class="mx-head" role="row">
                <span role="columnheader">Scenario</span>
                @for (h of g.head; track h.width) {
                  <span role="columnheader" data-part="mx-col">{{ h.label }}</span>
                }
              </div>
              @for (row of g.rows; track row.key) {
                <div class="mx-head" role="row" data-part="mx-row" [attr.data-scene]="row.scene">
                  <div class="mx-scene" role="rowheader">
                    {{ row.scene }}
                    <small [attr.title]="row.file">{{ row.sub }}</small>
                  </div>
                  @for (c of row.cells; track c.id) {
                    <button type="button" class="mx-cell" role="cell" data-part="mx-cell" [class.sel]="c.selected" [attr.data-status]="c.status" [attr.data-width]="c.width" [attr.aria-label]="c.text" [attr.title]="c.text" (click)="open(c)">
                      @if (c.image) {
                        <img class="mx-thumb" alt="" [attr.src]="c.image" />
                      } @else {
                        <span class="mx-err">{{ c.error }}</span>
                      }
                      <span [attr.class]="c.chip">{{ c.label }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="empty" data-part="mx-empty">
              <strong>{{ emptyTitle() }}</strong>
              {{ emptyText() }}
            </div>
          }
        </div>
        @if (detail(); as d) {
          <section class="mx-detail" data-part="mx-detail" aria-label="Opened cell">
            <div class="dbar">
              <strong data-part="mx-detail-title">{{ d.title }}</strong>
              <span [attr.class]="d.chip" data-part="mx-detail-status">{{ d.label }}</span>
              <span class="spacer"></span>
              <button uiButton variant="outline" size="sm" class="btn sm" data-part="mx-detail-save" [disabled]="!d.canSave" (click)="saveOpened()">{{ d.saveText }}</button>
              <button uiButton variant="ghost" size="sm" class="btn sm" data-part="mx-detail-frame" (click)="showInFrame()">Show in frame</button>
              <button uiButton variant="ghost" size="sm" class="btn sm icon" aria-label="Close the cell" data-part="mx-detail-close" (click)="matrix.close()">×</button>
            </div>
            <div class="dbar">
              <ui-toggle-group class="seg small" data-part="mx-view" [items]="viewItems()" [(value)]="viewPick" type="single" variant="outline" size="sm"></ui-toggle-group>
              <span class="dim" data-part="mx-detail-note">{{ d.note }}</span>
            </div>
            <div class="mx-body">
              @if (d.image) {
                <img class="mx-shot" data-part="mx-shot" [attr.alt]="d.imageAlt" [attr.src]="d.image" />
              } @else {
                <p class="dim" data-part="mx-shot-none">{{ d.none }}</p>
              }
              @if (d.markupDiff) {
                <h4 class="mx-h">Rendered markup, baseline to current</h4>
                <div data-part="mx-markup-diff">
                  <ui-code-block language="diff" diffLanguage="html" [code]="d.markupDiff" [lineNumbers]="true" [copyable]="false" label="Rendered markup diff"></ui-code-block>
                </div>
              }
            </div>
          </section>
        }
      </div>
    `,
  };
  state = inject(DesignerState);
  matrix = inject(MatrixState);

  /** Loads the backend's last run when the tab is first shown (an MCP run is there too). */
  watch = effect(() => {
    if (this.matrix.visible() && this.state.connection() === "ready") untracked(() => void this.matrix.load());
  });

  run = this.matrix.run;
  busy = this.matrix.busy;
  isOpen = computed(() => this.matrix.selected() !== null);
  hasRun = computed(() => this.run() !== null);
  idle = computed(() => this.busy() === null);
  canRun = computed(() => this.idle() && this.matrix.breakpoints().length > 0 && this.state.project()?.ready === true);
  canSave = computed(() => this.idle() && this.run() !== null && (this.run()!.counts.total - this.run()!.counts.error) > 0);
  canSaveChanged = computed(() => {
    const c = this.run()?.counts;
    return this.idle() && !!c && c.changed + c.new + c.markup > 0;
  });
  canForget = computed(() => this.idle() && (this.run()?.counts.withBaseline ?? 0) > 0);
  runText = computed(() => (this.busy() === "run" ? "Rendering…" : this.hasRun() ? "Run again" : "Run matrix"));
  saveChangedText = computed(() => {
    const c = this.run()?.counts;
    const n = c ? c.changed + c.new + c.markup : 0;
    return n > 0 ? `Save ${n} changed as baselines` : "Save changed as baselines";
  });

  counts = computed(() => {
    const c = this.run()?.counts;
    return c ? { same: c.same, changed: c.changed, fresh: c.new, markup: c.markup, error: c.error } : null;
  });

  note = computed(() => {
    const r = this.run();
    if (!r) return "";
    return `Rendered ${new Date(r.at).toLocaleTimeString()} in ${r.renderer} at ${r.height}px high. ${r.note}`;
  });

  emptyTitle = computed(() => (this.busy() === "run" ? "Rendering every Scenario…" : "The matrix has not been run"));
  emptyText = computed(() =>
    this.busy() === "run"
      ? "Each cell is a fresh render in a headless browser; a few seconds per cell."
      : "Run it to render every Scenario at the breakpoints above, then save the pictures as baselines to see what later edits change.",
  );

  grid = computed(() => {
    const r = this.run();
    if (!r) return null;
    const open = this.matrix.selected();
    const openId = open ? cellId(open) : "";
    return {
      columns: `minmax(90px, 0.6fr) repeat(${r.breakpoints.length}, minmax(0, 1fr))`,
      head: r.breakpoints.map((b) => ({ width: b.width, label: b.name === String(b.width) ? `${b.width}px` : `${b.name} · ${b.width}px` })),
      rows: r.rows.map((row) => ({
        key: `${row.file}|${row.scene}`,
        scene: row.scene,
        file: row.file,
        sub: row.component ?? row.file,
        cells: r.cells
          .filter((c) => c.file === row.file && c.scene === row.scene)
          .map((c) => ({
            id: cellId(c),
            file: c.file,
            scene: c.scene,
            width: c.width,
            status: c.status,
            label: STATUS_LABEL[c.status],
            chip: TAG(c.status),
            image: c.image ?? "",
            error: c.error ?? "",
            text: cellText(c),
            selected: cellId(c) === openId,
          })),
      })),
    };
  });

  viewPick = signal<string[]>(["diff"]);
  /** Keeps the toggle and the service's choice together. */
  #sync = effect(() => {
    const v = this.matrix.view();
    untracked(() => {
      if (this.viewPick()[0] !== v) this.viewPick.set([v]);
    });
  });
  #sync2 = effect(() => {
    const v = this.viewPick()[0];
    if (v === "current" || v === "baseline" || v === "diff") untracked(() => this.matrix.view.set(v));
  });
  viewItems = computed(() => {
    const d = this.matrix.detail();
    return [
      { value: "diff", label: "Diff", disabled: !d?.diff },
      { value: "current", label: "Current", disabled: !d?.current },
      { value: "baseline", label: "Baseline", disabled: !d?.baseline },
    ];
  });

  detail = computed(() => {
    const d = this.matrix.detail();
    if (!d) return null;
    const c = d.cell;
    const view = this.matrix.view();
    const image = view === "diff" ? d.diff : view === "baseline" ? d.baseline : d.current;
    const none = !d.baseline && view !== "current" ? "There is no baseline for this cell yet: save it to have something to compare." : "This cell has no picture (it did not render).";
    const note = d.sizeChange
      ? `Size changed: ${d.sizeChange.from.width}×${d.sizeChange.from.height} to ${d.sizeChange.to.width}×${d.sizeChange.to.height}.`
      : d.baselineSavedAt
        ? `Baseline saved ${new Date(d.baselineSavedAt).toLocaleString()}.`
        : "";
    return {
      title: `${c.scene} at ${c.width}px`,
      chip: CHIP[c.status],
      label: cellText(c).split(": ")[1] ?? STATUS_LABEL[c.status],
      image: image ?? "",
      imageAlt: `${view} picture of ${c.scene} at ${c.width}px`,
      none,
      note,
      markupDiff: d.markupDiff,
      canSave: this.idle() && c.status !== "error" && c.status !== "same",
      saveText: c.status === "new" ? "Save baseline" : "Save as new baseline",
    };
  });

  runClicked(): void {
    void this.matrix.runMatrix().catch(() => undefined);
  }
  saveChanged(): void {
    void this.matrix.save("changed").catch(() => undefined);
  }
  saveAll(): void {
    void this.matrix.save("all").catch(() => undefined);
  }
  forgetAll(): void {
    void this.matrix.forget("all").catch(() => undefined);
  }
  open(c: CellKey): void {
    void this.matrix.open({ file: c.file, scene: c.scene, width: c.width }).catch((e: unknown) => this.matrix.error.set(e instanceof Error ? e.message : String(e)));
  }
  saveOpened(): void {
    const k = this.matrix.selected();
    if (k) void this.matrix.save([k]).catch(() => undefined);
  }
  showInFrame(): void {
    const k = this.matrix.selected();
    if (k) void this.matrix.showInFrame(k).catch((e: unknown) => this.matrix.error.set(e instanceof Error ? e.message : String(e)));
  }
}
