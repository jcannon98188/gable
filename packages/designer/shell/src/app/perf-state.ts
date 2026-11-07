// Performance of the selected frame. The Preview agent reads what the browser measured in the page (perf.ts in the agent);
// this asks for a measurement when the frame (re)loads, after a hot update or a navigation, and on Re-run, which reloads the
// frame first so the load metrics (FCP, LCP, CLS) are of a fresh load. A report always names the page and the moment it was
// taken; nothing is carried over from another page or frame.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import { NO_THROTTLE, throttleLabel, type Throttle } from "../../../src/devices.js";
import type { PerfElement, PerfMetric, PerfRating, PerfReport } from "../../../src/protocol.js";
import { DesignerState } from "./designer-state.js";

/** After the page says `ready`, wait this long before measuring: late images still change LCP, and a hot update comes in bursts. */
const SETTLE_MS = 1000;
/** How long a Re-run waits for the reloaded frame to come back. */
const RELOAD_TIMEOUT_MS = 30000;
/** A call to a frame that reloads meanwhile is never answered: each measurement is bounded. */
const CALL_TIMEOUT_MS = 20000;

const bounded = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("The frame did not answer (it may have reloaded).")), ms);
    p.then((v) => (clearTimeout(timer), ok(v)), (e: unknown) => (clearTimeout(timer), fail(e)));
  });

export function formatMs(ms: number): string {
  return ms >= 10000 ? `${(ms / 1000).toFixed(1)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes} B`;
}

/** A metric's value as shown: `1.24 s`, `0.031`, `512 elements`; an em dash when there is none. */
export function formatMetric(m: Pick<PerfMetric, "value" | "unit">): string {
  if (m.value === null) return "—";
  if (m.unit === "ms") return formatMs(m.value);
  if (m.unit === "score") return m.value.toFixed(3);
  return `${m.value} elements`;
}

export const RATING_LABEL: Record<PerfRating, string> = { good: "good", "needs-improvement": "needs work", poor: "poor" };

/** `<img> in Hero`, or the element's own description when no template renders it. */
export function elementText(e: PerfElement): string {
  return e.node ? `<${e.node.tag}>${e.node.component ? ` in ${e.node.component}` : ""}` : e.label;
}

/** What the tab and MCP say about the frame the numbers were taken in. */
export interface PerfContext {
  frame: string;
  width: number;
  height: number;
  dpr: number;
  throttle: Throttle;
  /** `CPU 4×, Slow 4G`, `none`, or why throttling is unavailable. */
  throttling: string;
  cdp: boolean;
}

/** Said with every report: these are a dev server's numbers. */
export const DEV_NOTE = "Measured on the dev server (unminified modules, the HMR client, no compression): indicative of this page, not of a production build.";

export class PerfState {
  static scope = "root";
  state = inject(DesignerState);

  report = signal<PerfReport | null>(null);
  /** Why the last measurement failed (the frame went away, the agent is older). */
  error = signal<string | null>(null);
  running = signal(false);
  /** Re-run reloaded the frame and is waiting for it to come back. */
  reloading = signal(false);
  /** What the shown report followed: the page load, a hot update, a navigation or Re-run. */
  reason = signal<string>("");

  metrics = computed(() => this.report()?.metrics ?? []);
  poor = computed(() => this.metrics().filter((m) => m.rating === "poor").length);
  needsWork = computed(() => this.metrics().filter((m) => m.rating === "needs-improvement").length);

  context = computed<PerfContext>(() => {
    const frame = this.state.frames.selected();
    const size = frame.size();
    const cdp = this.state.frames.capabilities().cdp;
    const throttle = frame.throttle();
    const error = frame.throttleError();
    const applied = frame.throttleApplied();
    const pending = applied.cpu !== throttle.cpu || applied.network !== throttle.network;
    return {
      frame: frame.config().name,
      width: size.width,
      height: size.height,
      dpr: frame.config().dpr,
      throttle,
      throttling: !cdp ? "unavailable here (needs CDP: the Windows desktop app)" : error ? `failed: ${error}` : pending ? `${throttleLabel(throttle)} (applying…)` : throttleLabel(throttle),
      cdp,
    };
  });

  #timer: ReturnType<typeof setTimeout> | undefined;
  #reloadTimer: ReturnType<typeof setTimeout> | undefined;
  /** A measurement asked for while one ran, and why. */
  #queued: string | null = null;
  #seen = { loads: -1, frame: "", hmr: 0, router: -1 };

  /** Measure again when the selected frame loads or connects, after a hot update, or after a navigation. */
  watch = effect(() => {
    const ready = this.state.connection() === "ready";
    const loads = this.state.loads();
    const frame = this.state.frames.selectedId();
    const hmr = this.state.hmr().at(-1)?.seq ?? 0;
    const router = this.state.routerTick();
    untracked(() => {
      if (!ready) {
        clearTimeout(this.#timer);
        if (!this.reloading()) this.report.set(null);
        return;
      }
      const seen = this.#seen;
      const why = this.reloading() && loads !== seen.loads ? "Re-run" : loads !== seen.loads ? "load" : frame !== seen.frame ? "frame selected" : hmr !== seen.hmr ? "hot update" : router !== seen.router ? "navigation" : "";
      this.#seen = { loads, frame, hmr, router };
      if (why) this.schedule(why);
    });
  });

  schedule(why: string, delay = SETTLE_MS): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.measure(why), delay);
  }

  /** Measures the page as it is now (a second request while one runs is done once, after it). */
  async measure(why = "manual"): Promise<PerfReport | null> {
    clearTimeout(this.#timer);
    if (this.running()) {
      this.#queued = why;
      return null;
    }
    if (this.state.connection() !== "ready") return null;
    // While Re-run reloads the frame, only the measurement of the fresh load counts.
    if (this.reloading() && why !== "Re-run") return null;
    this.running.set(true);
    const frame = this.state.frames.selectedId();
    try {
      const report = await bounded(this.state.preview.call("performance", undefined), CALL_TIMEOUT_MS);
      // The selected frame changed while it ran: that report is of another page.
      if (frame !== this.state.frames.selectedId()) return null;
      this.report.set(report);
      this.reason.set(why);
      this.error.set(null);
      return report;
    } catch (e) {
      if (this.reloading()) return null;
      this.report.set(null);
      this.error.set(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      this.running.set(false);
      if (why === "Re-run") this.#reloaded();
      if (this.#queued) {
        const next = this.#queued;
        this.#queued = null;
        this.schedule(next, 0);
      }
    }
  }

  /** Reloads the selected frame and measures the fresh load (the watch measures once the frame says `ready` again). */
  async rerun(): Promise<void> {
    if (this.state.connection() !== "ready" || this.reloading()) return;
    this.reloading.set(true);
    this.error.set(null);
    clearTimeout(this.#reloadTimer);
    this.#reloadTimer = setTimeout(() => {
      if (!this.reloading()) return;
      this.reloading.set(false);
      this.error.set("The frame did not come back after the reload.");
    }, RELOAD_TIMEOUT_MS);
    try {
      await bounded(this.state.preview.call("reload", undefined), 5000);
    } catch (e) {
      this.#reloaded();
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  #reloaded(): void {
    clearTimeout(this.#reloadTimer);
    this.reloading.set(false);
  }

  /** Waits for the measurement Re-run sets off (for MCP); null if the frame did not come back. */
  async rerunAndWait(): Promise<PerfReport | null> {
    const before = this.report();
    await this.rerun();
    const t0 = Date.now();
    while (Date.now() - t0 < RELOAD_TIMEOUT_MS + 2000) {
      if (!this.reloading() && !this.running()) return this.report() !== before ? this.report() : null;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }

  setThrottle(throttle: Throttle): void {
    void this.state.frames.setThrottle(this.state.frames.selected(), throttle);
  }

  resetThrottle(): void {
    this.setThrottle(NO_THROTTLE);
  }

  /** Selects the metric's element on the canvas, as clicking it there would. */
  select(e: PerfElement | null | undefined): void {
    if (e?.node) void this.state.preview.call("selectNode", { id: e.node.id }).catch(() => undefined);
  }

  hover(e: PerfElement | null | undefined): void {
    this.state.hover(e?.node?.id ?? null);
  }
}
