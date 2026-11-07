// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiSwatchGrid, type SwatchItem } from "./swatch-grid.js";
import { $, $$, key, pointer, settle, useDomApp } from "../test-utils.js";

const ITEMS: SwatchItem[] = [
  { value: "red", label: "Red 500", color: "#ef4444" },
  { value: "green", label: "Green 500", color: "#22c55e" },
  { value: "blue", label: "Blue 500", color: "#3b82f6" },
  { value: "amber", label: "Amber 500", color: "#f59e0b", disabled: true },
  { value: "p4", label: "Spacing 4", content: "4" },
  { value: "p8", label: "Spacing 8", content: "8" },
];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiSwatchGrid],
    template: html`<button id="before">before</button><ui-swatch-grid id="grid" [items]="items" [(value)]="picked" [columns]="3" label="Colour" (hovered)="log.push($event)"></ui-swatch-grid>`,
  };
  items = ITEMS;
  picked = signal<string | null>(null);
  log: (string | null)[] = [];
}

const boot = useDomApp();
const cells = () => $$<HTMLButtonElement>("#grid [role=radio]");
const focused = () => document.activeElement?.getAttribute("aria-label");

describe("SwatchGrid", () => {
  it("renders a radio group of cells with colours, content and labels", async () => {
    await boot(App);
    expect($("#grid [role=radiogroup]").getAttribute("aria-label")).toBe("Colour");
    expect(cells()).toHaveLength(6);
    expect(cells()[0]!.style.backgroundColor).not.toBe("");
    expect(cells()[0]!.getAttribute("aria-label")).toBe("Red 500");
    expect(cells()[4]!.textContent).toBe("4");
    expect(cells()[3]!.disabled).toBe(true);
    expect($("#grid [role=radiogroup]").getAttribute("style")).toContain("repeat(3");
  });

  it("has one tab stop: the first enabled cell, then the chosen one", async () => {
    const app = await boot(App);
    expect(cells().map((c) => c.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
    cells()[2]!.click();
    await settle();
    expect(app.picked()).toBe("blue");
    expect(cells().map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false", "false", "false"]);
    expect(cells().map((c) => c.tabIndex)).toEqual([-1, -1, 0, -1, -1, -1]);
  });

  it("moves focus with the arrow keys on both axes, skipping disabled cells", async () => {
    await boot(App);
    cells()[0]!.focus();
    key(cells()[0]!, "ArrowRight");
    await settle();
    expect(focused()).toBe("Green 500");
    key(document.activeElement!, "ArrowDown");
    await settle();
    expect(focused()).toBe("Spacing 4");
    key(document.activeElement!, "ArrowUp");
    await settle();
    expect(focused()).toBe("Green 500");
    key(document.activeElement!, "ArrowRight");
    await settle();
    expect(focused()).toBe("Blue 500");
    key(document.activeElement!, "ArrowDown");
    await settle();
    // the cell below Blue 500 is Spacing... index 5 is p8 (index 2 + 3): not disabled
    expect(focused()).toBe("Spacing 8");
    key(document.activeElement!, "Home");
    await settle();
    expect(focused()).toBe("Red 500");
    key(document.activeElement!, "End");
    await settle();
    expect(focused()).toBe("Spacing 8");
    key(document.activeElement!, "ArrowRight");
    await settle();
    expect(focused()).toBe("Spacing 8");
    // Left from Spacing 4 skips the disabled Amber cell
    cells()[4]!.focus();
    key(cells()[4]!, "ArrowLeft");
    await settle();
    expect(focused()).toBe("Blue 500");
    // the roving stop follows focus
    expect(cells().map((c) => c.tabIndex)).toEqual([-1, -1, 0, -1, -1, -1]);
  });

  it("chooses with a click (what Enter and Space do on a button)", async () => {
    const app = await boot(App);
    cells()[1]!.focus();
    cells()[1]!.click();
    await settle();
    expect(app.picked()).toBe("green");
  });

  it("reports the hovered or focused value and null when it leaves", async () => {
    const app = await boot(App);
    pointer(cells()[1]!, "pointerenter");
    pointer(cells()[1]!, "pointerleave");
    expect(app.log).toEqual(["green", null]);
    app.log.length = 0;
    cells()[0]!.focus();
    key(cells()[0]!, "ArrowRight");
    await settle();
    expect(app.log).toEqual(["red", "green"]);
    $("#before").focus();
    await settle();
    expect(app.log.at(-1)).toBeNull();
    // a disabled cell reports nothing
    app.log.length = 0;
    pointer(cells()[3]!, "pointerenter");
    expect(app.log).toEqual([]);
  });

  it("has no axe violations", async () => {
    await boot(App);
    await expectNoA11yViolations(document.body);
  });
});
