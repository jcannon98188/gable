// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiChart, niceScale, type ChartType } from "./chart.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

const ROWS = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
];
const SERIES = [{ key: "desktop", label: "Desktop" }, { key: "mobile", label: "Mobile", color: "red" }];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiChart],
    template: html`<ui-chart label="Visitors" [type]="kind()" [data]="rows()" xKey="month" [series]="series" [height]="200" totalLabel="Visitors"></ui-chart>`,
  };
  kind = signal<ChartType>("bar");
  rows = signal<Record<string, unknown>[]>(ROWS);
  series = SERIES;
}

const points = () => $$("[data-chart-point]");
const tooltip = () => document.querySelector("[data-chart-tooltip]");

describe("niceScale", () => {
  it("rounds the range and picks 1/2/5 steps", () => {
    expect(niceScale(0, 305)).toEqual({ lo: 0, hi: 400, ticks: [0, 100, 200, 300, 400] });
    expect(niceScale(-3, 8).ticks).toEqual([-5, 0, 5, 10]);
    expect(niceScale(0, 0)).toMatchObject({ lo: 0, hi: 1 });
  });
});

describe("Chart semantics", () => {
  it("is a labelled chart group with one labelled point per category and a data table", async () => {
    await boot(App);
    const svg = $("svg");
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-roledescription")).toBe("chart");
    expect(svg.getAttribute("aria-label")).toBe("Visitors");
    expect(points().map((p) => p.getAttribute("aria-label"))).toEqual([
      "January: Desktop 186, Mobile 80",
      "February: Desktop 305, Mobile 200",
      "March: Desktop 237, Mobile 120",
    ]);
    expect(points().map((p) => p.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    const table = $("table[data-chart-table]");
    expect(table.querySelector("caption")!.textContent).toBe("Visitors");
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["month", "Desktop", "Mobile"]);
    expect([...table.querySelectorAll("tbody tr:nth-child(2) > *")].map((c) => c.textContent)).toEqual(["February", "305", "200"]);
  });

  it("draws bars from the zero baseline with theme colours, and the legend names the series", async () => {
    await boot(App);
    const bars = $$("svg rect[rx]");
    expect(bars).toHaveLength(6);
    expect(bars[0].getAttribute("fill")).toBe("var(--chart-1)");
    expect(bars[1].getAttribute("fill")).toBe("red");
    expect(Number(bars[2].getAttribute("height"))).toBeGreaterThan(Number(bars[0].getAttribute("height")));
    expect([...$("[data-chart-legend]").querySelectorAll("li")].map((li) => li.textContent!.trim())).toEqual(["Desktop", "Mobile"]);
  });

  it("draws one path per series for line and an area fill for area", async () => {
    const app = await boot(App);
    app.kind.set("line");
    await settle();
    expect($$("svg path")).toHaveLength(2);
    expect($("svg path").getAttribute("d")).toMatch(/^M [\d. ]+ L /);
    app.kind.set("area");
    await settle();
    expect($$("svg path")).toHaveLength(4);
    expect($("svg path").getAttribute("d")).toMatch(/Z$/);
  });

  it("renders pie slices and a donut total, one point per slice", async () => {
    const app = await boot(App);
    app.kind.set("pie");
    await settle();
    expect(points().map((p) => p.getAttribute("aria-label"))[0]).toBe("January: Desktop 186 (25.5%)");
    expect(points()).toHaveLength(3);
    expect($$("svg text")).toHaveLength(0);
    app.kind.set("donut");
    await settle();
    expect($$("svg text").map((t) => t.textContent)).toEqual(["728", "Visitors"]);
    expect([...$("[data-chart-legend]").querySelectorAll("li")].map((li) => li.textContent!.trim())).toEqual(["January", "February", "March"]);
    // the table only has the first series
    expect($$("table thead th").map((th) => th.textContent)).toEqual(["month", "Desktop"]);
  });

  it("follows the data", async () => {
    const app = await boot(App);
    app.rows.set([{ month: "May", desktop: 1, mobile: 2 }]);
    await settle();
    expect(points()).toHaveLength(1);
    app.rows.set([]);
    await settle();
    expect(points()).toHaveLength(0);
  });
});

describe("Chart interaction", () => {
  it("shows the tooltip on focus and hover, and hides it on leave and Escape", async () => {
    await boot(App);
    expect(tooltip()).toBeNull();
    points()[1].focus();
    await settle();
    expect(tooltip()!.getAttribute("aria-hidden")).toBe("true");
    expect(tooltip()!.textContent).toContain("February");
    expect(tooltip()!.textContent).toContain("305");
    points()[1].dispatchEvent(new Event("blur"));
    await settle();
    expect(tooltip()).toBeNull();
    points()[2].dispatchEvent(new MouseEvent("pointerenter", { bubbles: false }));
    await settle();
    expect(tooltip()!.textContent).toContain("March");
    key(points()[2], "Escape");
    await settle();
    expect(tooltip()).toBeNull();
  });

  it("moves between points with the arrow keys, Home and End, keeping one tab stop", async () => {
    await boot(App);
    points()[0].focus();
    await settle();
    key(points()[0], "ArrowRight");
    await settle();
    expect(document.activeElement).toBe(points()[1]);
    expect(points().map((p) => p.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    key(points()[1], "End");
    await settle();
    expect(document.activeElement).toBe(points()[2]);
    key(points()[2], "ArrowRight");
    await settle();
    expect(document.activeElement).toBe(points()[2]);
    key(points()[2], "Home");
    await settle();
    expect(document.activeElement).toBe(points()[0]);
  });

  it("has no axe violations for any chart type", async () => {
    const { expectNoA11yViolations } = await import("@gable/testing/a11y");
    const app = await boot(App);
    for (const kind of ["bar", "line", "area", "pie", "donut"] as const) {
      app.kind.set(kind);
      await settle();
      await expectNoA11yViolations(document.body);
    }
  });
});
