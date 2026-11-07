// The Preview agent's performance metrics: what the browser itself measured in the page (Performance Timeline), turned into
// the web-vitals numbers with their ratings, and tied back to template nodes where a metric names an element (LCP, layout
// shift sources, the slowest interaction's target). Nothing is simulated: an entry type the engine does not report makes
// its metric unavailable, not zero. The numbers come from a dev server (unminified modules, HMR client, no compression),
// so they are indicative of the page, not of a production build.
import type { DesignNode } from "@gable/core/designer";
import type { PerfElement, PerfMetric, PerfMetricId, PerfRating, PerfReport, PerfShift } from "../protocol.js";

/** Good at or below the first, poor above the second: web-vitals for FCP, LCP, CLS, INP and TTFB; Lighthouse for TBT and DOM size. */
export const THRESHOLDS: Record<PerfMetricId, [number, number]> = {
  ttfb: [800, 1800],
  fcp: [1800, 3000],
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  inp: [200, 500],
  tbt: [200, 600],
  dom: [800, 1400],
};

export function rate(id: PerfMetricId, value: number): PerfRating {
  const [good, poor] = THRESHOLDS[id];
  return value <= good ? "good" : value <= poor ? "needs-improvement" : "poor";
}

/** The entry types the collector observes. */
export const ENTRY_TYPES = ["navigation", "paint", "largest-contentful-paint", "layout-shift", "longtask", "event", "first-input", "resource"] as const;

/** A long task blocks input for whatever it runs past this. */
const BLOCKING_MS = 50;

// --- pure parts (unit tested with plain objects) -------------------------------------------------------------------------

export interface ShiftLike {
  readonly startTime: number;
  readonly value: number;
  readonly hadRecentInput: boolean;
}

/**
 * CLS as web-vitals defines it: shifts not caused by recent input are grouped into session windows (a gap under 1 s, a
 * window under 5 s), and CLS is the largest window's sum. Returns that window's shifts too.
 */
export function clsOf<S extends ShiftLike>(shifts: readonly S[]): { value: number; window: S[] } {
  let best: { value: number; window: S[] } = { value: 0, window: [] };
  let current: S[] = [];
  let sum = 0;
  for (const s of [...shifts].filter((s) => !s.hadRecentInput).sort((a, b) => a.startTime - b.startTime)) {
    const first = current[0];
    const last = current[current.length - 1];
    if (first && last && s.startTime - last.startTime < 1000 && s.startTime - first.startTime < 5000) {
      current.push(s);
      sum += s.value;
    } else {
      current = [s];
      sum = s.value;
    }
    if (sum > best.value) best = { value: sum, window: [...current] };
  }
  return best;
}

export interface EventLike {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly interactionId?: number;
}

/**
 * INP: each interaction counts as its longest event; INP is the worst, or, past 50 interactions, the 98th percentile
 * (one worst interaction is skipped per 50). Null without interactions.
 */
export function inpOf<E extends EventLike>(events: readonly E[]): { value: number; count: number; worst: E } | null {
  const byInteraction = new Map<number, E>();
  for (const e of events) {
    if (!e.interactionId) continue;
    const seen = byInteraction.get(e.interactionId);
    if (!seen || e.duration > seen.duration) byInteraction.set(e.interactionId, e);
  }
  const sorted = [...byInteraction.values()].sort((a, b) => b.duration - a.duration);
  if (sorted.length === 0) return null;
  const pick = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))]!;
  return { value: pick.duration, count: sorted.length, worst: pick };
}

export interface TaskLike {
  startTime: number;
  duration: number;
}

/**
 * Total blocking time: what each long task runs past 50 ms, counted from FCP (a task that straddles FCP counts only its
 * part after it) up to the measurement. Lighthouse stops at TTI; there is no TTI here, so it runs to `until`.
 */
export function blockingTime(tasks: readonly TaskLike[], fcp: number, until = Infinity): number {
  let total = 0;
  for (const t of tasks) {
    const end = Math.min(t.startTime + t.duration, until);
    if (end <= fcp || t.startTime >= until) continue;
    const blocking = t.duration - BLOCKING_MS;
    if (blocking <= 0) continue;
    total += t.startTime < fcp ? Math.min(blocking, end - fcp) : Math.min(blocking, end - t.startTime);
  }
  return total;
}

export interface ResourceLike {
  name: string;
  initiatorType: string;
  duration: number;
  transferSize?: number;
  decodedBodySize?: number;
}

/** Count, bytes, a split by initiator and the slowest requests; the Designer's own requests (`isDesigner`) are counted apart. */
export function resourceSummary(entries: readonly ResourceLike[], isDesigner: (url: string) => boolean): NonNullable<PerfReport["resources"]> {
  const own = entries.filter((e) => !isDesigner(e.name));
  const byType = new Map<string, { type: string; count: number; transferBytes: number }>();
  let transferBytes = 0;
  let decodedBytes = 0;
  let unsized = 0;
  for (const e of own) {
    const transfer = e.transferSize ?? 0;
    transferBytes += transfer;
    decodedBytes += e.decodedBodySize ?? 0;
    if (!transfer) unsized++;
    const type = e.initiatorType || "other";
    const t = byType.get(type) ?? { type, count: 0, transferBytes: 0 };
    t.count++;
    t.transferBytes += transfer;
    byType.set(type, t);
  }
  return {
    count: own.length,
    transferBytes,
    decodedBytes,
    unsized,
    designer: entries.length - own.length,
    byType: [...byType.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    slowest: [...own]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5)
      .map((e) => ({ name: e.name, type: e.initiatorType || "other", duration: round(e.duration), transferBytes: e.transferSize ?? 0 })),
  };
}

/** Element count (the Designer's overlay left out), deepest nesting and the most children of one element. */
export function domSize(root: Element, skip: (el: Element) => boolean): PerfReport["dom"] {
  let elements = 0;
  let depth = 0;
  let maxChildren = 0;
  const stack: Array<[Element, number]> = [[root, 1]];
  while (stack.length) {
    const [el, d] = stack.pop()!;
    if (skip(el)) continue;
    elements++;
    if (d > depth) depth = d;
    if (el.childElementCount > maxChildren) maxChildren = el.childElementCount;
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) stack.push([c, d + 1]);
  }
  return { elements, depth, maxChildren };
}

/** `img.hero`, `p#intro`, `div.card.wide`: enough to recognise an element in a list. */
export function describeElement(el: Element): string {
  const id = el.id ? `#${el.id}` : "";
  const classes = [...el.classList].slice(0, 2).map((c) => `.${c}`).join("");
  return `${el.localName}${id}${classes}`;
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

export interface ElementContext {
  nodeOf(node: Node): DesignNode | null;
}

/** An element (or the parent of a text node) as a metric names it; null when there is none. */
export function perfElement(node: Node | null | undefined, ctx: ElementContext): PerfElement | null {
  const el = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
  if (!el) return null;
  const n = ctx.nodeOf(el);
  return { label: describeElement(el), node: n ? { id: n.id, tag: n.tag, component: n.component?.name ?? null } : null, connected: el.isConnected };
}

// --- the collector (runs in the page) --------------------------------------------------------------------------------------

interface LcpEntry extends PerformanceEntry {
  size: number;
  url: string;
  element: Element | null;
}
interface ShiftEntry extends PerformanceEntry, ShiftLike {
  sources?: Array<{ node: Node | null }>;
}
interface EventEntry extends PerformanceEntry, EventLike {
  target?: Node | null;
}

/** What the agent counts from the devtools hook's pushed events (see `GableCounter`). */
export type GableNumbers = NonNullable<PerfReport["gable"]>;

/** Counts the devtools hook's flushes and hot updates as they are pushed to the agent. */
export class GableCounter {
  flushes = 0;
  effectRuns = 0;
  effectMs = 0;
  slowestFlush: GableNumbers["slowestFlush"] = null;
  firstTree: number | null = null;
  lastHotUpdate: GableNumbers["lastHotUpdate"] = null;

  flush(f: { at: number; ms: number; runs: Array<{ label: string; ms: number }>; more: number }): void {
    this.flushes++;
    this.effectRuns += f.runs.length + f.more;
    this.effectMs += f.ms;
    if (!this.slowestFlush || f.ms > this.slowestFlush.ms) {
      const top = f.runs.reduce<{ label: string; ms: number } | null>((a, r) => (!a || r.ms > a.ms ? r : a), null);
      this.slowestFlush = { ms: round(f.ms, 2), at: round(f.at), effect: top?.label ?? null };
    }
  }

  tree(now: number): void {
    this.firstTree ??= round(now);
  }

  /**
   * A hot update was applied at `at`; `nextFrame` reports when the frame after it has been rendered (the agent: a task
   * queued from the next animation frame callback, so it runs once that frame is done; a rAF timestamp alone is the
   * frame's begin time, which can be earlier than `at`).
   */
  hotUpdate(at: number, status: string, nextFrame: (done: (t: number) => void) => void): void {
    const entry = { at: round(at), toFrameMs: null as number | null, status };
    this.lastHotUpdate = entry;
    nextFrame((t) => (entry.toFrameMs = round(Math.max(0, t - at))));
  }

  numbers(): GableNumbers {
    return { flushes: this.flushes, effectRuns: this.effectRuns, effectMs: round(this.effectMs, 2), slowestFlush: this.slowestFlush, firstTree: this.firstTree, lastHotUpdate: this.lastHotUpdate && { ...this.lastHotUpdate } };
  }
}

export interface SnapshotContext extends ElementContext {
  url: string;
  mode: "page" | "component";
  dom: PerfReport["dom"];
  gable: GableNumbers | null;
  device: PerfReport["device"];
  isDesigner(url: string): boolean;
}

/** Observes the page's performance entries from the moment the agent starts (buffered, so earlier ones are not lost). */
export class PerfCollector {
  readonly supported: Set<string>;
  readonly entries = new Map<string, PerformanceEntry[]>();

  constructor(private readonly perf: Performance = performance) {
    const PO = globalThis.PerformanceObserver;
    this.supported = new Set(PO?.supportedEntryTypes ?? []);
    // The default buffer of 250 drops requests on a dev server, which serves every module on its own.
    (perf as Performance & { setResourceTimingBufferSize?(n: number): void }).setResourceTimingBufferSize?.(2000);
    if (!PO) return;
    for (const type of ENTRY_TYPES) {
      if (!this.supported.has(type) || type === "navigation" || type === "resource") continue;
      const list: PerformanceEntry[] = [];
      this.entries.set(type, list);
      try {
        new PO((l) => void list.push(...l.getEntries())).observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) } as PerformanceObserverInit);
      } catch {
        this.supported.delete(type);
      }
    }
  }

  #of<T extends PerformanceEntry>(type: string): T[] {
    return (this.entries.get(type) ?? []) as T[];
  }

  snapshot(ctx: SnapshotContext): PerfReport {
    const at = this.perf.now();
    const has = (t: string) => this.supported.has(t);
    const missing = (t: string) => `This browser does not report ${t} entries.`;
    const element = (n: Node | null | undefined) => perfElement(n, ctx);

    const nav = has("navigation") ? (this.perf.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined) : undefined;
    const fcpEntry = this.#of("paint").find((e) => e.name === "first-contentful-paint");
    const lcpEntry = this.#of<LcpEntry>("largest-contentful-paint").at(-1);
    const cls = clsOf(this.#of<ShiftEntry>("layout-shift"));
    const tasks = this.#of<PerformanceEntry>("longtask");
    const inp = inpOf(this.#of<EventEntry>("event"));
    const metric = (id: PerfMetricId, label: string, unit: PerfMetric["unit"], value: number | null, unavailable: string | null, extra: Partial<PerfMetric> = {}): PerfMetric => ({
      id,
      label,
      value: value === null ? null : round(value, id === "cls" ? 3 : 0),
      unit,
      rating: value === null ? null : rate(id, value),
      thresholds: THRESHOLDS[id],
      unavailable: value === null ? unavailable : null,
      ...extra,
    });

    const metrics: PerfMetric[] = [
      metric("ttfb", "Time to first byte", "ms", nav ? nav.responseStart : null, has("navigation") ? "No navigation timing for this page." : missing("navigation")),
      metric("fcp", "First contentful paint", "ms", fcpEntry ? fcpEntry.startTime : null, has("paint") ? "Nothing contentful has been painted yet." : missing("paint")),
      metric("lcp", "Largest contentful paint", "ms", lcpEntry ? lcpEntry.startTime : null, has("largest-contentful-paint") ? "No largest-contentful-paint candidate yet." : missing("largest-contentful-paint"), {
        element: lcpEntry ? element(lcpEntry.element) : null,
      }),
      metric("cls", "Cumulative layout shift", "score", has("layout-shift") ? cls.value : null, missing("layout-shift")),
      metric("inp", "Interaction to next paint", "ms", inp ? inp.value : null, has("event") ? "No interaction yet: use the page in Interact mode, then measure." : missing("event"), {
        element: inp ? element(inp.worst.target) : null,
      }),
      metric("tbt", "Total blocking time", "ms", has("longtask") ? blockingTime(tasks, fcpEntry?.startTime ?? 0, at) : null, missing("longtask")),
      metric("dom", "DOM size", "elements", ctx.dom.elements, null),
    ];

    const shifts: PerfShift[] = [...cls.window]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map((s) => ({ value: round(s.value, 4), at: round(s.startTime), sources: (s.sources ?? []).map((src) => element(src.node)).filter((e): e is PerfElement => !!e) }));

    const durations = tasks.map((t) => t.duration);
    return {
      url: ctx.url,
      mode: ctx.mode,
      at: round(at),
      metrics,
      lcp: lcpEntry ? { at: round(lcpEntry.startTime), size: lcpEntry.size, url: lcpEntry.url || null, element: element(lcpEntry.element) } : null,
      shifts,
      longTasks: has("longtask")
        ? {
            count: tasks.length,
            totalMs: round(durations.reduce((a, b) => a + b, 0)),
            longestMs: round(Math.max(0, ...durations)),
            blockingMs: round(blockingTime(tasks, fcpEntry?.startTime ?? 0, at)),
            tasks: [...tasks].sort((a, b) => b.duration - a.duration).slice(0, 5).map((t) => ({ at: round(t.startTime), duration: round(t.duration) })),
          }
        : null,
      interactions: has("event")
        ? { count: inp?.count ?? 0, worst: inp ? { type: inp.worst.name, duration: round(inp.worst.duration), at: round(inp.worst.startTime), element: element(inp.worst.target) } : null }
        : null,
      navigation: nav
        ? {
            type: nav.type,
            ttfb: round(nav.responseStart),
            domInteractive: round(nav.domInteractive),
            domContentLoaded: round(nav.domContentLoadedEventEnd),
            load: round(nav.loadEventEnd),
            transferBytes: nav.transferSize ?? 0,
          }
        : null,
      resources: has("resource") ? resourceSummary(this.perf.getEntriesByType("resource") as PerformanceResourceTiming[], ctx.isDesigner) : null,
      dom: ctx.dom,
      gable: ctx.gable,
      device: ctx.device,
      unsupported: ENTRY_TYPES.filter((t) => !has(t)),
    };
  }
}

/** Resolves once the page has loaded and painted a frame after it (or after `timeoutMs`, for a frame that does not paint). */
export function settled(doc: Document, timeoutMs = 3000): Promise<void> {
  const loaded = doc.readyState === "complete" ? Promise.resolve() : new Promise<void>((ok) => addEventListener("load", () => ok(), { once: true }));
  return loaded.then(
    () =>
      new Promise<void>((ok) => {
        const timer = setTimeout(ok, timeoutMs);
        requestAnimationFrame(() => requestAnimationFrame(() => (clearTimeout(timer), ok())));
      }),
  );
}
