// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiChart, type ChartType, type ChartZoom } from "./chart.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

const ROWS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"].map((month, i) => ({ month, visits: (i + 1) * 100, rate: 10 + i * 5 }));
const DUAL = [{ key: "visits", label: "Visits" }, { key: "rate", label: "Rate", axis: "right" as const }];
const SINGLE = [{ key: "visits", label: "Visits" }];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiChart],
    template: html`<ui-chart label="Traffic" [type]="kind()" [data]="rows" xKey="month" [series]="series()" [height]="200" [zoomable]="true" [(zoom)]="zoom"></ui-chart>`,
  };
  kind = signal<ChartType>("line");
  rows = ROWS;
  series = signal<{ key: string; label: string; axis?: "left" | "right" }[]>(DUAL);
  zoom = signal<ChartZoom | null>(null);
}

class Pie {
  static meta = {
    selector: "app-root",
    imports: [UiChart],
    template: html`<ui-chart label="Share" type="donut" [data]="rows" xKey="month" [series]="series" [height]="200"></ui-chart>`,
  };
  rows = ROWS.slice(0, 3);
  series = SINGLE;
}

const points = () => $$("[data-chart-point]");
const legend = () => $$("[data-chart-legend-item]") as HTMLButtonElement[];
const btn = (name: string) => $<HTMLButtonElement>(`[data-chart-zoom-${name}]`);

describe("Chart secondary axis", () => {
  it("draws right-axis ticks from its own scale and keeps the left ticks", async () => {
    await boot(App);
    const right = $$("[data-chart-right-tick]").map((t) => t.textContent);
    expect(right.length).toBeGreaterThan(1);
    expect(right[0]).toBe("0");
    expect(Number(right[right.length - 1])).toBeGreaterThanOrEqual(45);
    expect(Number(right[right.length - 1])).toBeLessThan(100); // not the 800 of the left scale
    const left = $$("svg text[text-anchor=end]").map((t) => t.textContent);
    expect(left).toContain("800");
    await expectNoA11yViolations(document.body);
  });

  it("falls back to the left axis when only right series remain visible, and with no right series", async () => {
    const app = await boot(App);
    legend()[0]!.click(); // hide Visits; Rate is now the only series
    await settle();
    expect($$("[data-chart-right-tick]")).toHaveLength(0);
    legend()[0]!.click();
    app.series.set(SINGLE);
    await settle();
    expect($$("[data-chart-right-tick]")).toHaveLength(0);
  });
});

describe("Chart zoom", () => {
  it("toolbar buttons zoom in and out, reset restores, and a status line names the range", async () => {
    const app = await boot(App);
    expect(btn("reset").disabled).toBe(true);
    expect(points()).toHaveLength(8);
    btn("in").click();
    await settle();
    expect(points().length).toBeLessThan(8);
    expect(app.zoom()).not.toBeNull();
    expect($("[data-chart-zoom-status]").textContent).toMatch(/^Showing \w+ to \w+$/);
    expect(btn("reset").disabled).toBe(false);
    await expectNoA11yViolations(document.body);
    btn("out").click();
    await settle();
    btn("reset").click();
    await settle();
    expect(points()).toHaveLength(8);
    expect(app.zoom()).toBeNull();
    expect($("[data-chart-zoom-status]").textContent).toBe("");
  });

  it("zooms with + and - on a focused point, keeping focus", async () => {
    await boot(App);
    points()[3]!.focus();
    key(points()[3]!, "+");
    await settle();
    expect(points().length).toBe(4);
    expect(document.activeElement?.hasAttribute("data-chart-point")).toBe(true);
    key(document.activeElement!, "-");
    await settle();
    expect(points().length).toBeGreaterThan(4);
  });

  it("zooms with a brush drag across the plot", async () => {
    const app = await boot(App);
    const svg = $("svg[role=group]");
    const fire = (type: string, x: number) => svg.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }));
    // plot spans x 44..588 (width 600), 8 categories of 68px each
    fire("pointerdown", 44 + 68 * 2 + 5);
    fire("pointermove", 44 + 68 * 4 + 5);
    await settle();
    expect(document.querySelector("[data-chart-brush]")).not.toBeNull();
    fire("pointerup", 44 + 68 * 4 + 5);
    await settle();
    expect(app.zoom()).toEqual({ from: 2, to: 4 });
    expect(points()).toHaveLength(3);
    expect(document.querySelector("[data-chart-brush]")).toBeNull();
  });

  it("zooms with ctrl+wheel but leaves a plain wheel alone", async () => {
    await boot(App);
    const svg = $("svg[role=group]");
    const plain = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, clientX: 200 });
    svg.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    const ctrl = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, clientX: 200, ctrlKey: true });
    svg.dispatchEvent(ctrl);
    await settle();
    expect(ctrl.defaultPrevented).toBe(true);
    expect(points().length).toBeLessThan(8);
  });

  it("follows the zoom model set from outside, and the y scale follows the visible range", async () => {
    const app = await boot(App);
    app.zoom.set({ from: 0, to: 1 });
    await settle();
    expect(points()).toHaveLength(2);
    const left = $$("svg text[text-anchor=end]").map((t) => t.textContent);
    expect(left).not.toContain("800");
  });
});

describe("Chart pie slice toggling", () => {
  it("toggles slices from the legend and recomputes the total", async () => {
    await boot(Pie);
    expect(legend()).toHaveLength(3);
    expect(legend().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
    expect($("svg text.text-2xl").textContent).toBe("600");
    legend()[2]!.click();
    await settle();
    expect(legend()[2]!.getAttribute("aria-pressed")).toBe("false");
    expect($("svg text.text-2xl").textContent).toBe("300");
    expect(points()[2]!.getAttribute("display")).toBe("none");
    expect(points()[0]!.getAttribute("aria-label")).toContain("33.3%");
    await expectNoA11yViolations(document.body);
    legend()[1]!.click();
    await settle();
    legend()[0]!.click(); // the last visible slice stays
    await settle();
    expect(legend()[0]!.getAttribute("aria-pressed")).toBe("true");
    legend()[2]!.click();
    await settle();
    expect(legend()[2]!.getAttribute("aria-pressed")).toBe("true");
    expect(points()[2]!.hasAttribute("display")).toBe(false);
  });

  it("keyboard navigation skips hidden slices", async () => {
    await boot(Pie);
    legend()[1]!.click();
    await settle();
    points()[0]!.focus();
    key(points()[0]!, "ArrowRight");
    await settle();
    expect(document.activeElement).toBe(points()[2]);
  });
});
