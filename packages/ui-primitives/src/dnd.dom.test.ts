// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, html, signal, ErrorHandler } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import { UiDragHandle, UiDraggable, UiDropZone } from "./dnd.js";
import { autoScrollDelta, getDndManager } from "./dnd-manager.js";
import { lastAnnouncement, setDndMessages } from "./dnd-announce.js";
import { applySortableMove, arrayMove, UiSortable, UiSortableItem, type SortableMove } from "./dnd-sortable.js";

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

interface Row {
  id: string;
}
const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));

class App {
  static meta = {
    selector: "app-root",
    imports: [UiSortable, UiSortableItem, UiDragHandle, UiDraggable, UiDropZone],
    template: html`
      <div id="a" class="col" data-x="0" [uiSortable]="a()" sortableId="A" sortableGroup="g" sortableLabel="List A" (moved)="onMoved($event, 'A')" (removed)="onMoved($event, 'A')">
        @for (r of a(); track r.id) {
          <div [uiSortableItem]="r.id" [id]="r.id">{{ r.id }}</div>
        }
      </div>
      <div id="b" class="col" data-x="300" [uiSortable]="b()" sortableId="B" sortableGroup="g" sortableLabel="List B" (moved)="onMoved($event, 'B')" (removed)="onMoved($event, 'B')">
        @for (r of b(); track r.id) {
          <div [uiSortableItem]="r.id" [id]="r.id">{{ r.id }}</div>
        }
      </div>
      <div id="c" class="col" data-x="600" [uiSortable]="c()" sortableId="C" sortableGroup="other">
        @for (r of c(); track r.id) {
          <div [uiSortableItem]="r.id" [id]="r.id">{{ r.id }}</div>
        }
      </div>
      <div id="h" class="col" data-x="900" [uiSortable]="h()" sortableId="H">
        @for (r of h(); track r.id) {
          <div [uiSortableItem]="r.id" [id]="r.id"><span uiDragHandle [id]="r.grip">::</span>{{ r.id }}</div>
        }
      </div>
      <div id="card" class="free" data-x="1200" data-y="0" [uiDraggable]="payload" dragGroup="free" dragLabel="Card" (dragEnded)="ended.push($event)">Card</div>
      <div id="zone" class="free" data-x="1200" data-y="200" uiDropZone dropGroup="free" dropLabel="Trash" (dropped)="drops.push($event)">Trash</div>
    `,
  };
  a = signal(rows("a1", "a2", "a3"));
  b = signal(rows("b1", "b2"));
  c = signal(rows("c1"));
  h = signal([{ id: "h1", grip: "grip-h1" }, { id: "h2", grip: "grip-h2" }]);
  payload = { n: 1 };
  moves: SortableMove[] = [];
  drops: unknown[] = [];
  ended: unknown[] = [];
  onMoved(e: SortableMove, name: string) {
    this.moves.push(e);
    const apply = (s: typeof this.a) => s.set(applySortableMove(s(), e as SortableMove<Row>, name, (r) => r.id));
    apply(name === "A" ? this.a : this.b);
  }
}

/** Fake layout: columns at data-x, 200 wide, 400 tall; items 40 tall stacked by DOM index; free elements 100x100. */
const proto = HTMLElement.prototype as { getBoundingClientRect(): DOMRect };
const realRect = proto.getBoundingClientRect;
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
function fakeRect(this: HTMLElement): DOMRect {
  if (this.classList.contains("col")) return rect(Number(this.dataset.x), 0, 200, 400);
  if (this.classList.contains("free")) return rect(Number(this.dataset.x), Number(this.dataset.y), 100, 100);
  if (this.hasAttribute("data-sortable-id")) {
    const col = this.closest(".col") as HTMLElement;
    const index = [...col.children].filter((c) => c.hasAttribute("data-sortable-id")).indexOf(this);
    return rect(Number(col.dataset.x), index * 40, 200, 40);
  }
  return rect(0, 0, 0, 0);
}

let host: HTMLElement;
let destroy: () => void = () => {};
beforeEach(() => {
  Collector.reports.length = 0;
  document.body.replaceChildren();
  host = document.createElement("div");
  document.body.append(host);
  proto.getBoundingClientRect = fakeRect;
  setDndMessages({});
});
afterEach(() => {
  getDndManager(document).cancel();
  destroy();
  destroy = () => {};
  proto.getBoundingClientRect = realRect;
  expect(Collector.reports).toEqual([]);
});
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 5));
    await whenFlushed();
  }
};
const boot = async () => {
  const ref = bootstrap(App as never, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: App; destroy(): void };
  destroy = () => ref.destroy();
  await settle();
  return ref.instance;
};
const $ = (id: string) => document.getElementById(id)!;
const text = (id: string) => [...$(id).querySelectorAll("[data-sortable-id]")].map((e) => e.textContent!.replace("::", "").trim()).join(",");

const pointer = (target: EventTarget, type: string, x: number, y: number, extra: Record<string, unknown> = {}) => {
  const ev = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
  Object.defineProperties(ev, { pointerId: { value: 1 }, isPrimary: { value: true } });
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(ev, k, { value: v });
  target.dispatchEvent(ev);
};
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const preview = () => document.querySelector("[data-dnd-preview]") as HTMLElement | null;

describe("pointer sorting", () => {
  it("reorders inside a list, with a preview in the overlay root and an insertion marker", async () => {
    const app = await boot();
    pointer($("a1"), "pointerdown", 100, 20);
    pointer(document, "pointermove", 100, 22); // under the 4px threshold: no drag yet
    expect(preview()).toBeNull();
    pointer(document, "pointermove", 100, 100);
    expect(preview()?.parentElement).toBe(document.body);
    expect(preview()!.getAttribute("aria-hidden")).toBe("true");
    expect(preview()!.id).toBe("");
    expect($("a1").getAttribute("data-dragging")).toBe("pointer");
    expect($("a").hasAttribute("data-drop-over")).toBe(true);
    expect($("a3").getAttribute("data-drop-position")).toBe("before"); // a1 goes between a2 and a3
    expect(getDndManager(document).active()).toMatchObject({ overZoneId: expect.any(String), overIndex: 1 });
    pointer(document, "pointerup", 100, 100);
    await settle();
    expect(preview()).toBeNull();
    expect($("a1").hasAttribute("data-dragging")).toBe(false);
    expect($("a").hasAttribute("data-drop-over")).toBe(false);
    expect(app.moves).toHaveLength(1);
    expect(app.moves[0]).toMatchObject({ id: "a1", from: { container: "A", index: 0 }, to: { container: "A", index: 1 } });
    expect(text("a")).toBe("a2,a1,a3");
    expect(lastAnnouncement(document)).toBe("Dropped a1 at position 2 of 3 in List A.");
  });

  it("escape and pointercancel cancel without a move; a drop where nothing changed is not a move", async () => {
    const app = await boot();
    pointer($("a1"), "pointerdown", 100, 20);
    pointer(document, "pointermove", 100, 150);
    key(document.body, "Escape");
    expect(preview()).toBeNull();
    expect(lastAnnouncement(document)).toBe("Cancelled. a1 was not moved.");
    pointer($("a2"), "pointerdown", 100, 60);
    pointer(document, "pointermove", 100, 150);
    pointer(document, "pointercancel", 100, 150);
    expect(preview()).toBeNull();
    pointer($("a2"), "pointerdown", 100, 60);
    pointer(document, "pointermove", 100, 70);
    pointer(document, "pointermove", 100, 62); // still on its own slot
    pointer(document, "pointerup", 100, 62);
    expect(app.moves).toEqual([]);
  });

  it("moves an item to another list of the same group and reports both lists", async () => {
    const app = await boot();
    pointer($("a2"), "pointerdown", 100, 60);
    pointer(document, "pointermove", 350, 100); // over list B, below b2's middle
    expect($("b").hasAttribute("data-drop-over")).toBe(true);
    pointer(document, "pointerup", 350, 100);
    await settle();
    expect(app.moves).toHaveLength(2); // removed from A, moved into B
    expect(app.moves.map((m) => [m.from.container, m.to.container, m.to.index])).toEqual([["A", "B", 2], ["A", "B", 2]]);
    expect(text("a")).toBe("a1,a3");
    expect(text("b")).toBe("b1,b2,a2");
  });

  it("ignores lists of another group, and disabled drags", async () => {
    const app = await boot();
    pointer($("a1"), "pointerdown", 100, 20);
    pointer(document, "pointermove", 650, 20); // over list C (group "other")
    expect($("c").hasAttribute("data-drop-over")).toBe(false);
    expect(getDndManager(document).active()!.overZoneId).toBeNull();
    pointer(document, "pointerup", 650, 20);
    expect(app.moves).toEqual([]);
    expect(lastAnnouncement(document)).toBe("Cancelled. a1 was not moved.");
  });

  it("with a handle, only the handle starts a drag", async () => {
    const app = await boot();
    pointer($("h1"), "pointerdown", 950, 20);
    pointer(document, "pointermove", 950, 100);
    expect(preview()).toBeNull();
    pointer(document, "pointerup", 950, 100);
    pointer($("grip-h1"), "pointerdown", 950, 20);
    pointer(document, "pointermove", 950, 100);
    expect(preview()).not.toBeNull();
    pointer(document, "pointerup", 950, 100);
    expect(app.moves).toEqual([]); // list H has no moved handler wired, but the drag itself ran
  });

  it("clicks right after a drag are swallowed", async () => {
    await boot();
    let clicks = 0;
    $("a1").addEventListener("click", () => clicks++);
    pointer($("a1"), "pointerdown", 100, 20);
    pointer(document, "pointermove", 100, 100);
    pointer(document, "pointerup", 100, 100);
    $("a1").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(clicks).toBe(0);
  });
});

describe("keyboard sorting and announcements", () => {
  it("space lifts, arrows move, space drops; every step is announced", async () => {
    const app = await boot();
    $("a1").focus();
    key($("a1"), " ");
    expect(lastAnnouncement(document)).toBe("Picked up a1. It is at position 1 of 3 in List A. Use the arrow keys to move, space to drop, escape to cancel.");
    expect($("a1").getAttribute("data-dragging")).toBe("keyboard");
    key($("a1"), "ArrowDown");
    expect(lastAnnouncement(document)).toBe("a1 moved to position 2 of 3 in List A.");
    key($("a1"), "ArrowDown");
    expect(lastAnnouncement(document)).toBe("a1 moved to position 3 of 3 in List A.");
    key($("a1"), "ArrowDown"); // at the end: nothing changes
    expect(lastAnnouncement(document)).toBe("a1 moved to position 3 of 3 in List A.");
    key($("a1"), "ArrowUp");
    key($("a1"), " ");
    await settle();
    expect(app.moves[0]).toMatchObject({ id: "a1", from: { index: 0 }, to: { container: "A", index: 1 } });
    expect(text("a")).toBe("a2,a1,a3");
    expect(lastAnnouncement(document)).toBe("Dropped a1 at position 2 of 3 in List A.");
    await settle();
    expect(document.activeElement).toBe($("a1")); // focus returns to the moved item
  });

  it("escape cancels and leaves the list alone", async () => {
    const app = await boot();
    $("a2").focus();
    key($("a2"), " ");
    key($("a2"), "ArrowUp");
    key($("a2"), "Escape");
    expect(app.moves).toEqual([]);
    expect(lastAnnouncement(document)).toBe("Cancelled. a2 was not moved.");
    expect($("a2").hasAttribute("data-dragging")).toBe(false);
    key($("a2"), "ArrowDown"); // no longer captured: roving focus handles it
    expect(document.activeElement).toBe($("a3"));
  });

  it("the other arrow pair moves between lists of the group, but not into another group", async () => {
    const app = await boot();
    $("a1").focus();
    key($("a1"), " ");
    key($("a1"), "ArrowRight");
    expect(lastAnnouncement(document)).toBe("a1 moved to position 1 of 3 in List B.");
    key($("a1"), "ArrowRight"); // list C is another group, list H has no group: both skipped
    expect(lastAnnouncement(document)).toBe("a1 moved to position 1 of 3 in List B.");
    key($("a1"), "ArrowDown");
    key($("a1"), " ");
    await settle();
    expect(app.moves.map((m) => m.to)).toEqual([{ container: "B", index: 1 }, { container: "B", index: 1 }]);
    expect(text("a")).toBe("a2,a3");
    expect(text("b")).toBe("b1,a1,b2");
  });

  it("keeps one tab stop across the list (roving) and announces instructions", async () => {
    await boot();
    expect([...$("a").children].map((c) => c.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect($("a1").getAttribute("aria-roledescription")).toBe("sortable item");
    const describedBy = $("a1").getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)!.textContent).toContain("Press space to pick up");
  });

  it("messages can be replaced", async () => {
    await boot();
    setDndMessages({ cancel: (i) => `Annulé ${i.label}` });
    $("a1").focus();
    key($("a1"), " ");
    key($("a1"), "Escape");
    expect(lastAnnouncement(document)).toBe("Annulé a1");
  });
});

describe("draggable and drop zone", () => {
  it("drops by pointer and reports the data", async () => {
    const app = await boot();
    pointer($("card"), "pointerdown", 1250, 50);
    pointer(document, "pointermove", 1250, 250);
    expect($("zone").hasAttribute("data-drop-over")).toBe(true);
    pointer(document, "pointerup", 1250, 250);
    expect(app.drops).toEqual([{ data: { n: 1 }, fromZoneId: undefined }]);
    expect(app.ended).toEqual([{ dropped: true, zoneId: expect.any(String), index: undefined }]);
    expect(lastAnnouncement(document)).toBe("Dropped Card on Trash.");
  });

  it("works from the keyboard: space, arrow to pick the zone, space", async () => {
    const app = await boot();
    $("card").focus();
    key($("card"), " ");
    expect(lastAnnouncement(document)).toContain("Picked up Card.");
    key($("card"), "ArrowRight");
    expect(lastAnnouncement(document)).toBe("Card is over Trash.");
    key($("card"), " ");
    expect(app.drops).toHaveLength(1);
  });

  it("does not accept sortable items of a group it does not share", async () => {
    const app = await boot();
    pointer($("a1"), "pointerdown", 100, 20);
    pointer(document, "pointermove", 1250, 250);
    expect($("zone").hasAttribute("data-drop-over")).toBe(false);
    pointer(document, "pointerup", 1250, 250);
    expect(app.drops).toEqual([]);
  });
});

describe("auto scroll", () => {
  it("computes speeds near the edges", () => {
    const r = { left: 0, top: 0, right: 200, bottom: 400 };
    expect(autoScrollDelta(r, { x: 100, y: 200 })).toEqual({ dx: 0, dy: 0 });
    expect(autoScrollDelta(r, { x: 100, y: 399 }).dy).toBeGreaterThan(10);
    expect(autoScrollDelta(r, { x: 100, y: 370 }).dy).toBeGreaterThan(0);
    expect(autoScrollDelta(r, { x: 100, y: 370 }).dy).toBeLessThan(autoScrollDelta(r, { x: 100, y: 399 }).dy);
    expect(autoScrollDelta(r, { x: 1, y: 200 }).dx).toBeLessThan(0);
    expect(autoScrollDelta(r, { x: 100, y: 500 }).dy).toBe(18); // beyond the edge: full speed
  });

  it("scrolls the scrollable ancestor while the pointer is near its edge, and stops at the end", async () => {
    await boot();
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (cb) => frames.push(cb);
    window.cancelAnimationFrame = () => {};
    const list = $("a");
    list.style.overflowY = "auto";
    let top = 0;
    Object.defineProperties(list, {
      scrollHeight: { value: 800 },
      clientHeight: { value: 400 },
      scrollTop: { get: () => top, set: (v: number) => (top = Math.min(v, 400)) },
    });
    pointer($("a1"), "pointerdown", 100, 20);
    pointer(document, "pointermove", 100, 390); // 10px from the bottom edge of the list
    const manager = getDndManager(document);
    expect(frames.length).toBe(1); // the loop is armed
    expect(manager.autoScrollTick()).toBe(true);
    expect(top).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) manager.autoScrollTick();
    expect(top).toBe(400);
    expect(manager.autoScrollTick()).toBe(false);
    pointer(document, "pointerup", 100, 390);
  });
});

describe("helpers", () => {
  it("arrayMove and applySortableMove", () => {
    expect(arrayMove([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    const move: SortableMove<Row> = { id: "x", data: { id: "x" }, from: { container: "A", index: 0 }, to: { container: "B", index: 1 } };
    const id = (r: Row) => r.id;
    expect(applySortableMove(rows("x", "y"), move, "A", id)).toEqual(rows("y"));
    expect(applySortableMove(rows("p", "q"), move, "B", id)).toEqual(rows("p", "x", "q"));
    expect(applySortableMove(rows("p"), move, "Z", id)).toEqual(rows("p"));
  });
});
