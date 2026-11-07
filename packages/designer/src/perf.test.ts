// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { GableCounter, PerfCollector, blockingTime, clsOf, describeElement, domSize, inpOf, perfElement, rate, resourceSummary, type SnapshotContext } from "./agent/perf.js";
import { NO_THROTTLE, sanitizeThrottle, throttleLabel } from "./devices.js";
import { elementText, formatBytes, formatMetric, formatMs } from "../shell/src/app/perf-state.js";

const shift = (startTime: number, value: number, hadRecentInput = false) => ({ startTime, value, hadRecentInput });
const ev = (interactionId: number, duration: number, name = "pointerdown") => ({ name, startTime: interactionId * 100, duration, interactionId });

describe("performance metrics (agent)", () => {
  it("rates with the web-vitals thresholds, inclusive at the good edge", () => {
    expect(rate("lcp", 2500)).toBe("good");
    expect(rate("lcp", 2501)).toBe("needs-improvement");
    expect(rate("lcp", 4000)).toBe("needs-improvement");
    expect(rate("lcp", 4001)).toBe("poor");
    expect(rate("cls", 0.1)).toBe("good");
    expect(rate("cls", 0.26)).toBe("poor");
    expect(rate("inp", 199)).toBe("good");
    expect(rate("dom", 1500)).toBe("poor");
  });

  it("groups layout shifts into session windows and takes the largest", () => {
    // window A: 0, 500, 1200 (gaps < 1 s) = 0.15; then a 2 s gap; window B: 3200, 3300 = 0.2
    const shifts = [shift(1200, 0.05), shift(0, 0.05), shift(500, 0.05), shift(3200, 0.1), shift(3300, 0.1), shift(3400, 0.5, true)];
    const r = clsOf(shifts);
    expect(r.value).toBeCloseTo(0.2);
    expect(r.window.map((s) => s.startTime)).toEqual([3200, 3300]);
    // a window closes at 5 s even with small gaps
    const long = Array.from({ length: 12 }, (_, i) => shift(i * 900, 0.01));
    expect(clsOf(long).window.length).toBe(6);
    expect(clsOf([]).value).toBe(0);
    // shifts right after input do not count at all
    expect(clsOf([shift(0, 0.4, true)]).value).toBe(0);
  });

  it("takes each interaction's longest event, and the 98th percentile past 50 interactions", () => {
    expect(inpOf([])).toBeNull();
    expect(inpOf([{ name: "x", startTime: 0, duration: 400 }])).toBeNull(); // no interactionId: not an interaction
    const few = inpOf([ev(1, 40), ev(1, 120, "click"), ev(2, 90)]);
    expect(few).toMatchObject({ value: 120, count: 2, worst: { name: "click" } });
    // 60 interactions: the worst one is skipped
    const many = inpOf([...Array.from({ length: 58 }, (_, i) => ev(i + 1, 50)), ev(100, 900), ev(101, 300)]);
    expect(many).toMatchObject({ value: 300, count: 60 });
  });

  it("counts blocking time past 50 ms from FCP, a straddling task only after FCP", () => {
    const tasks = [
      { startTime: 0, duration: 200 }, // ends before FCP
      { startTime: 900, duration: 300 }, // straddles FCP at 1000: 200 ms after it, 250 blocking -> 200
      { startTime: 2000, duration: 120 }, // 70
      { startTime: 3000, duration: 40 }, // short
    ];
    expect(blockingTime(tasks, 1000)).toBe(270);
    expect(blockingTime(tasks, 1000, 2050)).toBe(250); // the 2000 task is cut at 2050: 50 ms of it, under its 70 blocking
    expect(blockingTime([], 0)).toBe(0);
  });

  it("summarises requests and keeps the Designer's own apart", () => {
    const r = resourceSummary(
      [
        { name: "http://x/src/main.ts", initiatorType: "script", duration: 30, transferSize: 1000, decodedBodySize: 3000 },
        { name: "http://x/hero.png", initiatorType: "img", duration: 120, transferSize: 50000, decodedBodySize: 50000 },
        { name: "http://x/cached.css", initiatorType: "link", duration: 2, transferSize: 0, decodedBodySize: 400 },
        { name: "http://x/__gable-designer/agent.js", initiatorType: "script", duration: 500, transferSize: 9999 },
      ],
      (u) => u.includes("/__gable-designer/"),
    );
    expect(r).toMatchObject({ count: 3, designer: 1, transferBytes: 51000, decodedBytes: 53400, unsized: 1 });
    expect(r.byType.map((b) => b.type)).toEqual(["img", "link", "script"]);
    expect(r.slowest[0]).toMatchObject({ name: "http://x/hero.png", duration: 120 });
  });

  it("measures the DOM without the Designer's overlay and names elements", () => {
    document.body.innerHTML = `<main id="app"><ul class="list wide extra"><li>a</li><li>b</li><li><b>c</b></li></ul></main><div data-overlay><span></span></div>`;
    const dom = domSize(document.documentElement, (el) => el.hasAttribute("data-overlay"));
    // html, head, body, main, ul, 3 li, b
    expect(dom).toEqual({ elements: 9, depth: 6, maxChildren: 3 });
    expect(describeElement(document.querySelector("ul")!)).toBe("ul.list.wide");
    expect(describeElement(document.querySelector("main")!)).toBe("main#app");

    const b = document.querySelector("b")!;
    const node = { id: "t1:40", tag: "li", component: { id: "c1", name: "List", source: null } };
    const ctx = { nodeOf: (n: Node) => ((n as Element).localName === "b" ? (node as never) : null) };
    // a text node resolves through its parent element
    expect(perfElement(b.firstChild, ctx)).toEqual({ label: "b", node: { id: "t1:40", tag: "li", component: "List" }, connected: true });
    expect(perfElement(document.querySelector("main"), ctx)).toEqual({ label: "main#app", node: null, connected: true });
    expect(perfElement(null, ctx)).toBeNull();
  });

  it("counts flushes, effect runs, the first tree and the last hot update", () => {
    const g = new GableCounter();
    g.flush({ at: 10, ms: 1.5, runs: [{ label: "a", ms: 1 }], more: 0 });
    g.flush({ at: 20, ms: 4.25, runs: [{ label: "b", ms: 1 }, { label: "c", ms: 3 }], more: 5 });
    g.tree(33.33);
    g.tree(50);
    let fire: (t: number) => void = () => undefined;
    g.hotUpdate(100, "ok", (done) => (fire = done));
    expect(g.numbers()).toMatchObject({ flushes: 2, effectRuns: 8, effectMs: 5.75, slowestFlush: { ms: 4.25, at: 20, effect: "c" }, firstTree: 33.3, lastHotUpdate: { at: 100, status: "ok", toFrameMs: null } });
    fire(116.4);
    expect(g.numbers().lastHotUpdate).toEqual({ at: 100, status: "ok", toFrameMs: 16.4 });
  });

  describe("the collector", () => {
    afterEach(() => vi.unstubAllGlobals());

    const ctx = (over: Partial<SnapshotContext> = {}): SnapshotContext => ({
      url: "/",
      mode: "page",
      dom: { elements: 20, depth: 4, maxChildren: 3 },
      gable: null,
      device: { width: 800, height: 600, dpr: 1 },
      isDesigner: () => false,
      nodeOf: () => null,
      ...over,
    });

    it("says what the engine does not report instead of reporting zero", () => {
      vi.stubGlobal("PerformanceObserver", undefined);
      const r = new PerfCollector().snapshot(ctx());
      for (const id of ["ttfb", "fcp", "lcp", "cls", "inp", "tbt"]) {
        const m = r.metrics.find((x) => x.id === id)!;
        expect(m.value, id).toBeNull();
        expect(m.rating, id).toBeNull();
        expect(m.unavailable, id).toMatch(/does not report/);
      }
      expect(r.metrics.find((m) => m.id === "dom")).toMatchObject({ value: 20, rating: "good", unavailable: null });
      expect(r.longTasks).toBeNull();
      expect(r.unsupported).toContain("largest-contentful-paint");
    });

    it("turns observed entries into metrics, with the LCP element and shift sources", () => {
      const callbacks = new Map<string, (l: { getEntries(): unknown[] }) => void>();
      class FakeObserver {
        static supportedEntryTypes = ["paint", "largest-contentful-paint", "layout-shift", "longtask", "event"];
        constructor(private cb: (l: { getEntries(): unknown[] }) => void) {}
        observe(o: { type: string }) {
          callbacks.set(o.type, this.cb);
        }
      }
      vi.stubGlobal("PerformanceObserver", FakeObserver);
      document.body.innerHTML = `<img id="hero"><p class="late">x</p>`;
      const perf = { now: () => 5000, getEntriesByType: () => [] } as unknown as Performance;
      const c = new PerfCollector(perf);
      const emit = (type: string, ...entries: unknown[]) => callbacks.get(type)!({ getEntries: () => entries });
      emit("paint", { name: "first-contentful-paint", startTime: 900 });
      emit("largest-contentful-paint", { startTime: 1200, size: 4000, url: "http://x/hero.png", element: document.getElementById("hero") }, { startTime: 2800, size: 9000, url: "", element: document.querySelector(".late") });
      emit("layout-shift", { startTime: 1500, value: 0.12, hadRecentInput: false, sources: [{ node: document.querySelector(".late") }, { node: null }] });
      emit("longtask", { startTime: 1000, duration: 150 });

      const nodeOf = (n: Node) => ((n as Element).id === "hero" ? ({ id: "t:1", tag: "img", component: { name: "Hero" } } as never) : null);
      const r = c.snapshot(ctx({ nodeOf }));
      const m = Object.fromEntries(r.metrics.map((x) => [x.id, x]));
      expect(m.fcp).toMatchObject({ value: 900, rating: "good" });
      // the last candidate is LCP
      expect(m.lcp).toMatchObject({ value: 2800, rating: "needs-improvement", element: { label: "p.late", node: null } });
      expect(m.cls).toMatchObject({ value: 0.12, rating: "needs-improvement" });
      expect(m.tbt).toMatchObject({ value: 100, rating: "good" });
      expect(m.inp).toMatchObject({ value: null, unavailable: expect.stringContaining("No interaction yet") });
      expect(m.ttfb!.unavailable).toMatch(/navigation/);
      expect(r.shifts).toEqual([{ value: 0.12, at: 1500, sources: [{ label: "p.late", node: null, connected: true }] }]);
      expect(r.longTasks).toMatchObject({ count: 1, longestMs: 150, blockingMs: 100 });
      expect(r.interactions).toEqual({ count: 0, worst: null });
      expect(r.resources).toBeNull();

      emit("largest-contentful-paint", { startTime: 3100, size: 9500, url: "", element: document.getElementById("hero") });
      expect(c.snapshot(ctx({ nodeOf })).lcp).toMatchObject({ at: 3100, element: { node: { id: "t:1", tag: "img", component: "Hero" } } });
    });
  });
});

describe("performance tab formatting and throttling", () => {
  it("formats durations, bytes and metric values", () => {
    expect(formatMs(12.4)).toBe("12 ms");
    expect(formatMs(1234)).toBe("1.23 s");
    expect(formatMs(12345)).toBe("12.3 s");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 kB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatMetric({ value: null, unit: "ms" })).toBe("—");
    expect(formatMetric({ value: 0.03123, unit: "score" })).toBe("0.031");
    expect(formatMetric({ value: 812, unit: "elements" })).toBe("812 elements");
    expect(elementText({ label: "img#hero", node: { id: "t", tag: "img", component: "Hero" }, connected: true })).toBe("<img> in Hero");
    expect(elementText({ label: "img#hero", node: null, connected: false })).toBe("img#hero");
  });

  it("accepts only the offered throttling settings", () => {
    expect(sanitizeThrottle({ cpu: 4, network: "slow-4g" })).toEqual({ cpu: 4, network: "slow-4g" });
    expect(sanitizeThrottle({ cpu: 3, network: "dial-up" })).toEqual(NO_THROTTLE);
    expect(sanitizeThrottle(null)).toEqual(NO_THROTTLE);
    expect(sanitizeThrottle({ cpu: 20, network: "toString" })).toEqual({ cpu: 20, network: "none" });
    expect(throttleLabel(NO_THROTTLE)).toBe("none");
    expect(throttleLabel({ cpu: 4, network: "none" })).toBe("CPU 4×");
    expect(throttleLabel({ cpu: 1, network: "slow-3g" })).toBe("Slow 3G");
    expect(throttleLabel({ cpu: 6, network: "fast-4g" })).toBe("CPU 6×, Fast 4G");
  });
});
