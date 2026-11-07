// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, I18n, inject, provideI18n, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { dateFnsLocaleNames } from "../lib/date-locale.js";
import { UiCalendar } from "./calendar.js";
import { UiDatePicker } from "./date-picker.js";
import { $, $$, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();
const TODAY = new Date(2026, 10, 6);

class Cal {
  static meta = { selector: "app-root", imports: [UiCalendar], template: html`<ui-calendar [today]="today" captionLayout="dropdown-months"></ui-calendar>` };
  i18n = inject(I18n);
  today = TODAY;
}
class CalOverride {
  static meta = { selector: "app-root", imports: [UiCalendar], template: html`<ui-calendar [today]="today" previousLabel="Back"></ui-calendar>` };
  today = TODAY;
}
class Picker {
  static meta = {
    selector: "app-root",
    imports: [UiDatePicker],
    template: html`<ui-date-picker [today]="today" [localeLoader]="loader" [(value)]="day"></ui-date-picker>`,
  };
  i18n = inject(I18n);
  today = TODAY;
  day = signal<Date | null>(new Date(2026, 10, 6));
  loader = async (name: string) => (await import("date-fns/locale"))[name as "fr"];
}

const providers = provideI18n({
  catalogs: {
    fr: { "ui.calendar.previous": "Mois précédent", "ui.calendar.next": "Mois suivant", "ui.calendar.month": "Mois", "ui.datePicker.placeholder": "Choisir une date" },
  },
});

describe("Calendar and I18n", () => {
  it("works with no I18n configuration (English)", async () => {
    await boot(Cal);
    expect($("[aria-live]").textContent).toBe("November 2026");
    expect($("button[aria-label]")!.getAttribute("aria-label")).toBe("Go to the previous month");
    expect($$("[role=columnheader]")[0]!.getAttribute("aria-label")).toBe("Sunday");
  });

  it("follows a runtime locale change: names and translated labels", async () => {
    const app = await boot(Cal, providers);
    await app.i18n.setLocale("fr");
    await settle();
    expect($("[aria-live]").textContent!.toLowerCase()).toBe("novembre 2026");
    expect($$("[role=columnheader]")[0]!.getAttribute("aria-label")!.toLowerCase()).toBe("lundi");
    const labels = $$("button[aria-label]").map((b) => b.getAttribute("aria-label"));
    expect(labels).toContain("Mois précédent");
    expect(labels).toContain("Mois suivant");
    expect($("select")!.getAttribute("aria-label")).toBe("Mois");
    await expectNoA11yViolations(document.body);
    await app.i18n.setLocale("en");
    await settle();
    expect($("[aria-live]").textContent).toBe("November 2026");
  });

  it("lets an input override the translated label", async () => {
    await boot(CalOverride, providers);
    expect($("button[aria-label]")!.getAttribute("aria-label")).toBe("Back");
  });
});

describe("Date picker and I18n", () => {
  it("translates the placeholder and loads the date-fns locale for the text", async () => {
    const app = await boot(Picker, providers);
    expect(document.body.textContent).toContain("November 6th, 2026");
    await app.i18n.setLocale("fr");
    await settle();
    expect(document.body.textContent).toContain("6 novembre 2026");
    app.day.set(null);
    await settle();
    expect(document.body.textContent).toContain("Choisir une date");
  });
});

describe("dateFnsLocaleNames", () => {
  it("maps BCP 47 codes to date-fns export names", () => {
    expect(dateFnsLocaleNames("fr")).toEqual(["fr"]);
    expect(dateFnsLocaleNames("pt-BR")).toEqual(["ptBR", "pt"]);
    expect(dateFnsLocaleNames("zh-Hant")).toEqual(["zhTW", "zh"]);
    expect(dateFnsLocaleNames("en")).toEqual(["enUS"]);
    expect(dateFnsLocaleNames("en-GB")).toEqual(["enGB", "enUS"]);
  });
});
