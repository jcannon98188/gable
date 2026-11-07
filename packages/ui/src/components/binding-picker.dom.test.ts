// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiBindingPicker } from "./binding-picker.js";
import type { CommandItem } from "./command.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const SIGNALS: CommandItem[] = [
  { value: "count", label: "count", badge: "number" },
  { value: "name", label: "name", badge: "string" },
  { value: "items", label: "items", badge: "Item[]" },
];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiBindingPicker],
    template: html`<ui-binding-picker id="picker" [items]="signals" [(value)]="bound" [(open)]="open" (picked)="picks.push($event)"></ui-binding-picker>`,
  };
  signals = SIGNALS;
  bound = signal<string | null>(null);
  open = signal(false);
  picks: string[] = [];
}

const boot = useDomApp();
const trigger = () => $<HTMLButtonElement>("#picker [aria-haspopup]");
const options = () => $$("[role=option]");

describe("BindingPicker", () => {
  it("shows the placeholder, opens a list of signals with type tags", async () => {
    const app = await boot(App);
    expect(trigger().textContent!.trim()).toBe("Bind to...");
    trigger().click();
    await settle();
    expect(app.open()).toBe(true);
    expect(options()).toHaveLength(3);
    expect($$("[data-part=badge]").map((b) => b.textContent)).toEqual(["number", "string", "Item[]"]);
  });

  it("searches the type tag too", async () => {
    await boot(App);
    trigger().click();
    await settle();
    const input = $<HTMLInputElement>("[role=combobox]");
    input.value = "string";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(options().map((o) => o.textContent!.trim())).toEqual(["namestring"]);
  });

  it("choosing closes the popover, focuses the trigger and emits the value", async () => {
    const app = await boot(App);
    trigger().click();
    await settle();
    options()[1]!.click();
    await settle();
    expect(app.picks).toEqual(["name"]);
    expect(app.bound()).toBe("name");
    expect(app.open()).toBe(false);
    expect(trigger().textContent!.trim()).toBe("name");
    expect(document.activeElement).toBe(trigger());
  });

  it("chooses with the keyboard, and Escape closes without choosing", async () => {
    const app = await boot(App);
    trigger().click();
    await settle();
    const input = $<HTMLInputElement>("[role=combobox]");
    key(input, "ArrowDown");
    key(input, "Enter");
    await settle();
    expect(app.picks).toEqual(["name"]);
    app.open.set(true);
    await settle();
    key($("[role=combobox]"), "Escape");
    await settle();
    expect(app.open()).toBe(false);
    expect(app.picks).toEqual(["name"]);
  });

  it("has no axe violations open", async () => {
    await boot(App);
    trigger().click();
    await settle();
    await expectNoA11yViolations(document.body);
  });
});
