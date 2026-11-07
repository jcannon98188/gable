// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiAlertDialog } from "./alert-dialog.js";
import { UiButton } from "./button.js";
import { DialogTrigger } from "./dialog.js";
import { UiCombobox } from "./combobox.js";
import { UiContextMenu } from "./context-menu.js";
import { MenuTrigger, UiDropdownMenu, type MenuEntry } from "./dropdown-menu.js";
import { UiPagination } from "./pagination.js";
import { UiScrollArea } from "./scroll-area.js";
import { UiSheet } from "./sheet.js";
import { $, $$, key, pointer, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();
const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
g.CSS ??= {};
g.CSS.escape ??= (s) => s.replace(/([^\w-])/g, "\\$1");

class App {
  static meta = {
    selector: "app-root",
    imports: [DialogTrigger, UiAlertDialog, UiSheet, UiPagination, UiScrollArea, UiDropdownMenu, MenuTrigger, UiContextMenu, UiCombobox, UiButton],
    template: html`
      <ui-alert-dialog heading="Delete?" description="Gone for good." confirmLabel="Delete" (confirmed)="onConfirm()" [(open)]="alertOpen">
        <button slot="trigger" dialogTrigger uiButton class="alert-trigger">Delete</button>
      </ui-alert-dialog>
      <ui-sheet heading="Settings" side="right" [(open)]="sheetOpen"><button slot="trigger" dialogTrigger uiButton class="sheet-trigger">Open</button>Body</ui-sheet>
      <ui-pagination [(page)]="page" [count]="100" [pageSize]="10"></ui-pagination>
      <ui-scroll-area class="h-10"><p>long</p></ui-scroll-area>
      <ui-dropdown-menu [entries]="entries()" (selected)="picked.set($event)" (checkedChange)="onCheck($event)">
        <button slot="trigger" menuTrigger uiButton class="menu-trigger">Menu</button>
      </ui-dropdown-menu>
      <ui-context-menu [entries]="entries()" (selected)="picked.set($event)" class="ctx">Right click</ui-context-menu>
      <ui-combobox [items]="fruits" [(value)]="fruit"></ui-combobox>
    `,
  };
  alertOpen = signal(false);
  sheetOpen = signal(false);
  confirmed = signal(0);
  onConfirm() {
    this.confirmed.update((n) => n + 1);
  }
  page = signal(1);
  picked = signal("");
  entries = signal<MenuEntry[]>([
    { type: "label", label: "Account" },
    { value: "profile", label: "Profile" },
    { type: "separator" },
    { type: "checkbox", value: "bar", label: "Show bar", checked: false },
  ]);
  onCheck(e: { value: string; checked: boolean }) {
    this.entries.update((list) => list.map((x) => (x.type === "checkbox" && x.value === e.value ? { ...x, checked: e.checked } : x)));
  }
  fruits = [
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
    { value: "cherry", label: "Cherry" },
  ];
  fruit = signal("");
}

describe("alert dialog and sheet", () => {
  it("alert dialog has role alertdialog and confirm emits and closes", async () => {
    const app = await boot(App);
    $(".alert-trigger").click();
    await settle();
    expect($("[role=alertdialog]")).toBeTruthy();
    const confirm = $$("button").find((b) => b.textContent?.trim() === "Delete" && b.closest("[role=alertdialog]"))!;
    confirm.click();
    await settle();
    expect(app.confirmed()).toBe(1);
    expect(app.alertOpen()).toBe(false);
  });
  it("sheet opens as a dialog and closes on Escape", async () => {
    const app = await boot(App);
    $(".sheet-trigger").click();
    await settle();
    expect(app.sheetOpen()).toBe(true);
    expect($("[role=dialog]").textContent).toContain("Settings");
    key($("[role=dialog]"), "Escape");
    await settle();
    expect(app.sheetOpen()).toBe(false);
  });
});

describe("pagination and scroll area", () => {
  it("navigates pages", async () => {
    const app = await boot(App);
    const next = $$("nav button").find((b) => b.textContent?.includes("Next"))!;
    next.click();
    await settle();
    expect(app.page()).toBe(2);
    expect($("nav [aria-current=page]").textContent?.trim()).toBe("2");
  });
  it("renders the scroll area content", async () => {
    await boot(App);
    expect($("ui-scroll-area p").textContent).toBe("long");
  });
});

describe("menus", () => {
  it("dropdown opens, selects an item and toggles a checkbox item", async () => {
    const app = await boot(App);
    $(".menu-trigger").click();
    await settle();
    const items = $$("[role=menu][data-state=open] [role=menuitem]");
    expect(items.map((i) => i.textContent?.trim())).toEqual(["Profile"]);
    items[0].click();
    await settle();
    expect(app.picked()).toBe("profile");
    $(".menu-trigger").click();
    await settle();
    $("[role=menuitemcheckbox]").click();
    await settle();
    expect((app.entries()[3] as { checked: boolean }).checked).toBe(true);
  });
  it("context menu opens on contextmenu", async () => {
    await boot(App);
    $("ui-context-menu").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await settle();
    const open = $$("[role=menu]").some((m) => m.getAttribute("data-state") === "open");
    expect(open).toBe(true);
  });
});

describe("combobox", () => {
  it("filters by typing and picks an item", async () => {
    const app = await boot(App);
    const input = $<HTMLInputElement>("ui-combobox input");
    input.focus();
    input.value = "ban";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    const options = $$("[role=option]");
    expect(options.map((o) => o.textContent?.trim())).toEqual(["Banana"]);
    options[0].click();
    await settle();
    expect(app.fruit()).toBe("banana");
  });
});
void pointer;
