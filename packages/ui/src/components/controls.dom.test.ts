// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiCheckbox } from "./checkbox.js";
import { UiSwitch } from "./switch.js";
import { $, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiCheckbox, UiSwitch],
    template: html`<ui-checkbox [(value)]="accepted" [indeterminate]="mixed()" [disabled]="off()">Accept terms</ui-checkbox>
      <ui-switch [(value)]="on">Airplane</ui-switch>`,
  };
  accepted = signal(false);
  mixed = signal(false);
  off = signal(false);
  on = signal(false);
}

const box = () => $("[data-scope=checkbox][data-part=control]");
const track = () => $("[data-scope=switch][data-part=control]");

describe("Checkbox in jsdom", () => {
  it("renders an unchecked box with its label and a hidden input", async () => {
    await boot(App);
    expect(box().getAttribute("data-state")).toBe("unchecked");
    expect($("input[type=checkbox]").getAttribute("aria-labelledby")).toBeTruthy();
    expect($("[data-scope=checkbox][data-part=label]").textContent).toContain("Accept terms");
    expect($("[data-scope=checkbox][data-part=indicator]").hidden).toBe(true);
  });

  it("toggles on a label click and writes the model", async () => {
    const app = await boot(App);
    $("[data-scope=checkbox][data-part=root]").click();
    await settle();
    expect(app.accepted()).toBe(true);
    expect(box().getAttribute("data-state")).toBe("checked");
    expect($("[data-scope=checkbox][data-part=indicator]").hidden).toBe(false);
    $("[data-scope=checkbox][data-part=root]").click();
    await settle();
    expect(app.accepted()).toBe(false);
  });

  it("follows the model, indeterminate and disabled", async () => {
    const app = await boot(App);
    app.accepted.set(true);
    await settle();
    expect(box().getAttribute("data-state")).toBe("checked");
    app.mixed.set(true);
    await settle();
    expect(box().getAttribute("data-state")).toBe("indeterminate");
    app.off.set(true);
    await settle();
    expect(box().hasAttribute("data-disabled")).toBe(true);
    expect($("input[type=checkbox]").hasAttribute("disabled")).toBe(true);
  });
});

describe("Switch in jsdom", () => {
  it("toggles on a click and follows the model", async () => {
    const app = await boot(App);
    expect(track().getAttribute("data-state")).toBe("unchecked");
    $("[data-scope=switch][data-part=root]").click();
    await settle();
    expect(app.on()).toBe(true);
    expect(track().getAttribute("data-state")).toBe("checked");
    app.on.set(false);
    await settle();
    expect(track().getAttribute("data-state")).toBe("unchecked");
  });
});
