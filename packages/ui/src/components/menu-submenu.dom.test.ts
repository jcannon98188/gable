// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiButton } from "./button.js";
import { UiContextMenu } from "./context-menu.js";
import { MenuTrigger, UiDropdownMenu, menuRows, type MenuEntry } from "./dropdown-menu.js";
import { $, $$, key, pointer, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();
const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
g.CSS ??= {};
g.CSS.escape ??= (s) => s.replace(/([^\w-])/g, "\\$1");

class App {
  static meta = {
    selector: "app-root",
    imports: [UiDropdownMenu, MenuTrigger, UiButton],
    template: html`
      <ui-dropdown-menu [entries]="entries()" (selected)="picked.set($event)" (checkedChange)="onCheck($event)" (radioChange)="onRadio($event)">
        <button slot="trigger" menuTrigger uiButton class="menu-trigger">Menu</button>
      </ui-dropdown-menu>
    `,
  };
  picked = signal("");
  entries = signal<MenuEntry[]>([
    { value: "new", label: "New file" },
    {
      type: "submenu",
      value: "share",
      label: "Share",
      entries: [
        { value: "email", label: "Email" },
        { type: "checkbox", value: "public", label: "Public", checked: false },
        { type: "submenu", value: "social", label: "Social", entries: [{ value: "mastodon", label: "Mastodon" }] },
      ],
    },
    { type: "separator" },
    {
      type: "radio-group",
      name: "theme",
      label: "Theme",
      value: "light",
      items: [
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ],
    },
    { type: "submenu", value: "archive", label: "Archive", disabled: true, entries: [{ value: "zip", label: "Zip" }] },
  ]);
  onCheck(e: { value: string; checked: boolean }) {
    const flip = (list: MenuEntry[]): MenuEntry[] => list.map((x) => (x.type === "checkbox" && x.value === e.value ? { ...x, checked: e.checked } : x.type === "submenu" ? { ...x, entries: flip(x.entries) } : x));
    this.entries.update(flip);
  }
  onRadio(e: { group: string; value: string }) {
    this.entries.update((list) => list.map((x) => (x.type === "radio-group" && x.name === e.group ? { ...x, value: e.value } : x)));
  }
}

/** The pointer highlights an item; ArrowRight on the menu then opens its submenu. */
const openSub = async (label: string) => {
  const el = trigger(label);
  pointer(el, "pointermove");
  await settle();
  key(el, "ArrowRight");
  await settle();
};
const within = (root: Element, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
const open = async () => {
  $(".menu-trigger").click();
  await settle();
};
const trigger = (label: string) => $$("[role=menuitem][aria-haspopup=menu]").find((el) => el.textContent?.includes(label))!;
const submenu = (label: string) => document.getElementById(trigger(label).getAttribute("aria-controls")!)!;
const isOpen = (el: HTMLElement) => el.getAttribute("data-state") === "open" && !el.hidden;

describe("menuRows", () => {
  it("builds submenu and radio rows (no DOM needed for the data)", () => {
    const calls: string[] = [];
    const api = new Proxy({}, { get: () => () => ({}) }) as never;
    const rows = menuRows(
      [
        { type: "submenu", value: "s", label: "S", entries: [{ value: "a", label: "A" }] },
        { type: "radio-group", name: "g", label: "G", value: "y", items: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] },
      ],
      api,
      () => {},
      (group, value) => calls.push(`${group}:${value}`),
    );
    expect(rows.map((r) => [r.kind, r.key])).toEqual([["submenu", "s"], ["radio-group", "group-g"]]);
    expect(rows[0].entries).toHaveLength(1);
    expect(rows[1].options.map((o) => [o.key, o.checked])).toEqual([["x", false], ["y", true]]);
  });
});

describe("menu submenus", () => {
  it("renders a submenu trigger as a menuitem with aria-haspopup and a closed panel", async () => {
    await boot(App);
    await open();
    const share = trigger("Share");
    expect(share.getAttribute("aria-haspopup")).toBe("menu");
    expect(share.getAttribute("aria-expanded")).toBe("false");
    expect(isOpen(submenu("Share"))).toBe(false);
  });

  it("ArrowRight opens the submenu; ArrowLeft closes it and returns to the trigger", async () => {
    await boot(App);
    await open();
    const share = trigger("Share");
    await openSub("Share");
    const panel = submenu("Share");
    expect(isOpen(panel)).toBe(true);
    expect(share.getAttribute("aria-expanded")).toBe("true");
    expect(within(panel, "[role=menuitem]").length).toBeGreaterThan(0);
    key(panel, "ArrowLeft");
    await settle();
    expect(isOpen(panel)).toBe(false);
    // Menus move focus with aria-activedescendant: the parent menu is focused again with the trigger highlighted.
    expect(document.activeElement).toBe($("[role=menu][data-state=open]"));
    expect($("[role=menu][data-state=open]").getAttribute("aria-activedescendant")).toBe(share.id);
  });

  it("selecting an item in a submenu emits selected and closes the whole menu", async () => {
    const app = await boot(App);
    await open();
    const share = trigger("Share");
    await openSub("Share");
    const email = within(submenu("Share"), "[role=menuitem]").find((el) => el.textContent?.includes("Email"))!;
    email.click();
    await settle();
    expect(app.picked()).toBe("email");
    expect($$("[role=menu]").some(isOpen)).toBe(false);
  });

  it("a checkbox item inside a submenu reports checkedChange to the root", async () => {
    const app = await boot(App);
    await open();
    const share = trigger("Share");
    await openSub("Share");
    $("[role=menuitemcheckbox]").click();
    await settle();
    const sub = app.entries()[1] as Extract<MenuEntry, { type: "submenu" }>;
    expect((sub.entries[1] as { checked: boolean }).checked).toBe(true);
  });

  it("submenus nest", async () => {
    const app = await boot(App);
    await open();
    await openSub("Share");
    await openSub("Social");
    expect(isOpen(submenu("Social"))).toBe(true);
    within(submenu("Social"), "[role=menuitem]")[0].click();
    await settle();
    expect(app.picked()).toBe("mastodon");
  });

});

describe("disabled submenu triggers", () => {
  it("is a disabled menuitem that never opens and is skipped by keyboard navigation", async () => {
    await boot(App);
    await open();
    const archive = trigger("Archive");
    expect(archive.getAttribute("aria-disabled")).toBe("true");
    expect(archive.hasAttribute("data-disabled")).toBe(true);
    pointer(archive, "pointermove");
    await settle();
    key(archive, "ArrowRight");
    archive.click();
    await settle();
    expect(archive.getAttribute("aria-expanded")).not.toBe("true");
    expect($$("[role=menu]").filter(isOpen)).toHaveLength(1);
    const menu = $("[role=menu][data-state=open]");
    menu.focus();
    key(menu, "End");
    await settle();
    expect($("[role=menuitemradio][data-highlighted]").textContent).toContain("Dark");
  });
});

describe("menu radio items", () => {
  it("renders a labelled group of menuitemradio with the chosen option checked", async () => {
    await boot(App);
    await open();
    const group = $("[role=group]");
    expect(document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent).toBe("Theme");
    const radios = within(group, "[role=menuitemradio]");
    expect(radios.map((r) => [r.textContent?.trim(), r.getAttribute("aria-checked")])).toEqual([["Light", "true"], ["Dark", "false"]]);
  });

  it("choosing an option emits radioChange, the data follows and the menu closes", async () => {
    const app = await boot(App);
    await open();
    $$("[role=menuitemradio]")[1].click();
    await settle();
    expect((app.entries()[3] as { value: string }).value).toBe("dark");
    await open();
    expect($$("[role=menuitemradio]").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);
  });

  it("arrow keys move through radio options like any item", async () => {
    await boot(App);
    await open();
    const menu = $("[role=menu][data-state=open]");
    menu.focus();
    key(menu, "End");
    await settle();
    expect($("[role=menuitemradio][data-highlighted]").textContent).toContain("Dark");
  });
});

describe("menu accessibility", () => {
  it("has no axe violations with a submenu open", async () => {
    const { expectNoA11yViolations } = await import("@gable/testing/a11y");
    await boot(App);
    await open();
    await expectNoA11yViolations(document.body);
    await openSub("Share");
    await expectNoA11yViolations(document.body);
  });
});

class CtxApp {
  static meta = {
    selector: "app-root",
    imports: [UiContextMenu],
    template: html`<ui-context-menu [entries]="entries" (selected)="picked.set($event)" (radioChange)="chosen.set($event.value)" class="ctx">Right click</ui-context-menu>`,
  };
  picked = signal("");
  chosen = signal("");
  entries: MenuEntry[] = [
    { type: "submenu", value: "more", label: "More", entries: [{ value: "deep", label: "Deep" }] },
    { type: "radio-group", name: "theme", label: "Theme", value: "light", items: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }] },
  ];
}

describe("context menu", () => {
  it("has submenus and radio items", async () => {
    const app = await boot(CtxApp);
    const contextmenu = () => $("ui-context-menu").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    contextmenu();
    await settle();
    await openSub("More");
    within(submenu("More"), "[role=menuitem]")[0].click();
    await settle();
    expect(app.picked()).toBe("deep");
    contextmenu();
    await settle();
    $$("[role=menuitemradio]")[1].click();
    await settle();
    expect(app.chosen()).toBe("dark");
  });
});
