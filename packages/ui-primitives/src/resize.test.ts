import { describe, expect, it, vi } from "vitest";
import { ResizeEngine, initialSizes, type ResizePanelConfig } from "./resize.js";

function make(configs: ResizePanelConfig[], direction: "horizontal" | "vertical" = "horizontal") {
  const onLayout = vi.fn();
  const e = new ResizeEngine({ direction: () => direction, onLayout });
  e.configure(configs);
  return { e, onLayout };
}
/** Simulated pointer gesture: press at `from`, move through `path`, release. */
function drag(e: ResizeEngine, handle: number, from: number, path: number[], containerPx = 1000) {
  e.startDrag(handle, from, containerPx);
  for (const p of path) e.dragTo(p);
  e.endDrag();
}

describe("initialSizes", () => {
  it("shares what the given sizes leave, and totals 100", () => {
    expect(initialSizes([{ defaultSize: 30 }, {}, {}])).toEqual([30, 35, 35]);
    expect(initialSizes([{}, {}, {}, {}])).toEqual([25, 25, 25, 25]);
    expect(initialSizes([{ defaultSize: 20 }, { defaultSize: 20 }])).toEqual([50, 50]);
  });
  it("keeps panels inside their limits", () => {
    expect(initialSizes([{ defaultSize: 5, minSize: 20 }, {}])).toEqual([20, 80]);
  });
});

describe("ResizeEngine dragging", () => {
  it("moves the two neighbours by the pointer travel as a share of the group", () => {
    const { e } = make([{ defaultSize: 50 }, { defaultSize: 50 }]);
    e.startDrag(0, 500, 1000);
    expect(e.dragging()).toBe(true);
    e.dragTo(600);
    expect(e.sizes()).toEqual([60, 40]);
    e.dragTo(450);
    expect(e.sizes()).toEqual([45, 55]);
    e.endDrag();
    expect(e.dragging()).toBe(false);
  });
  it("only touches the handle's neighbours", () => {
    const { e } = make([{ defaultSize: 25 }, { defaultSize: 25 }, { defaultSize: 50 }]);
    drag(e, 0, 0, [100]);
    expect(e.sizes()).toEqual([35, 15, 50]);
  });
  it("stops at min and max sizes", () => {
    const { e } = make([{ defaultSize: 50, minSize: 30 }, { defaultSize: 50, maxSize: 60, minSize: 30 }]);
    drag(e, 0, 0, [-900]);
    expect(e.sizes()).toEqual([40, 60]);
    drag(e, 0, 0, [900]);
    expect(e.sizes()).toEqual([70, 30]);
  });
  it("measures a vertical group by the same percentages", () => {
    const { e } = make([{ defaultSize: 50 }, { defaultSize: 50 }], "vertical");
    drag(e, 0, 100, [180], 400);
    expect(e.sizes()).toEqual([70, 30]);
  });
  it("collapses a collapsible panel past halfway to its minimum and restores it on the way back", () => {
    const { e } = make([{ defaultSize: 30, minSize: 20, collapsible: true }, { defaultSize: 70 }]);
    e.startDrag(0, 300, 1000);
    e.dragTo(215); // 21.5%: above the minimum
    expect(e.sizes()[0]).toBe(21.5);
    e.dragTo(195); // 19.5%: between minimum and half of it: stays at the minimum
    expect(e.sizes()[0]).toBe(20);
    e.dragTo(100); // 10%: not past the halfway point (10) so min...
    expect(e.sizes()[0]).toBe(20);
    e.dragTo(90);
    expect(e.sizes()).toEqual([0, 100]);
    expect(e.isCollapsed(0)).toBe(true);
    e.dragTo(150); // 15% out of the collapsed state: past halfway of 0..20
    expect(e.sizes()[0]).toBe(20);
    e.endDrag();
  });
  it("does not collapse a panel that is not collapsible", () => {
    const { e } = make([{ defaultSize: 30, minSize: 20 }, { defaultSize: 70 }]);
    drag(e, 0, 300, [0]);
    expect(e.sizes()).toEqual([20, 80]);
  });
  it("ignores moves without a drag and zero-size containers", () => {
    const { e, onLayout } = make([{}, {}]);
    onLayout.mockClear();
    e.dragTo(50);
    e.startDrag(0, 0, 0);
    e.dragTo(50);
    expect(onLayout).not.toHaveBeenCalled();
  });
  it("reports each changed layout", () => {
    const { e, onLayout } = make([{}, {}]);
    onLayout.mockClear();
    drag(e, 0, 0, [100, 100, 200], 1000);
    expect(onLayout.mock.calls.map((c) => c[0])).toEqual([[60, 40], [70, 30]]);
  });
});

describe("ResizeEngine keyboard", () => {
  it("moves by the step along the group's axis only", () => {
    const h = make([{}, {}]);
    expect(h.e.key(0, "ArrowRight")).toBe(true);
    expect(h.e.sizes()).toEqual([60, 40]);
    expect(h.e.key(0, "ArrowLeft")).toBe(true);
    expect(h.e.key(0, "ArrowLeft")).toBe(true);
    expect(h.e.sizes()).toEqual([40, 60]);
    expect(h.e.key(0, "ArrowDown")).toBe(false);
    expect(h.e.key(0, "a")).toBe(false);
    const v = make([{}, {}], "vertical");
    expect(v.e.key(0, "ArrowDown")).toBe(true);
    expect(v.e.sizes()).toEqual([60, 40]);
    expect(v.e.key(0, "ArrowRight")).toBe(false);
  });
  it("Home and End go as far as the neighbours allow", () => {
    const { e } = make([{ minSize: 20 }, { maxSize: 70, minSize: 20 }]);
    e.key(0, "Home");
    expect(e.sizes()).toEqual([30, 70]);
    e.key(0, "End");
    expect(e.sizes()).toEqual([80, 20]);
  });
  it("arrows stop at the minimum of a collapsible panel; Enter collapses and restores", () => {
    const { e } = make([{ defaultSize: 30, minSize: 20, collapsible: true }, { defaultSize: 70 }]);
    e.key(0, "ArrowLeft");
    expect(e.sizes()[0]).toBe(20);
    e.key(0, "ArrowLeft");
    expect(e.sizes()[0]).toBe(20);
    e.key(0, "Home");
    expect(e.sizes()[0]).toBe(20);
    e.key(0, "ArrowRight");
    e.key(0, "Enter");
    expect(e.sizes()).toEqual([0, 100]);
    expect(e.key(0, "ArrowLeft")).toBe(true);
    expect(e.sizes()[0]).toBe(0);
    e.key(0, "Enter");
    expect(e.sizes()).toEqual([30, 70]);
  });
  it("an arrow on a collapsed panel opens it to its minimum", () => {
    const { e } = make([{ defaultSize: 0, minSize: 20, collapsible: true }, {}]);
    expect(e.isCollapsed(0)).toBe(true);
    e.key(0, "ArrowRight");
    expect(e.sizes()[0]).toBe(20);
  });
  it("Enter does nothing when neither neighbour is collapsible, and can collapse the later panel", () => {
    expect(make([{}, {}]).e.key(0, "Enter")).toBe(false);
    const { e } = make([{}, { collapsible: true, minSize: 10 }]);
    e.key(0, "Enter");
    expect(e.sizes()).toEqual([100, 0]);
    e.key(0, "Enter");
    expect(e.sizes()).toEqual([50, 50]);
  });
});

describe("ResizeEngine state", () => {
  it("reports the primary panel's value and range for the separator", () => {
    const { e } = make([{ defaultSize: 40, minSize: 10 }, { defaultSize: 60, minSize: 25 }]);
    expect(e.handleState(0)).toEqual({ now: 40, min: 10, max: 75 });
  });
  it("a collapsible panel's range reaches its collapsed size", () => {
    const { e } = make([{ defaultSize: 40, minSize: 10, collapsible: true }, {}]);
    expect(e.handleState(0).min).toBe(0);
  });
  it("restores a valid saved layout and rejects an invalid one", () => {
    const e = new ResizeEngine({ direction: () => "horizontal" });
    e.configure([{}, {}], [30, 70]);
    expect(e.sizes()).toEqual([30, 70]);
    e.configure([{}, {}], [30, 30]);
    expect(e.sizes()).toEqual([30, 70]);
    e.configure([{}, {}, {}], [30, 70]);
    expect(e.sizes()).toEqual([33.333, 33.333, 33.333]);
    e.setSizes([10, 10, 80]);
    expect(e.sizes()).toEqual([10, 10, 80]);
    e.setSizes([1, 2]);
    expect(e.sizes()).toEqual([10, 10, 80]);
  });
  it("keeps the layout when only the limits change, clamped to them", () => {
    const e = new ResizeEngine({ direction: () => "horizontal" });
    e.configure([{}, {}]);
    e.resize(0, 10);
    e.configure([{ maxSize: 50 }, {}]);
    expect(e.sizes()).toEqual([50, 50]);
  });
});

describe("ResizeEngine cascading", () => {
  const three = () => make([{ defaultSize: 40 }, { defaultSize: 30, minSize: 30 }, { defaultSize: 30, minSize: 10 }]).e;
  it("a drag right carries into the panel beyond a neighbour that is at its minimum", () => {
    const e = three();
    drag(e, 0, 400, [500]);
    expect(e.sizes()).toEqual([50, 30, 20]);
    drag(e, 0, 500, [900]);
    expect(e.sizes()).toEqual([60, 30, 10]);
  });
  it("a drag left carries into the panels before the handle", () => {
    const e = make([{ defaultSize: 30, minSize: 10 }, { defaultSize: 30, minSize: 30 }, { defaultSize: 40 }]).e;
    drag(e, 1, 600, [400]);
    expect(e.sizes()).toEqual([10, 30, 60]);
  });
  it("stops when the growing panel is at its maximum, and arrow keys cascade too", () => {
    const e = make([{ defaultSize: 40, maxSize: 45 }, { defaultSize: 30, minSize: 30 }, { defaultSize: 30 }]).e;
    drag(e, 0, 400, [700]);
    expect(e.sizes()).toEqual([45, 30, 25]);
    const k = three();
    expect(k.key(0, "ArrowRight")).toBe(true);
    expect(k.sizes()).toEqual([50, 30, 20]);
  });
  it("Home and End stay with the two neighbours", () => {
    const e = three();
    e.key(0, "End");
    expect(e.sizes()).toEqual([40, 30, 30]);
  });
});

describe("ResizeEngine right to left", () => {
  it("mirrors pointer drags and arrow keys of a horizontal group", () => {
    const e = new ResizeEngine({ direction: () => "horizontal", rtl: () => true });
    e.configure([{ defaultSize: 50 }, { defaultSize: 50 }]);
    drag(e, 0, 500, [400]);
    expect(e.sizes()).toEqual([60, 40]);
    e.key(0, "ArrowLeft");
    expect(e.sizes()).toEqual([70, 30]);
    e.key(0, "ArrowRight");
    expect(e.sizes()).toEqual([60, 40]);
  });
  it("leaves vertical groups alone", () => {
    const e = new ResizeEngine({ direction: () => "vertical", rtl: () => true });
    e.configure([{ defaultSize: 50 }, { defaultSize: 50 }]);
    drag(e, 0, 500, [600]);
    expect(e.sizes()).toEqual([60, 40]);
  });
});
