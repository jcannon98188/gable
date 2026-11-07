// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { form } from "@gable/core/forms";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { fr } from "date-fns/locale";
import { UiCalendar, type DateRange } from "./calendar.js";
import { UiDatePicker } from "./date-picker.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();
const TODAY = new Date(2026, 10, 6); // Friday, November 6th 2026

class Single {
  static meta = {
    selector: "app-root",
    imports: [UiCalendar],
    template: html`<ui-calendar [(value)]="day" [(month)]="month" [today]="today" [min]="min" [max]="max" [isDisabled]="noSundayThe8th"></ui-calendar>`,
  };
  day = signal<Date | null>(null);
  month = signal<Date | null>(null);
  today = TODAY;
  min: Date | null = new Date(2026, 9, 20);
  max: Date | null = new Date(2027, 0, 15);
  noSundayThe8th = (d: Date) => d.getDay() === 0 && d.getDate() === 8;
}

class Ranged {
  static meta = {
    selector: "app-root",
    imports: [UiCalendar],
    template: html`<ui-calendar mode="range" [(range)]="stay" [today]="today"></ui-calendar>`,
  };
  stay = signal<DateRange>({ from: null, to: null });
  today = TODAY;
}

class French {
  static meta = {
    selector: "app-root",
    imports: [UiCalendar],
    template: html`<ui-calendar [locale]="fr" [today]="today"></ui-calendar>`,
  };
  fr = fr;
  today = TODAY;
}

class Picker {
  static meta = {
    selector: "app-root",
    imports: [UiDatePicker],
    template: html`<ui-date-picker [field]="f.day" [today]="today" label="Birthday" name="day"></ui-date-picker>`,
  };
  model = signal<{ day: Date | null }>({ day: null });
  f = form(this.model);
  today = TODAY;
}

class PickerRange {
  static meta = {
    selector: "app-root",
    imports: [UiDatePicker],
    template: html`<ui-date-picker mode="range" [(range)]="stay" [today]="today"></ui-date-picker>`,
  };
  stay = signal<DateRange>({ from: null, to: null });
  today = TODAY;
}

const cell = (iso: string) => $(`[data-date="${iso}"]`);
const cells = () => $$("[role=gridcell]");
const click = async (el: Element) => {
  (el as HTMLElement).click();
  await settle();
};
const press = async (el: Element, k: string, init: KeyboardEventInit = {}) => {
  key(el, k, init);
  await settle();
};
const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);

describe("Calendar structure", () => {
  it("renders a labelled grid with weekday headers, today marked and one tab stop", async () => {
    await boot(Single);
    const grid = $("table");
    expect(grid.getAttribute("role")).toBe("grid");
    expect(document.getElementById(grid.getAttribute("aria-labelledby")!)!.textContent).toBe("November 2026");
    expect($$("[role=columnheader]").map((h) => h.textContent)).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
    expect($$("[role=columnheader]")[0]!.getAttribute("aria-label")).toBe("Sunday");
    expect(cells().length).toBe(35);
    expect(cells()[0]!.getAttribute("data-date")).toBe("2026-11-01");
    expect(cell("2026-11-06").getAttribute("aria-current")).toBe("date");
    expect(cell("2026-11-06").getAttribute("aria-label")).toBe("Friday, November 6th, 2026");
    expect(cells().filter((c) => c.getAttribute("tabindex") === "0").map((c) => c.getAttribute("data-date"))).toEqual(["2026-11-06"]);
    expect(cells().every((c) => c.getAttribute("aria-selected") === "false")).toBe(true);
  });

  it("has no axe violations, with and without a selection", async () => {
    const app = await boot(Single);
    await expectNoA11yViolations(document.body);
    await click(cell("2026-11-12"));
    expect(app.day()).toEqual(new Date(2026, 10, 12));
    await expectNoA11yViolations(document.body);
  });

  it("follows the locale for names and the first weekday", async () => {
    await boot(French);
    expect($("[aria-live]").textContent).toBe("novembre 2026");
    expect($$("[role=columnheader]")[0]!.getAttribute("aria-label")).toBe("lundi");
    expect(cells()[0]!.getAttribute("data-date")).toBe("2026-10-26");
  });
});

describe("Calendar single selection", () => {
  it("selects on click, marks aria-selected and keeps the month", async () => {
    const app = await boot(Single);
    await click(cell("2026-11-12"));
    expect(iso(app.day())).toBe("2026-11-12");
    expect(cell("2026-11-12").getAttribute("aria-selected")).toBe("true");
    expect(cells().filter((c) => c.getAttribute("aria-selected") === "true").length).toBe(1);
  });

  it("disables days before min, after max and by predicate", async () => {
    const app = await boot(Single);
    await click(cell("2026-11-08"));
    expect(cell("2026-11-08").getAttribute("aria-disabled")).toBe("true");
    expect(app.day()).toBeNull();
    $<HTMLButtonElement>("button[aria-label*=previous]").click();
    await settle();
    expect(cell("2026-10-19").getAttribute("aria-disabled")).toBe("true");
    expect(cell("2026-10-20").getAttribute("aria-disabled")).toBeNull();
    // min is in October, so the previous button is now disabled.
    expect($<HTMLButtonElement>("button[aria-label*=previous]").disabled).toBe(true);
  });

  it("picking a day of a neighbouring month shows that month", async () => {
    const app = await boot(Single);
    await click(cell("2026-12-02"));
    expect(iso(app.day())).toBe("2026-12-02");
    expect($("[aria-live]").textContent).toBe("December 2026");
    expect(iso(app.month())).toBe("2026-12-01");
  });

  it("next and previous change the month and stop at max", async () => {
    await boot(Single);
    const next = () => $<HTMLButtonElement>("button[aria-label*=next]");
    next().click();
    await settle();
    expect($("[aria-live]").textContent).toBe("December 2026");
    next().click();
    await settle();
    expect($("[aria-live]").textContent).toBe("January 2027");
    expect(next().disabled).toBe(true);
  });
});

describe("Calendar keyboard", () => {
  const focusToday = async () => {
    cell("2026-11-06").focus();
    await settle();
  };

  it("moves focus with the arrow keys, Home and End", async () => {
    await boot(Single);
    await focusToday();
    expect(document.activeElement).toBe(cell("2026-11-06"));
    await press(cell("2026-11-06"), "ArrowRight");
    expect(document.activeElement).toBe(cell("2026-11-07"));
    await press(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(cell("2026-11-14"));
    await press(document.activeElement!, "ArrowLeft");
    await press(document.activeElement!, "ArrowUp");
    expect(document.activeElement).toBe(cell("2026-11-06"));
    await press(document.activeElement!, "Home");
    expect(document.activeElement).toBe(cell("2026-11-01"));
    await press(document.activeElement!, "End");
    expect(document.activeElement).toBe(cell("2026-11-07"));
    expect(cells().filter((c) => c.getAttribute("tabindex") === "0").length).toBe(1);
    expect(cell("2026-11-07").getAttribute("tabindex")).toBe("0");
  });

  it("crosses months with the arrows and PageUp/PageDown", async () => {
    await boot(Single);
    await focusToday();
    await press(document.activeElement!, "PageDown");
    expect($("[aria-live]").textContent).toBe("December 2026");
    expect(document.activeElement).toBe(cell("2026-12-06"));
    await press(document.activeElement!, "PageUp");
    expect(document.activeElement).toBe(cell("2026-11-06"));
    await press(document.activeElement!, "Home");
    await press(document.activeElement!, "ArrowLeft");
    expect($("[aria-live]").textContent).toBe("October 2026");
    expect(document.activeElement).toBe(cell("2026-10-31"));
  });

  it("Shift+PageDown moves a year and is clamped to min/max", async () => {
    await boot(Single);
    await focusToday();
    await press(document.activeElement!, "PageDown", { shiftKey: true });
    // 2027-11-06 is past max (2027-01-15).
    expect($("[aria-live]").textContent).toBe("January 2027");
    expect(document.activeElement).toBe(cell("2027-01-15"));
    await press(document.activeElement!, "PageUp", { shiftKey: true });
    expect(document.activeElement).toBe(cell("2026-10-20"));
  });

  it("Enter and Space pick the focused day; disabled days are ignored", async () => {
    const app = await boot(Single);
    await focusToday();
    await press(document.activeElement!, "Enter");
    expect(iso(app.day())).toBe("2026-11-06");
    await press(document.activeElement!, "ArrowRight");
    await press(document.activeElement!, " ");
    expect(iso(app.day())).toBe("2026-11-07");
    await press(document.activeElement!, "ArrowRight");
    await press(document.activeElement!, "Enter");
    expect(iso(app.day())).toBe("2026-11-07");
  });
});

describe("Calendar range", () => {
  it("picks from, then to, swaps an earlier second pick and restarts on the third", async () => {
    const app = await boot(Ranged);
    await click(cell("2026-11-10"));
    expect(iso(app.stay().from)).toBe("2026-11-10");
    expect(app.stay().to).toBeNull();
    await click(cell("2026-11-14"));
    expect([iso(app.stay().from), iso(app.stay().to)]).toEqual(["2026-11-10", "2026-11-14"]);
    expect(cells().filter((c) => c.getAttribute("aria-selected") === "true").map((c) => c.getAttribute("data-date"))).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    expect([cell("2026-11-10"), cell("2026-11-12"), cell("2026-11-14")].map((c) => c.getAttribute("data-range"))).toEqual(["start", "middle", "end"]);
    await click(cell("2026-11-03"));
    expect([iso(app.stay().from), iso(app.stay().to)]).toEqual(["2026-11-03", null]);
    await click(cell("2026-11-01"));
    expect([iso(app.stay().from), iso(app.stay().to)]).toEqual(["2026-11-01", "2026-11-03"]);
    await expectNoA11yViolations(document.body);
  });

  it("marks the grid multiselectable", async () => {
    await boot(Ranged);
    expect($("table").getAttribute("aria-multiselectable")).toBe("true");
  });
});

describe("Date picker", () => {
  const trigger = () => $<HTMLButtonElement>("button[aria-haspopup]");
  const panel = () => $("[role=dialog]");

  it("opens a popover with the calendar, picks a day, closes and shows it on the button", async () => {
    const app = await boot(Picker);
    expect(trigger().textContent).toContain("Pick a date");
    expect(trigger().getAttribute("aria-label")).toBe("Birthday: Pick a date");
    expect(panel().hasAttribute("hidden")).toBe(true);
    await click(trigger());
    expect(panel().hasAttribute("hidden")).toBe(false);
    await click(cell("2026-11-12"));
    expect(iso(app.model().day)).toBe("2026-11-12");
    expect(trigger().textContent).toContain("November 12th, 2026");
    expect(trigger().getAttribute("aria-label")).toBe("Birthday: November 12th, 2026");
    expect(panel().getAttribute("data-state")).toBe("closed");
    expect($<HTMLInputElement>("input[name=day]").value).toBe("2026-11-12");
  });

  it("marks the field touched when the popover closes", async () => {
    const app = await boot(Picker);
    expect(app.f.day.state.touched()).toBe(false);
    await click(trigger());
    await press(panel(), "Escape");
    await settle();
    expect(app.f.day.state.touched()).toBe(true);
  });

  it("has no axe violations open", async () => {
    await boot(Picker);
    await click(trigger());
    await expectNoA11yViolations(document.body);
  });

  it("range mode closes only when both ends are chosen", async () => {
    const app = await boot(PickerRange);
    await click(trigger());
    await click(cell("2026-11-10"));
    expect(panel().getAttribute("data-state")).toBe("open");
    await click(cell("2026-11-12"));
    expect(panel().getAttribute("data-state")).toBe("closed");
    expect([iso(app.stay().from), iso(app.stay().to)]).toEqual(["2026-11-10", "2026-11-12"]);
    expect(trigger().textContent).toContain("November 10th, 2026 - November 12th, 2026");
  });
});
