// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiChart, type ChartType } from "./chart.js";
import { $, $$, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

const ROWS = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
];
const SERIES = [{ key: "desktop", label: "Desktop" }, { key: "mobile", label: "Mobile", color: "red" }];

class StackApp {
  static meta = {
    selector: "app-root",
    imports: [UiChart],
    template: html`<ui-chart label="Visitors" [type]="kind()" [data]="rows" xKey="month" [series]="series" [height]="200" [stacked]="stacked()" [animate]="animate()"></ui-chart>`,
  };
  kind = signal<ChartType>("bar");
  stacked = signal(true);
  animate = signal(true);
  rows = ROWS;
  series = SERIES;
}
const legendButtons = () => $$("[data-chart-legend-item]") as HTMLButtonElement[];
const points = () => $$("[data-chart-point]");

describe("Chart stacked series", () => {
  it("stacks bars in one column per category, sharing the scale of the sums", async () => {
    await boot(StackApp);
    const bars = $$("svg rect[rx]");
    expect(bars).toHaveLength(6);
    // desktop and mobile of January: same x and width, mobile sits on top of desktop
    expect(bars[1].getAttribute("x")).toBe(bars[0].getAttribute("x"));
    expect(bars[1].getAttribute("width")).toBe(bars[0].getAttribute("width"));
    expect(Number(bars[1].getAttribute("y")) + Number(bars[1].getAttribute("height"))).toBeCloseTo(Number(bars[0].getAttribute("y")), 1);
    // the scale reaches the largest total (305 + 200), so its top tick is above 500
    expect($$("svg text").some((t) => t.textContent === "600")).toBe(true);
  });

  it("stacks areas: the fill of the second series is bounded below by the first", async () => {
    const app = await boot(StackApp);
    app.kind.set("area");
    await settle();
    const paths = $$("svg path");
    expect(paths).toHaveLength(4);
    expect(paths[0].getAttribute("d")).toMatch(/Z$/);
    // each stacked fill returns along the top of the series under it (3 points); the first one along the baseline
    const back = (d: string) => d.split(" L ").slice(3).join(" L ");
    expect(back(paths[2].getAttribute("d")!)).not.toBe(back(paths[0].getAttribute("d")!));
    expect(paths[2].getAttribute("d")!.match(/ L /g)!.length).toBe(5);
  });
});

describe("Chart legend toggling", () => {
  it("legend entries are buttons with aria-pressed that hide and show a series", async () => {
    const app = await boot(StackApp);
    app.stacked.set(false);
    await settle();
    expect(legendButtons().map((b) => [b.textContent!.trim(), b.getAttribute("aria-pressed")])).toEqual([["Desktop", "true"], ["Mobile", "true"]]);
    legendButtons()[1].click();
    await settle();
    expect(legendButtons()[1].getAttribute("aria-pressed")).toBe("false");
    expect($$("svg rect[rx]")).toHaveLength(3);
    expect(points()[0].getAttribute("aria-label")).toBe("January: Desktop 186");
    // the data table keeps every series
    expect($$("table thead th")).toHaveLength(3);
    // the last visible series cannot be hidden
    legendButtons()[0].click();
    await settle();
    expect(legendButtons()[0].getAttribute("aria-pressed")).toBe("true");
    legendButtons()[1].click();
    await settle();
    expect($$("svg rect[rx]")).toHaveLength(6);
  });

  it("is a native button, so Enter and Space work; hiding one series restacks the rest on the baseline", async () => {
    await boot(StackApp);
    legendButtons()[0].focus();
    expect(legendButtons()[0].tagName).toBe("BUTTON");
    expect(legendButtons()[0].type).toBe("button");
    legendButtons()[0].click();
    await settle();
    const bars = $$("svg rect[rx]");
    expect(bars).toHaveLength(3);
    const base = $("svg line.stroke-border:not([stroke-dasharray])");
    expect(Number(bars[0].getAttribute("y")) + Number(bars[0].getAttribute("height"))).toBeCloseTo(Number(base.getAttribute("y1")), 1);
  });

  it("pie legends are toggles too (see chart-zoom tests for slice toggling)", async () => {
    const app = await boot(StackApp);
    app.kind.set("pie");
    await settle();
    expect(legendButtons()).toHaveLength(3);
  });
});

describe("Chart enter animation", () => {
  it("animates marks in with a motion-reduce opt-out, and can be switched off", async () => {
    const app = await boot(StackApp);
    expect($("svg rect[rx]").getAttribute("class")).toContain("animate-in");
    expect($("svg rect[rx]").getAttribute("class")).toContain("motion-reduce:animate-none");
    app.animate.set(false);
    await settle();
    expect($("svg rect[rx]").getAttribute("class") ?? "").not.toContain("animate-in");
  });

  it("has no axe violations with stacked bars and a hidden series", async () => {
    const { expectNoA11yViolations } = await import("@gable/testing/a11y");
    await boot(StackApp);
    legendButtons()[1].click();
    await settle();
    await expectNoA11yViolations(document.body);
  });
});
