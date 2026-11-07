// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiButton, buttonVariants } from "./button.js";
import { UiInput } from "./input.js";
import { MenuTrigger, UiDropdownMenu, menuRows, type MenuEntry } from "./dropdown-menu.js";
import { UiSectionHeader, SECTION_HEADER } from "./section-header.js";
import { UiSelect } from "./select.js";
import { UiTab, UiTabs } from "./tabs.js";
import { UiToggle, toggleVariants } from "./toggle.js";
import { UiToggleGroup } from "./toggle-group.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

const ENTRIES: MenuEntry[] = [
  { type: "label", label: "Edit" },
  { value: "cut", label: "Cut" },
  { type: "checkbox", value: "grid", label: "Grid", checked: true },
  { type: "submenu", value: "more", label: "More", entries: [{ value: "deep", label: "Deep" }] },
];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiButton, UiInput, UiSelect, UiToggle, UiToggleGroup, UiTabs, UiTab, UiDropdownMenu, MenuTrigger, UiSectionHeader],
    template: html`
      <h3 uiSectionHeader class="header">Layout</h3>
      <button uiButton class="b-compact" size="compact">Go</button>
      <button uiButton class="b-icon" size="icon-compact" aria-label="Close">x</button>
      <button uiButton class="b-default">Go</button>
      <input uiInput class="i-compact" density="compact" aria-label="Compact input" />
      <input uiInput class="i-default" aria-label="Default input" />
      <ui-select class="s-compact" density="compact" label="Compact select" [items]="items" triggerClass="w-40"></ui-select>
      <button uiToggle class="t-compact" size="compact" aria-label="Bold">B</button>
      <ui-toggle-group class="g-compact" size="compact" [items]="items" [(value)]="chosen"></ui-toggle-group>
      <ui-tabs class="tabs-compact" density="compact" [(value)]="tab">
        <ui-tab value="a" label="A">Panel A</ui-tab>
        <ui-tab value="b" label="B">Panel B</ui-tab>
      </ui-tabs>
      <ui-dropdown-menu density="compact" [entries]="entries" [(open)]="menuOpen">
        <button slot="trigger" menuTrigger uiButton size="compact">Menu</button>
      </ui-dropdown-menu>
    `,
  };
  items = [
    { value: "x", label: "Xray" },
    { value: "y", label: "Yankee" },
  ];
  chosen = signal<string[]>([]);
  tab = signal("a");
  entries = ENTRIES;
  menuOpen = signal(false);
}

describe("compact density", () => {
  it("button, toggle and the variant functions have compact sizes", () => {
    expect(buttonVariants({ size: "compact" })).toContain("h-6.5");
    expect(buttonVariants({ size: "compact" })).toContain("text-xs");
    expect(buttonVariants({ size: "compact" })).not.toContain("h-9");
    expect(buttonVariants({ size: "icon-compact" })).toContain("size-6.5");
    expect(toggleVariants({ size: "compact" })).toContain("h-6.5");
    expect(toggleVariants({ size: "compact" })).not.toContain("text-sm");
    expect(toggleVariants({ size: "compact", class: "h-8" })).toContain("h-8");
  });

  it("applies the compact classes to every control", async () => {
    await boot(App);
    expect($(".b-compact").className).toContain("h-6.5");
    expect($(".b-icon").className).toContain("size-6.5");
    expect($(".b-default").className).toContain("h-9");
    expect($(".i-compact").className).toContain("h-6.5");
    expect($(".i-compact").className).toContain("text-xs");
    expect($(".i-compact").className).not.toContain("h-9");
    expect($(".i-default").className).toContain("h-9");
    expect($("button[aria-label=\"Compact select\"]").className).toContain("h-6.5");
    expect($("button[aria-label=\"Compact select\"]").className).not.toContain("h-9");
    expect($(".t-compact").className).toContain("h-6.5");
    expect($$(".g-compact button").every((b) => b.className.includes("h-6.5"))).toBe(true);
    expect($(".tabs-compact [role=tablist]").className).toContain("h-6.5");
    expect($(".tabs-compact [role=tab]").className).toContain("text-xs");
  });

  it("makes menu rows compact, submenus included", async () => {
    await boot(App);
    $("button[aria-haspopup=menu]").click();
    await settle();
    const cut = $$("[role=menuitem]").find((el) => el.textContent?.trim() === "Cut")!;
    expect(cut.className).toContain("min-h-6");
    expect(cut.className).toContain("text-xs");
    expect(cut.className).not.toContain("py-1.5");
    const more = $$("[role=menuitem]").find((el) => el.textContent?.includes("More"))!;
    expect(more.className).toContain("min-h-6");
    key(more, "ArrowRight");
    await settle();
    const deep = $$("[role=menuitem]").find((el) => el.textContent?.trim() === "Deep")!;
    expect(deep.className).toContain("min-h-6");
  });

  it("menuRows keeps the default density unless asked", () => {
    const api = new Proxy({}, { get: () => () => ({}) }) as never;
    const entries: MenuEntry[] = [{ value: "a", label: "A" }];
    expect(menuRows(entries, api, () => {})[0]!.classes).toContain("py-1.5");
    const compact = menuRows(entries, api, () => {}, () => {}, "compact")[0]!.classes;
    expect(compact).toContain("min-h-6");
    expect(compact).not.toContain("py-1.5");
  });

  it("section headers are 10.5px uppercase with tracking", async () => {
    await boot(App);
    const cls = $(".header").className;
    for (const c of ["text-[10.5px]", "uppercase", "tracking-wider"]) expect(cls).toContain(c);
    expect(SECTION_HEADER).toContain("uppercase");
  });

  it("has no axe violations", async () => {
    await boot(App);
    await expectNoA11yViolations(document.body);
  });
});
