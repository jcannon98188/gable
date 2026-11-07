// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, computed, ErrorHandler, html, signal } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import { UiProps } from "./machines.js";
import { useVirtualizer } from "./virtual.js";

// jsdom has no layout: scroll position, viewport height and row heights are faked.
const scrollTops = new WeakMap<Element, number>();
const heights = new Map<number, number>();
let observers: MockResizeObserver[] = [];
class MockResizeObserver {
  targets = new Set<Element>();
  constructor(public cb: (entries: unknown[]) => void) {
    observers.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
}
/** Reports a height for every observed row, the way a ResizeObserver does on first observe. */
const reportRows = () => {
  for (const o of observers)
    o.cb(
      [...o.targets]
        .filter((t) => t.hasAttribute("data-index"))
        .map((t) => ({ target: t, borderBoxSize: [{ blockSize: heights.get(Number(t.getAttribute("data-index"))) ?? 20 }], contentRect: { height: 20 } })),
    );
};

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

class List {
  static meta = {
    selector: "app-root",
    imports: [UiProps],
    template: html`<div id="spacer" [attr.style]="list.spacerStyle()">
      @for (item of visible(); track item.key) {
        <div class="row" [uiProps]="item.props">{{ item.text }}</div>
      }
    </div>`,
  };
  rows = signal(Array.from({ length: 1000 }, (_, i) => `row ${i}`));
  list = useVirtualizer({ count: () => this.rows().length, estimateSize: 20, overscan: 1, keyboard: true, itemRole: "option" });
  visible = computed(() => this.list.rows().map((r) => ({ ...r, text: this.rows()[r.index] })));
}

let app: HTMLElement;
let container: HTMLElement;
let instance: List;
let destroy: () => void = () => {};
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 5));
    await whenFlushed();
  }
};
const rendered = () => [...app.querySelectorAll(".row")].map((r) => Number(r.getAttribute("data-index")));
const scrollTo = async (top: number) => {
  scrollTops.set(app, top);
  app.dispatchEvent(new Event("scroll"));
  await settle();
};

beforeEach(() => {
  Collector.reports.length = 0;
  heights.clear();
  observers = [];
  Object.defineProperty(Element.prototype, "scrollTop", { configurable: true, get: function (this: Element) { return scrollTops.get(this) ?? 0; }, set: function (this: Element, v: number) { scrollTops.set(this, v); } });
  Object.defineProperty(Element.prototype, "clientHeight", { configurable: true, get: () => 100 });
  Object.assign(Element.prototype, {
    scrollTo(this: Element, opts: { top: number }) {
      scrollTops.set(this, opts.top);
      this.dispatchEvent(new Event("scroll"));
    },
  });
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  destroy();
  destroy = () => {};
  expect(Collector.reports).toEqual([]);
});

const start = async () => {
  const ref = bootstrap(List as never, { renderer: createDomRenderer(), target: container, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: List; host: HTMLElement; destroy(): void };
  destroy = () => ref.destroy();
  app = ref.host;
  instance = ref.instance;
  await settle();
  reportRows();
  await settle();
};

describe("useVirtualizer (jsdom, mocked layout)", () => {
  it("reads the viewport from the host and renders the window", async () => {
    await start();
    // 100px viewport / 20px rows = rows 0..5, plus 1 overscan
    expect(rendered()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(app.querySelector("#spacer")!.getAttribute("style")).toContain("height:20000px");
  });

  it("measures variable heights with the ResizeObserver and shifts the rows below", async () => {
    heights.set(0, 60);
    heights.set(1, 40);
    await start();
    const second = app.querySelector('[data-index="2"]') as HTMLElement;
    expect(second.style.transform).toBe("translateY(100px)");
    // 60 + 40 + rows of 20: the 100px viewport ends inside row 2
    expect(rendered()).toEqual([0, 1, 2, 3]);
    expect(app.querySelector("#spacer")!.getAttribute("style")).toContain(`height:${20000 + 60 - 20 + 40 - 20}px`);
  });

  it("keeps the scroll position stable when a row above the viewport is measured taller", async () => {
    await start();
    await scrollTo(2000); // rows 100.. are in view (20px each)
    const before = scrollTops.get(app)!;
    const rowTop = (i: number) => instance.list.offsetOf(i) - before;
    const anchorOffset = rowTop(100);
    // row 90 sits above the viewport and turns out 50px taller than its estimate
    instance.list.measure(90, 70);
    await settle();
    expect(scrollTops.get(app)).toBe(before + 50);
    expect(instance.list.offsetOf(100) - scrollTops.get(app)!).toBe(anchorOffset); // the row in view did not move
    // a row below the view changes nothing
    instance.list.measure(200, 90);
    await settle();
    expect(scrollTops.get(app)).toBe(before + 50);
  });

  it("re-renders the window on scroll and keeps the tab stop row", async () => {
    await start();
    await scrollTo(2000);
    expect(rendered()).toEqual([0, 99, 100, 101, 102, 103, 104, 105, 106].filter((i) => i === 0 || i >= 99));
    const stop = app.querySelector('[data-index="0"]')!;
    expect(stop.getAttribute("tabindex")).toBe("0");
    expect(app.querySelector('[data-index="100"]')!.getAttribute("tabindex")).toBe("-1");
    expect(app.querySelector('[data-index="100"]')!.getAttribute("aria-posinset")).toBe("101");
  });

  it("scrolls to an index and re-aims after rows are measured", async () => {
    await start();
    instance.list.scrollToIndex(500, { align: "start" });
    await settle();
    expect(scrollTops.get(app)).toBe(10000);
    expect(rendered()).toContain(500);
    // rows above 500 turn out taller than estimated: the target moves and the scroll follows
    for (let i = 0; i < 500; i++) heights.set(i, 30);
    instance.list.measure(0, 30); // the layout is measured row by row; feed a visible batch
    for (const i of rendered()) instance.list.measure(i, heights.get(i) ?? 20);
    for (let i = 0; i < 500; i++) instance.list.measure(i, 30);
    await settle();
    expect(scrollTops.get(app)).toBe(15000);
    expect(rendered()).toContain(500);
  });

  it("moves focus with the arrow keys, Home and End", async () => {
    await start();
    const row = app.querySelector('[data-index="0"]') as HTMLElement;
    row.focus();
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await settle();
    expect(document.activeElement).toBe(app.querySelector('[data-index="1"]'));
    expect(app.querySelector('[data-index="1"]')!.getAttribute("tabindex")).toBe("0");
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    await settle();
    expect(scrollTops.get(app)).toBe(20000 - 100);
    expect(document.activeElement).toBe(app.querySelector('[data-index="999"]'));
    expect(rendered().includes(0)).toBe(false);
  });

  it("stops listening when destroyed", async () => {
    await start();
    destroy();
    destroy = () => {};
    scrollTops.set(app, 500);
    app.dispatchEvent(new Event("scroll"));
    await settle();
    expect(observers.every((o) => o.targets.size === 0)).toBe(true);
  });
});
