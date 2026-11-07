// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { form, required } from "@gable/core/forms";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiInputClear } from "./input-clear.js";
import { $, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiInputClear],
    template: html`
      <ui-input-clear class="plain" [(value)]="query" label="Search" clearLabel="Clear search" placeholder="Search..." (cleared)="onCleared()"></ui-input-clear>
      <ui-input-clear class="bound" [field]="f.name" label="Name"></ui-input-clear>
      <ui-input-clear class="off" [disabled]="true" value="kept" label="Disabled"></ui-input-clear>
      <ui-input-clear class="ro" [readonly]="true" value="kept" label="Read only"></ui-input-clear>
      <ui-input-clear class="small" density="compact" value="x" label="Compact"></ui-input-clear>
    `,
  };
  query = signal("");
  cleared = signal(0);
  onCleared() {
    this.cleared.set(this.cleared() + 1);
  }
  model = signal({ name: "start" });
  f = form(this.model, (p) => {
    required(p.name);
  });
}

const input = (cls: string) => $<HTMLInputElement>(`.${cls} input`);
const button = (cls: string) => document.querySelector<HTMLButtonElement>(`.${cls} button`);
const type = async (el: HTMLInputElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
};

describe("ui-input-clear", () => {
  it("shows the clear button only while there is a value", async () => {
    await boot(App);
    expect(button("plain")).toBeNull();
    await type(input("plain"), "hello");
    const clear = button("plain")!;
    expect(clear.getAttribute("aria-label")).toBe("Clear search");
    expect(clear.type).toBe("button");
    expect(clear.tabIndex).toBe(0);
  });

  it("clears the value, returns focus to the input and emits cleared", async () => {
    const app = await boot(App);
    await type(input("plain"), "hello");
    expect(app.query()).toBe("hello");
    button("plain")!.click();
    await settle();
    expect(app.query()).toBe("");
    expect(input("plain").value).toBe("");
    expect(document.activeElement).toBe(input("plain"));
    expect(app.cleared()).toBe(1);
    expect(button("plain")).toBeNull();
  });

  it("clears on Escape", async () => {
    const app = await boot(App);
    await type(input("plain"), "abc");
    key(input("plain"), "Escape");
    await settle();
    expect(app.query()).toBe("");
  });

  it("is hidden while disabled or read-only", async () => {
    await boot(App);
    expect(input("off").value).toBe("kept");
    expect(button("off")).toBeNull();
    expect(button("ro")).toBeNull();
  });

  it("works with [field]: clearing updates the field and marks it touched", async () => {
    const app = await boot(App);
    expect(input("bound").value).toBe("start");
    expect(app.f.name.state.touched()).toBe(false);
    button("bound")!.click();
    await settle();
    expect(app.model().name).toBe("");
    expect(app.f.name.state.touched()).toBe(true);
    expect(input("bound").getAttribute("aria-invalid")).toBe("true");
  });

  it("applies the compact classes", async () => {
    await boot(App);
    expect(input("small").className).toContain("h-6.5");
    expect(input("plain").className).toContain("h-9");
  });

  it("has no axe violations", async () => {
    await boot(App);
    await type(input("plain"), "hello");
    await expectNoA11yViolations(document.body);
  });
});
