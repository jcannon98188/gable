// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiButton } from "./button.js";
import { DialogTrigger, UiDialog } from "./dialog.js";
import { PopoverTrigger, UiPopover } from "./popover.js";
import { UiSelect } from "./select.js";
import { UiTab, UiTabs } from "./tabs.js";
import { $, key, pointer, settle, useDomApp } from "../test-utils.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiDialog, DialogTrigger, UiPopover, PopoverTrigger, UiSelect, UiTabs, UiTab, UiButton],
    template: html`<button id="outside" uiButton>Outside</button>
      <ui-dialog [(open)]="dialogOpen" heading="Edit profile" description="Change your details.">
        <button data-t="dialog-trigger" slot="trigger" dialogTrigger uiButton>Edit</button>
        <input id="name" />
        <div slot="footer"><button id="save" uiButton (click)="dialogOpen.set(false)">Save</button></div>
      </ui-dialog>
      <ui-popover [(open)]="popoverOpen">
        <button data-t="popover-trigger" slot="trigger" popoverTrigger uiButton variant="outline">Dimensions</button>
        <input id="width" />
      </ui-popover>
      <ui-select [items]="fruit" [(value)]="chosen" placeholder="Pick"></ui-select>
      <ui-tabs [(value)]="tab">
        <ui-tab value="a" label="A">pa</ui-tab>
        <ui-tab value="b" label="B">pb</ui-tab>
      </ui-tabs>`,
  };
  dialogOpen = signal(false);
  popoverOpen = signal(false);
  chosen = signal("");
  tab = signal("");
  fruit = [
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
    { value: "cherry", label: "Cherry", disabled: true },
  ];
}

const boot = useDomApp();
let style: HTMLStyleElement | undefined;
afterEach(() => {
  style?.remove();
  style = undefined;
});
const css = (text: string) => {
  style = document.createElement("style");
  style.textContent = text;
  document.head.append(style);
};
const ended = (el: Element) => el.dispatchEvent(new Event("animationend", { bubbles: true }));

describe("Dialog in jsdom", () => {
  it("opens from the trigger, moves focus in, traps the page behind it and closes on Escape", async () => {
    const app = await boot(App);
    const content = $("[role=dialog]");
    expect(content.parentElement!.parentElement).toBe(document.body); // portalled
    $("[data-t=dialog-trigger]").click();
    await settle();
    expect(app.dialogOpen()).toBe(true);
    expect(content.hidden).toBe(false);
    expect(content.contains(document.activeElement)).toBe(true);
    expect($("#outside").closest("[aria-hidden=true]") ?? $("#outside").getAttribute("aria-hidden")).toBeTruthy();
    key(document.activeElement!, "Escape");
    await settle();
    expect(app.dialogOpen()).toBe(false);
    expect(content.hidden).toBe(true);
    expect(document.activeElement).toBe($("[data-t=dialog-trigger]"));
  });

  it("closes on a click outside the panel", async () => {
    const app = await boot(App);
    app.dialogOpen.set(true);
    await settle();
    pointer($("[data-part=backdrop]"), "pointerdown");
    $("[data-part=backdrop]").click();
    await settle();
    expect(app.dialogOpen()).toBe(false);
  });

  it("stays visible while its exit animation runs, then hides", async () => {
    css("[data-state=closed] { animation: out 0.3s; }");
    const app = await boot(App);
    app.dialogOpen.set(true);
    await settle();
    const content = $("[role=dialog]");
    $("#save").click();
    await settle();
    expect(app.dialogOpen()).toBe(false);
    expect(content.getAttribute("data-state")).toBe("closed");
    expect(content.hidden).toBe(false);
    ended(content);
    await settle();
    expect(content.hidden).toBe(true);
  });
});

describe("Popover in jsdom", () => {
  it("opens, closes on Escape and on an outside press, and returns focus to the trigger", async () => {
    const app = await boot(App);
    expect($("[data-scope=popover][data-part=content]").hidden).toBe(true);
    $("[data-t=popover-trigger]").click();
    await settle();
    expect(app.popoverOpen()).toBe(true);
    expect($("[data-scope=popover][data-part=content]").hidden).toBe(false);
    expect($("[data-t=popover-trigger]").getAttribute("aria-expanded")).toBe("true");
    // the Zag positioner is placed by Floating UI
    expect($("[data-scope=popover][data-part=positioner]").style.position).not.toBe("");
    key($("#width"), "Escape");
    await settle();
    expect(app.popoverOpen()).toBe(false);

    app.popoverOpen.set(true);
    await settle();
    pointer($("#outside"), "pointerdown");
    pointer($("#outside"), "pointerup");
    $("#outside").click();
    await settle();
    expect(app.popoverOpen()).toBe(false);
  });
});

describe("Select in jsdom", () => {
  it("opens with the keyboard, highlights, picks and closes", async () => {
    const app = await boot(App);
    const trigger = $("[role=combobox]");
    trigger.focus();
    key(trigger, "ArrowDown");
    await settle();
    expect($("[role=listbox]").hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    key($("[role=listbox]"), "ArrowDown");
    await settle();
    key($("[role=listbox]"), "Enter");
    await settle();
    expect(app.chosen()).toBe("banana");
    expect(trigger.textContent).toContain("Banana");
    expect($("[role=listbox]").hidden).toBe(true);
  });

  it("picks with a click and does not pick a disabled option", async () => {
    const app = await boot(App);
    $("[role=combobox]").click();
    await settle();
    document.querySelector<HTMLElement>("[data-value=cherry]")!.click();
    await settle();
    expect(app.chosen()).toBe("");
    document.querySelector<HTMLElement>("[data-value=banana]")!.click();
    await settle();
    expect(app.chosen()).toBe("banana");
  });
});

describe("Tabs in jsdom", () => {
  it("selects with a click and with the arrow keys", async () => {
    const app = await boot(App);
    expect($("[role=tabpanel]:not([hidden])").textContent).toContain("pa");
    $("[role=tab][data-value=b]").click();
    await settle();
    expect(app.tab()).toBe("b");
    expect($("[role=tabpanel]:not([hidden])").textContent).toContain("pb");
    key($("[role=tab][data-value=b]"), "ArrowLeft");
    await settle();
    expect(app.tab()).toBe("a");
  });
});
