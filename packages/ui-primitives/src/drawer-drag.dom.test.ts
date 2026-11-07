// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, html, signal, ErrorHandler } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import { DrawerDragEngine, UiDrawerDrag, type DrawerSide } from "./drawer-drag.js";

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

/** The engine with a log of what it reported. */
function engine(side: DrawerSide = "bottom", opts: { snaps?: number[]; size?: number } = {}) {
  const log = { moves: [] as [number, boolean][], dismissed: 0, snaps: [] as number[] };
  const e = new DrawerDragEngine({
    side: () => side,
    size: () => opts.size ?? 400,
    snapPoints: opts.snaps ? () => opts.snaps! : undefined,
    onMove: (offset, dragging) => log.moves.push([offset, dragging]),
    onSnap: (f) => log.snaps.push(f),
    onDismiss: () => log.dismissed++,
  });
  const p = (x: number, y: number, time: number) => ({ x, y, time });
  return { e, log, p, last: () => log.moves[log.moves.length - 1]! };
}

describe("DrawerDragEngine", () => {
  it("follows the pointer toward the closing edge, and rubber-bands toward the open side", () => {
    const { e, p, last } = engine();
    e.start(p(0, 100, 0));
    e.move(p(0, 102, 10)); // under the slop
    expect(last()).toBeUndefined();
    e.move(p(0, 150, 500));
    expect(last()).toEqual([50, true]);
    e.move(p(0, 90, 1000));
    expect(last()![0]).toBeCloseTo(-2, 5);
  });

  it("dismisses past half the panel when released slowly", () => {
    const { e, log, p, last } = engine();
    e.start(p(0, 0, 0));
    e.move(p(0, 250, 1000));
    e.end(p(0, 250, 2000));
    expect(log.dismissed).toBe(1);
    expect(last()).toEqual([400, false]);
  });

  it("springs back when released slowly before half", () => {
    const { e, log, p, last } = engine();
    e.start(p(0, 0, 0));
    e.move(p(0, 100, 1000));
    e.end(p(0, 100, 2000));
    expect(log.dismissed).toBe(0);
    expect(log.snaps).toEqual([1]);
    expect(last()).toEqual([0, false]);
  });

  it("dismisses on a fast fling even for a short distance, but not when the pointer stopped before release", () => {
    const fast = engine();
    fast.e.start(fast.p(0, 0, 0));
    fast.e.move(fast.p(0, 20, 20));
    fast.e.move(fast.p(0, 60, 50)); // 40px in 30ms
    fast.e.end(fast.p(0, 60, 51));
    expect(fast.log.dismissed).toBe(1);

    const stalled = engine();
    stalled.e.start(stalled.p(0, 0, 0));
    stalled.e.move(stalled.p(0, 60, 20));
    stalled.e.move(stalled.p(0, 62, 500)); // fast early, then held still
    stalled.e.end(stalled.p(0, 62, 700));
    expect(stalled.log.dismissed).toBe(0);
  });

  it("mirrors the axis for each edge", () => {
    const cases: [DrawerSide, number, number][] = [
      ["top", 0, -300],
      ["left", -300, 0],
      ["right", 300, 0],
    ];
    for (const [side, dx, dy] of cases) {
      const { e, p, last, log } = engine(side);
      e.start(p(500, 500, 0));
      e.move(p(500 + dx, 500 + dy, 1000));
      e.end(p(500 + dx, 500 + dy, 2000));
      expect(log.dismissed, side).toBe(1);
      expect(last()![0], side).toBe(400);
    }
    const wrong = engine("top");
    wrong.e.start(wrong.p(0, 0, 0));
    wrong.e.move(wrong.p(0, 300, 1000)); // pulling a top drawer down is toward open
    expect(wrong.last()![0]).toBeLessThan(0);
  });

  it("abandons a gesture that goes mostly across the axis", () => {
    const { e, p, log } = engine();
    e.start(p(0, 0, 0));
    e.move(p(30, 6, 50));
    e.move(p(30, 300, 100));
    e.end(p(30, 300, 150));
    expect(log.moves).toEqual([]);
    expect(log.dismissed).toBe(0);
  });

  describe("snap points", () => {
    it("settles on the nearest snap point", () => {
      const { e, log, p, last } = engine("bottom", { snaps: [0.4, 1] });
      e.setSnap(1);
      e.start(p(0, 0, 0));
      e.move(p(0, 200, 1000)); // visible 0.5
      e.end(p(0, 200, 2000));
      expect(log.snaps).toEqual([0.4]);
      expect(last()).toEqual([240, false]);
      expect(log.dismissed).toBe(0);
    });

    it("a fling moves one snap point at a time and dismisses below the lowest", () => {
      const { e, log, p } = engine("bottom", { snaps: [0.4, 1] });
      e.setSnap(1);
      const fling = (from: number, by: number, t0: number) => {
        e.start(p(0, from, t0));
        e.move(p(0, from + by / 2, t0 + 20));
        e.move(p(0, from + by, t0 + 40));
        e.end(p(0, from + by, t0 + 41));
      };
      fling(0, 30, 0); // fast down from full: next lower is 0.4
      expect(log.snaps).toEqual([0.4]);
      fling(240, 30, 1000);
      expect(log.dismissed).toBe(1);
    });

    it("a fling up from a low snap point goes to the next one up", () => {
      const { e, log, p } = engine("bottom", { snaps: [0.4, 1] });
      e.setSnap(0.4);
      e.start(p(0, 300, 0));
      e.move(p(0, 280, 20));
      e.move(p(0, 260, 40)); // fast up
      e.end(p(0, 260, 41));
      expect(log.snaps).toEqual([1]);
    });

    it("dismisses when dragged well below the lowest snap point", () => {
      const { e, log, p } = engine("bottom", { snaps: [0.4, 1] });
      e.setSnap(0.4);
      e.start(p(0, 0, 0));
      e.move(p(0, 150, 1000));
      e.end(p(0, 150, 2000));
      expect(log.dismissed).toBe(1);
    });

    it("cancel returns to the resting position", () => {
      const { e, p, last } = engine("bottom", { snaps: [0.4, 1] });
      e.setSnap(0.4);
      e.start(p(0, 0, 0));
      e.move(p(0, 100, 500));
      e.cancel();
      expect(last()).toEqual([240, false]);
    });
  });
});

// ---- the directive, with simulated pointer events -------------------------------------------------------------------

class App {
  static meta = {
    selector: "app-root",
    imports: [UiDrawerDrag],
    template: html`<div id="panel" uiDrawerDrag [side]="side()" [open]="open()" [snapPoints]="snaps()" (dismiss)="open.set(false)" (snapChange)="snap.set($event)">
      <div id="handle">handle</div>
      <input id="field" />
      <div id="scroller" style="overflow-y: auto">content</div>
    </div>`,
  };
  side = signal<DrawerSide>("bottom");
  open = signal(true);
  snaps = signal<number[]>([1]);
  snap = signal(1);
}

let destroy: () => void = () => {};
beforeEach(() => {
  Collector.reports.length = 0;
  document.body.replaceChildren();
});
afterEach(() => {
  destroy();
  destroy = () => {};
  expect(Collector.reports).toEqual([]);
});

async function mountApp() {
  const host = document.createElement("div");
  document.body.append(host);
  const ref = bootstrap(App as never, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: App; destroy(): void };
  destroy = () => ref.destroy();
  await whenFlushed();
  const panel = document.getElementById("panel")!;
  panel.getBoundingClientRect = () => ({ width: 300, height: 400, top: 0, left: 0, right: 300, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
  let t = 0;
  const fire = (target: Element, type: string, x: number, y: number, extra: Record<string, unknown> = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true }, extra);
    Object.defineProperty(event, "timeStamp", { value: (t += 16) });
    target.dispatchEvent(event);
  };
  return { app: ref.instance, panel, fire, tick: (ms: number) => (t += ms) };
}

describe("uiDrawerDrag", () => {
  it("moves the panel with the pointer and marks it dragging", async () => {
    const { panel, fire } = await mountApp();
    const handle = document.getElementById("handle")!;
    fire(handle, "pointerdown", 10, 100);
    fire(handle, "pointermove", 10, 130);
    expect(panel.style.transform).toBe("translate3d(0,30px,0)");
    expect(panel.style.transition).toBe("none");
    expect(panel.hasAttribute("data-dragging")).toBe(true);
    fire(handle, "pointerup", 10, 130);
    expect(panel.hasAttribute("data-dragging")).toBe(false);
  });

  it("dismisses past half way: emits dismiss, parks the panel off screen and marks it dragged", async () => {
    const { app, panel, fire, tick } = await mountApp();
    const handle = document.getElementById("handle")!;
    fire(handle, "pointerdown", 10, 100);
    fire(handle, "pointermove", 10, 330);
    tick(500);
    fire(handle, "pointerup", 10, 330);
    await whenFlushed();
    expect(app.open()).toBe(false);
    expect(panel.style.transform).toBe("translate3d(0,400px,0)");
    expect(panel.style.transition).toContain("transform");
    expect(panel.hasAttribute("data-dragged")).toBe(true);
  });

  it("springs back when released early, then clears everything when the drawer reopens", async () => {
    const { app, panel, fire, tick } = await mountApp();
    const handle = document.getElementById("handle")!;
    fire(handle, "pointerdown", 10, 100);
    tick(500);
    fire(handle, "pointermove", 10, 150);
    tick(500);
    fire(handle, "pointerup", 10, 150);
    expect(app.open()).toBe(true);
    expect(panel.style.transform).toBe("translate3d(0,0px,0)");
    app.open.set(false);
    await whenFlushed();
    app.open.set(true);
    await whenFlushed();
    expect(panel.style.transform).toBe("");
    expect(panel.hasAttribute("data-dragged")).toBe(false);
  });

  it("drags toward the edge for other sides", async () => {
    const { app, panel, fire } = await mountApp();
    app.side.set("right");
    await whenFlushed();
    fire(panel, "pointerdown", 100, 10, { pointerType: "touch" });
    fire(panel, "pointermove", 140, 10, { pointerType: "touch" });
    expect(panel.style.transform).toBe("translate3d(40px,0,0)");
    app.side.set("left");
    await whenFlushed();
    fire(panel, "pointerup", 140, 10);
  });

  it("rests at a snap point and reports it", async () => {
    const { app, panel, fire, tick } = await mountApp();
    app.snaps.set([0.5, 1]);
    app.open.set(false);
    await whenFlushed();
    app.open.set(true);
    await whenFlushed();
    expect(panel.style.transform).toBe(""); // largest by default
    fire(panel, "pointerdown", 10, 0);
    tick(500);
    fire(panel, "pointermove", 10, 200);
    tick(500);
    fire(panel, "pointerup", 10, 200);
    await whenFlushed();
    expect(app.snap()).toBe(0.5);
    expect(app.open()).toBe(true);
    expect(panel.style.transform).toBe("translate3d(0,200px,0)");
  });

  it("ignores presses on form controls, the secondary button and other pointers", async () => {
    const { panel, fire } = await mountApp();
    fire(document.getElementById("field")!, "pointerdown", 0, 0);
    fire(panel, "pointermove", 0, 100);
    expect(panel.hasAttribute("data-dragging")).toBe(false);
    fire(panel, "pointerdown", 0, 0, { button: 2 });
    fire(panel, "pointermove", 0, 100);
    expect(panel.hasAttribute("data-dragging")).toBe(false);
    fire(panel, "pointerdown", 0, 0, { pointerId: 1 });
    fire(panel, "pointermove", 0, 100, { pointerId: 2 });
    expect(panel.hasAttribute("data-dragging")).toBe(false);
  });

  it("does not drag from content that is scrolled away from the edge", async () => {
    const { panel, fire } = await mountApp();
    const scroller = document.getElementById("scroller")!;
    Object.defineProperties(scroller, { scrollHeight: { value: 500 }, clientHeight: { value: 100 }, scrollTop: { value: 40, configurable: true } });
    fire(scroller, "pointerdown", 0, 0);
    fire(scroller, "pointermove", 0, 100);
    expect(panel.hasAttribute("data-dragging")).toBe(false);
    Object.defineProperty(scroller, "scrollTop", { value: 0 });
    fire(scroller, "pointerdown", 0, 0);
    fire(scroller, "pointermove", 0, 100);
    expect(panel.hasAttribute("data-dragging")).toBe(true);
  });
});
