// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiRangeSlider } from "./slider.js";
import { $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiRangeSlider],
    template: html`<ui-range-slider [(value)]="range" [min]="0" [max]="100" [step]="10" [minGap]="1" [labels]="labels()"></ui-range-slider>`,
  };
  range = signal([20, 80]);
  labels = signal(["Minimum", "Maximum"]);
}

const thumbs = () => $$("[data-scope=slider][data-part=thumb]");

describe("UiRangeSlider", () => {
  it("renders one named slider per value", async () => {
    await boot(App);
    expect(thumbs().map((t) => [t.getAttribute("role"), t.getAttribute("aria-label"), t.getAttribute("aria-valuenow")])).toEqual([
      ["slider", "Minimum", "20"],
      ["slider", "Maximum", "80"],
    ]);
    expect($$("ui-range-slider input[hidden]").length).toBe(2);
  });

  it("the keyboard moves each thumb on its own and writes the array model", async () => {
    const app = await boot(App);
    const [low, high] = thumbs();
    low.focus();
    key(low, "ArrowRight");
    await settle();
    expect(app.range()).toEqual([30, 80]);
    high.focus();
    key(high, "ArrowLeft");
    await settle();
    expect(app.range()).toEqual([30, 70]);
    key(high, "End");
    await settle();
    expect(app.range()).toEqual([30, 100]);
  });

  it("the thumbs cannot cross and keep the minimum gap", async () => {
    const app = await boot(App);
    const [low] = thumbs();
    low.focus();
    key(low, "End");
    await settle();
    expect(app.range()).toEqual([70, 80]);
    expect(app.range()[0]).toBeLessThan(app.range()[1]);
  });

  it("the model moves the thumbs, and a third value adds a thumb", async () => {
    const app = await boot(App);
    app.range.set([10, 40, 90]);
    app.labels.set(["A", "B", "C"]);
    await settle();
    expect(thumbs().map((t) => t.getAttribute("aria-valuenow"))).toEqual(["10", "40", "90"]);
  });

  it("has no axe violations", async () => {
    const { expectNoA11yViolations } = await import("@gable/testing/a11y");
    await boot(App);
    await expectNoA11yViolations(document.body);
  });
});
