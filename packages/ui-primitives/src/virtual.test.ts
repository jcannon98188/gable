import { describe, expect, it } from "vitest";
import { computed, html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { UiProps } from "./machines.js";
import { createVirtualizer } from "./virtual-core.js";
import { useVirtualizer } from "./virtual.js";

const indexes = (v: ReturnType<typeof createVirtualizer>) => v.items().map((i) => i.index);

describe("virtualizer engine", () => {
  it("renders the viewport plus overscan for fixed heights", () => {
    const v = createVirtualizer({ count: () => 100_000, itemSize: 20, overscan: 3 });
    v.setScroll(0, 100);
    expect(v.totalSize()).toBe(2_000_000);
    expect(v.range()).toMatchObject({ first: 0, last: 5 });
    expect(indexes(v)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    v.setScroll(50_000, 100);
    expect(v.range()).toMatchObject({ first: 2500, last: 2505 });
    expect(indexes(v)[0]).toBe(2497);
    expect(v.items().length).toBe(12);
    expect(v.items()[3]).toMatchObject({ index: 2500, start: 50_000, size: 20, end: 50_020 });
  });

  it("starts from estimates and shifts everything below a measured row", () => {
    const v = createVirtualizer({ count: () => 50, estimateSize: 30, overscan: 0 });
    v.setScroll(0, 100);
    expect(v.totalSize()).toBe(1500);
    expect(indexes(v)).toEqual([0, 1, 2, 3]);
    v.measure(0, 80);
    expect(v.offsetOf(1)).toBe(80);
    expect(v.totalSize()).toBe(1550);
    expect(indexes(v)).toEqual([0, 1]); // 80 + 30 covers the 100px viewport
    v.measure(0, 80);
    expect(v.totalSize()).toBe(1550);
  });

  it("does not measure when the height is fixed", () => {
    const v = createVirtualizer({ count: () => 10, itemSize: 10 });
    v.measure(2, 99);
    expect(v.totalSize()).toBe(100);
  });

  it("keeps a measured height with its key when the data reorders", () => {
    const keys = signal(["a", "b", "c"]);
    const v = createVirtualizer({ count: () => keys().length, getKey: (i) => keys()[i]!, estimateSize: 10 });
    v.setScroll(0, 1000);
    v.measure(0, 50); // "a"
    expect(v.offsetOf(1)).toBe(50);
    keys.set(["c", "a", "b"]);
    expect(v.offsetOf(1)).toBe(10);
    expect(v.offsetOf(2)).toBe(60);
    expect(v.items().map((i) => i.key)).toEqual(["c", "a", "b"]);
    keys.set(["x", "c", "a", "b"]);
    expect(v.totalSize()).toBe(10 + 10 + 50 + 10);
  });

  it("follows count changes", () => {
    const n = signal(3);
    const v = createVirtualizer({ count: n, itemSize: 10 });
    v.setScroll(0, 1000);
    expect(indexes(v)).toEqual([0, 1, 2]);
    n.set(0);
    expect(v.items()).toEqual([]);
    expect(v.range().first).toBe(-1);
    n.set(5);
    expect(indexes(v)).toEqual([0, 1, 2, 3, 4]);
  });

  it("pins the nearest sticky header and always renders kept indexes", () => {
    const v = createVirtualizer({ count: () => 1000, itemSize: 10, overscan: 1, stickyIndexes: () => [0, 100, 200], keepIndexes: () => [900] });
    v.setScroll(1500, 50); // first visible: 150
    const items = v.items();
    expect(items.find((i) => i.sticky)!.index).toBe(100);
    expect(items.map((i) => i.index)).toEqual([100, 149, 150, 151, 152, 153, 154, 155, 156, 900]);
    v.setScroll(0, 50);
    expect(v.items().find((i) => i.sticky)!.index).toBe(0);
  });

  it("computes the scroll offset for an index by alignment, clamped to the content", () => {
    const v = createVirtualizer({ count: () => 100, itemSize: 10, scrollPaddingStart: 10 });
    v.setScroll(0, 100);
    expect(v.offsetForIndex(50, "start")).toBe(490);
    expect(v.offsetForIndex(50, "end")).toBe(410);
    expect(v.offsetForIndex(50, "center")).toBe(455);
    expect(v.offsetForIndex(5)).toBe(0); // already visible
    expect(v.offsetForIndex(50)).toBe(410); // auto: below the viewport, align end
    expect(v.offsetForIndex(99, "start")).toBe(900); // clamped to total - viewport
  });

  it("changes items only when the window moves", () => {
    const v = createVirtualizer({ count: () => 1000, itemSize: 10, overscan: 2 });
    v.setScroll(0, 100);
    const a = v.items();
    v.setScroll(0, 100);
    expect(v.items()).toBe(a);
  });

  it("forgets measurements on reset", () => {
    const v = createVirtualizer({ count: () => 10, estimateSize: 10 });
    v.measure(0, 50);
    expect(v.totalSize()).toBe(140);
    v.resetMeasurements();
    expect(v.totalSize()).toBe(100);
  });
});

class Rows {
  static meta = {
    selector: "app-root",
    imports: [UiProps],
    template: html`<div id="scroller">
      <div id="spacer" [attr.style]="list.spacerStyle()">
        @for (item of visible(); track item.key) {
          <div class="row" [uiProps]="item.props">{{ item.text }}</div>
        }
      </div>
    </div>`,
  };
  rows = signal(Array.from({ length: 10_000 }, (_, i) => `row ${i}`));
  list = useVirtualizer({ count: () => this.rows().length, itemSize: 20, overscan: 2, itemRole: "listitem", keyboard: true, initialViewport: 100 });
  visible = computed(() => this.list.rows().map((r) => ({ ...r, text: this.rows()[r.index] })));
}

describe("useVirtualizer (in-memory renderer)", () => {
  it("renders only the window and the spacer height", async () => {
    const f = mount(Rows);
    await f.settle();
    expect(f.queryAll(".row")).toHaveLength(8); // 0..5 visible, +2 overscan
    expect(f.query("#spacer")!.attrs.style).toContain("height:200000px");
    expect(f.textOf(f.queryAll(".row")[0]!)).toBe("row 0");
  });

  it("puts list semantics on each item", async () => {
    const f = mount(Rows);
    await f.settle();
    const row = f.queryAll(".row")[3]!;
    expect(row.attrs).toMatchObject({ role: "listitem", "aria-setsize": "10000", "aria-posinset": "4", "data-index": "3" });
    expect(row.attrs.style).toContain("translateY(60px)");
    expect(f.queryAll(".row").map((r) => r.attrs.tabindex)).toEqual(["0", "-1", "-1", "-1", "-1", "-1", "-1", "-1"]);
  });

  it("follows scroll events and recycles rows by key", async () => {
    const f = mount(Rows);
    await f.settle();
    f.dispatch(f.root, "scroll", { target: { scrollTop: 100_000, clientHeight: 100 } });
    await f.settle();
    const rows = f.queryAll(".row");
    // index 0 stays rendered: it is the tab stop (keyboard mode), so the window is that plus 4998..5007
    expect(rows.map((r) => r.attrs["data-index"])).toEqual(["0", "4998", "4999", "5000", "5001", "5002", "5003", "5004", "5005", "5006", "5007"]);
    expect(f.textOf(rows[1]!)).toBe("row 4998");
  });

  it("scrolls to an index and reflects data changes", async () => {
    const f = mount(Rows);
    await f.settle();
    f.instance.list.scrollToIndex(5000, { align: "start" });
    await f.settle();
    expect(f.queryAll(".row").some((r) => r.attrs["data-index"] === "5000")).toBe(true);
    f.instance.rows.set(f.instance.rows().slice(0, 3));
    await f.settle();
    expect(f.queryAll(".row")).toHaveLength(3);
    expect(f.queryAll(".row")[0]!.attrs["aria-setsize"]).toBe("3");
  });
});

class Grid {
  static meta = {
    selector: "app-root",
    imports: [UiProps],
    template: html`<div role="grid" [uiProps]="list.rootProps()">
      @for (item of list.rows(); track item.key) {
        <div role="row" class="row" [uiProps]="item.props">r{{ item.index }}</div>
      }
    </div>`,
  };
  list = useVirtualizer({ count: () => 500, itemSize: 20, aria: "grid", headerRows: 1, initialViewport: 60 });
}

describe("useVirtualizer grid semantics", () => {
  it("sets aria-rowcount and aria-rowindex counting the header row", async () => {
    const f = mount(Grid);
    await f.settle();
    expect(f.query("[role=grid]")!.attrs["aria-rowcount"]).toBe("501");
    expect(f.queryAll(".row")[0]!.attrs["aria-rowindex"]).toBe("2");
    expect(f.queryAll(".row")[0]!.attrs["aria-setsize"]).toBeUndefined();
  });
});
