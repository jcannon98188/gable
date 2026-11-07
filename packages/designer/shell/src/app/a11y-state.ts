// Accessibility checks of the selected frame. The Preview agent runs the checker (axe-core) in the page; this asks for a run
// when the frame connects and after its page changed (components added or removed, a hot update, a navigation), and on
// Re-run. Nothing is cached across pages: a report always names the page it was taken on.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import type { A11yCheck, A11yReport } from "../../../src/protocol.js";
import { DesignerState } from "./designer-state.js";

/** Wait this long after the last change before checking again: a hot update or a navigation comes as a burst of events. */
const SETTLE_MS = 700;

const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/** Violations first, then by impact, then in the checker's order. */
export function sortChecks(checks: readonly A11yCheck[]): A11yCheck[] {
  return checks
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.kind === b.c.kind ? 0 : a.c.kind === "violation" ? -1 : 1) || (IMPACT_ORDER[a.c.impact ?? ""] ?? 4) - (IMPACT_ORDER[b.c.impact ?? ""] ?? 4) || a.i - b.i)
    .map((x) => x.c);
}

export class A11yState {
  static scope = "root";
  state = inject(DesignerState);

  report = signal<A11yReport | null>(null);
  /** Why the last run failed (the checker did not load, the frame went away). */
  error = signal<string | null>(null);
  running = signal(false);
  /** When the shown report was taken. */
  checkedAt = signal<number | null>(null);

  checks = computed(() => sortChecks(this.report()?.checks ?? []));
  violations = computed(() => this.checks().filter((c) => c.kind === "violation").length);
  reviews = computed(() => this.checks().length - this.violations());
  /** The drawer tab's badge is red when anything serious or critical failed. */
  severe = computed(() => this.checks().some((c) => c.kind === "violation" && (c.impact === "serious" || c.impact === "critical")));

  #timer: ReturnType<typeof setTimeout> | undefined;
  #queued = false;

  /** Re-check when the selected frame (re)connects or what it renders changes. */
  watch = effect(() => {
    const ready = this.state.connection() === "ready";
    this.state.frames.selectedId();
    this.state.tree();
    this.state.hmr();
    this.state.routerTick();
    untracked(() => {
      if (ready) this.schedule();
      else {
        clearTimeout(this.#timer);
        this.report.set(null);
        this.checkedAt.set(null);
      }
    });
  });

  schedule(delay = SETTLE_MS): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.run(), delay);
  }

  /** Runs the checks now (a second request while one runs is done once, after it). */
  async run(): Promise<void> {
    clearTimeout(this.#timer);
    if (this.running()) return void (this.#queued = true);
    if (this.state.connection() !== "ready") return;
    this.running.set(true);
    const frame = this.state.frames.selectedId();
    try {
      const report = await this.state.preview.call("a11y", undefined);
      // The selected frame changed while the run was going: that report is of another page.
      if (frame === this.state.frames.selectedId()) {
        this.report.set(report);
        this.checkedAt.set(Date.now());
        this.error.set(null);
      }
    } catch (e) {
      // A report of the page as it was before would be read as the page now.
      this.report.set(null);
      this.checkedAt.set(null);
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.running.set(false);
      if (this.#queued) {
        this.#queued = false;
        this.schedule(0);
      }
    }
  }

  /** Selects the check's element on the canvas, as clicking it there would. */
  select(check: A11yCheck): void {
    if (check.node) void this.state.preview.call("selectNode", { id: check.node.id }).catch(() => undefined);
  }

  hover(check: A11yCheck | null): void {
    this.state.hover(check?.node?.id ?? null);
  }
}
