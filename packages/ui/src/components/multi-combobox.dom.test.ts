// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiMultiCombobox } from "./combobox.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();
const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
g.CSS ??= {};
g.CSS.escape ??= (s) => s.replace(/([^\w-])/g, "\\$1");

class App {
  static meta = {
    selector: "app-root",
    imports: [UiMultiCombobox],
    template: html`<ui-multi-combobox label="Frameworks" [items]="items" [(value)]="picked" placeholder="Add..."></ui-multi-combobox>`,
  };
  items = [
    { value: "next", label: "Next.js" },
    { value: "svelte", label: "SvelteKit" },
    { value: "nuxt", label: "Nuxt" },
  ];
  picked = signal<string[]>(["next"]);
}

const chips = () => $$("[data-chip]").map((c) => c.textContent!.trim());
const input = () => $("input") as HTMLInputElement;

describe("UiMultiCombobox", () => {
  it("shows the picked values as chips and an array model", async () => {
    await boot(App);
    expect(chips()).toEqual(["Next.js"]);
    expect(input().getAttribute("placeholder")).toBeFalsy();
  });

  it("picking options adds chips in order and keeps the list open", async () => {
    const app = await boot(App);
    input().focus();
    input().click();
    await settle();
    const option = (label: string) => $$("[role=option]").find((o) => o.textContent!.includes(label))!;
    option("Nuxt").click();
    await settle();
    expect(app.picked()).toEqual(["next", "nuxt"]);
    expect(chips()).toEqual(["Next.js", "Nuxt"]);
    expect(option("Nuxt").getAttribute("aria-selected")).toBe("true");
    // Picking a picked option again removes it.
    option("Next.js").click();
    await settle();
    expect(app.picked()).toEqual(["nuxt"]);
  });

  it("the chip remove button removes that value", async () => {
    const app = await boot(App);
    app.picked.set(["next", "svelte"]);
    await settle();
    const remove = $$("[data-chip-remove]")[0] as HTMLButtonElement;
    expect(remove.getAttribute("aria-label")).toBe("Remove Next.js");
    remove.click();
    await settle();
    expect(app.picked()).toEqual(["svelte"]);
  });

  it("Backspace in the empty input removes the last chip; with text typed it does not", async () => {
    const app = await boot(App);
    app.picked.set(["next", "svelte"]);
    await settle();
    input().focus();
    input().value = "nu";
    key(input(), "Backspace");
    await settle();
    expect(app.picked()).toEqual(["next", "svelte"]);
    input().value = "";
    key(input(), "Backspace");
    await settle();
    expect(app.picked()).toEqual(["next"]);
  });

  it("has no axe violations", async () => {
    const { expectNoA11yViolations } = await import("@gable/testing/a11y");
    const app = await boot(App);
    app.picked.set(["next", "nuxt"]);
    await settle();
    await expectNoA11yViolations(document.body);
  });
});
