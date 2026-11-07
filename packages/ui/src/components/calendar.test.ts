import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { UiCalendar, type DateRange } from "./calendar.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiCalendar],
    template: html`<ui-calendar [(value)]="day" [today]="today" [min]="min"></ui-calendar>`,
  };
  day = signal<Date | null>(null);
  today = new Date(2026, 10, 6);
  min = new Date(2026, 10, 3);
}

class Ranged {
  static meta = {
    selector: "app-root",
    imports: [UiCalendar],
    template: html`<ui-calendar mode="range" [(range)]="stay" [today]="today" [weekStartsOn]="1"></ui-calendar>`,
  };
  stay = signal<DateRange>({ from: null, to: null });
  today = new Date(2026, 10, 6);
}

const cell = (f: ReturnType<typeof mount>, iso: string) => f.query(`[data-date=${iso}]`)!;

describe("Calendar (in-memory)", () => {
  it("renders grid semantics", async () => {
    const f = mount(App);
    await f.settle();
    expect(f.query("table")!.attrs.role).toBe("grid");
    expect(f.queryAll("[role=columnheader]").length).toBe(7);
    expect(f.queryAll("[role=gridcell]").length).toBe(35);
    expect(cell(f, "2026-11-06").attrs).toMatchObject({ "aria-current": "date", "aria-selected": "false", tabindex: "0" });
    expect(cell(f, "2026-11-02").attrs["aria-disabled"]).toBe("true");
    expect(cell(f, "2026-11-03").attrs["aria-disabled"]).toBeUndefined();
  });

  it("selects by click and moves the roving tab stop with the keyboard", async () => {
    const f = mount(App);
    await f.settle();
    f.dispatch(cell(f, "2026-11-10"), "click", {});
    await f.settle();
    expect(f.instance.day()?.getDate()).toBe(10);
    expect(cell(f, "2026-11-10").attrs["aria-selected"]).toBe("true");
    f.keydown(cell(f, "2026-11-10"), "ArrowDown");
    await f.settle();
    expect(cell(f, "2026-11-17").attrs.tabindex).toBe("0");
    expect(cell(f, "2026-11-10").attrs.tabindex).toBe("-1");
    f.keydown(cell(f, "2026-11-17"), "PageDown");
    await f.settle();
    expect(f.text()).toContain("December 2026");
    expect(cell(f, "2026-12-17").attrs.tabindex).toBe("0");
  });

  it("honours weekStartsOn and builds ranges", async () => {
    const f = mount(Ranged);
    await f.settle();
    expect(f.queryAll("[role=columnheader]")[0]!.attrs["aria-label"]).toBe("Monday");
    f.dispatch(cell(f, "2026-11-12"), "click", {});
    await f.settle();
    f.dispatch(cell(f, "2026-11-09"), "click", {});
    await f.settle();
    const { from, to } = f.instance.stay();
    expect([from?.getDate(), to?.getDate()]).toEqual([9, 12]);
    expect(cell(f, "2026-11-10").attrs["data-range"]).toBe("middle");
  });
});
