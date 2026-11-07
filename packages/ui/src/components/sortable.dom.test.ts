// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { getDndManager, lastAnnouncement } from "@gable/ui-primitives";
import { UiSortableList, type SortableRow } from "./sortable.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();
const row = (id: string, label = id): SortableRow => ({ id, label });

class App {
  static meta = {
    selector: "app-root",
    imports: [UiSortableList],
    template: html`
      <ui-sortable name="todo" group="board" label="To do" [handle]="true" [(items)]="todo"></ui-sortable>
      <ui-sortable name="done" group="board" label="Done" [(items)]="done"></ui-sortable>
      <ui-sortable name="solo" label="Solo" [(items)]="solo"></ui-sortable>
    `,
  };
  todo = signal([row("t1", "Write docs"), row("t2", "Fix bug"), row("t3", "Ship")]);
  done = signal([row("d1", "Plan")]);
  solo = signal([row("s1"), row("s2")]);
}

// Fake layout: each ui-sortable is a 200px column at x = 300 * its index; rows are 40px tall.
const proto = HTMLElement.prototype as { getBoundingClientRect(): DOMRect };
const realRect = proto.getBoundingClientRect;
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
beforeEach(() => {
  proto.getBoundingClientRect = function (this: HTMLElement) {
    const column = this.closest("ui-sortable");
    if (!column) return box(0, 0, 0, 0);
    const x = [...column.parentElement!.children].indexOf(column) * 300;
    if (this.tagName === "LI") return box(x, [...this.parentElement!.children].indexOf(this) * 40, 200, 40);
    return box(x, 0, 200, 400);
  };
});
afterEach(() => {
  getDndManager(document).cancel();
  proto.getBoundingClientRect = realRect;
});
const labels = (n: number) => $$(`ui-sortable:nth-child(${n}) li`).map((li) => li.textContent!.trim());
const ptr = (el: EventTarget, type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  el.dispatchEvent(event);
};

describe("ui-sortable in jsdom", () => {
  it("renders rows with the sortable semantics, a grip when asked, and one tab stop", async () => {
    await boot(App);
    expect(labels(1)).toEqual(["Write docs", "Fix bug", "Ship"]);
    expect($$("ui-sortable:nth-child(1) li [data-drag-handle]")).toHaveLength(3);
    expect($$("ui-sortable:nth-child(2) li [data-drag-handle]")).toHaveLength(0);
    expect($$("ui-sortable:nth-child(1) li").map((li) => li.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect($("li").getAttribute("aria-roledescription")).toBe("sortable item");
    expect($("ul").getAttribute("aria-label")).toBe("To do");
  });

  it("reorders with the keyboard and updates the two-way model", async () => {
    const app = await boot(App);
    const first = $("ui-sortable:nth-child(1) li");
    first.focus();
    key(first, " ");
    expect(lastAnnouncement(document)).toContain("Picked up Write docs. It is at position 1 of 3 in To do.");
    key(first, "ArrowDown");
    key(first, "ArrowDown");
    expect(lastAnnouncement(document)).toBe("Write docs moved to position 3 of 3 in To do.");
    key(first, " ");
    await settle();
    expect(app.todo().map((r) => r.id)).toEqual(["t2", "t3", "t1"]);
    expect(labels(1)).toEqual(["Fix bug", "Ship", "Write docs"]);
    expect(document.activeElement?.textContent?.trim()).toBe("Write docs");
  });

  it("moves a card to the next column with the right arrow (kanban)", async () => {
    const app = await boot(App);
    const card = $("ui-sortable:nth-child(1) li:nth-child(2)");
    card.focus();
    key(card, " ");
    key(card, "ArrowRight");
    expect(lastAnnouncement(document)).toBe("Fix bug moved to position 2 of 2 in Done.");
    key(card, "ArrowUp");
    key(card, " ");
    await settle();
    expect(app.todo().map((r) => r.id)).toEqual(["t1", "t3"]);
    expect(app.done().map((r) => r.id)).toEqual(["t2", "d1"]);
    expect(labels(2)).toEqual(["Fix bug", "Plan"]);
  });

  it("does not move a card into a list of another group", async () => {
    const app = await boot(App);
    const card = $("ui-sortable:nth-child(2) li");
    card.focus();
    key(card, " ");
    key(card, "ArrowRight");
    key(card, "ArrowRight");
    key(card, "Escape");
    expect(app.solo().map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(app.done().map((r) => r.id)).toEqual(["d1"]);
  });

  it("drags by the grip with the pointer to another column", async () => {
    const app = await boot(App);
    const grip = $("ui-sortable:nth-child(1) li:nth-child(1) [data-drag-handle]");
    ptr($("ui-sortable:nth-child(1) li:nth-child(1)"), "pointerdown", 100, 20); // on the row, not the grip: no drag
    ptr(document, "pointermove", 400, 20);
    expect(document.querySelector("[data-dnd-preview]")).toBeNull();
    ptr(document, "pointerup", 400, 20);
    ptr(grip, "pointerdown", 100, 20);
    ptr(document, "pointermove", 400, 10);
    expect(document.querySelector("[data-dnd-preview]")!.parentElement).toBe(document.body);
    expect($("ui-sortable:nth-child(2) ul").hasAttribute("data-drop-over")).toBe(true);
    ptr(document, "pointerup", 400, 10);
    await settle();
    expect(app.todo().map((r) => r.id)).toEqual(["t2", "t3"]);
    expect(app.done().map((r) => r.id)).toEqual(["t1", "d1"]);
  });
});
