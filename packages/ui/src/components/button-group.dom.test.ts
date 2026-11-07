// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiButton } from "./button.js";
import { UiButtonGroup } from "./button-group.js";
import { MenuTrigger, UiDropdownMenu, type MenuEntry } from "./dropdown-menu.js";
import { UiIcon } from "../lib/icon.js";
import { $, $$, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();
const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
g.CSS ??= {};
g.CSS.escape ??= (s) => s.replace(/([^\w-])/g, "\\$1");

/** The split-button recipe: a primary action and a chevron menu trigger in one labelled group. */
class App {
  static meta = {
    selector: "app-root",
    imports: [UiButton, UiButtonGroup, UiDropdownMenu, MenuTrigger, UiIcon],
    template: html`
      <ui-button-group label="Save options">
        <button uiButton class="main" (click)="save()">Save</button>
        <ui-dropdown-menu [entries]="entries" (selected)="picked.set($event)" placement="bottom-end">
          <button slot="trigger" menuTrigger uiButton size="icon" aria-label="More save options" class="chevron"><svg uiIcon="chevron-down"></svg></button>
        </ui-dropdown-menu>
      </ui-button-group>
    `,
  };
  saved = signal(0);
  save() {
    this.saved.update((n) => n + 1);
  }
  picked = signal("");
  entries: MenuEntry[] = [
    { value: "draft", label: "Save as draft" },
    { value: "copy", label: "Save a copy" },
  ];
}

describe("split button recipe", () => {
  it("is one labelled group; the chevron has a name and menu-button semantics", async () => {
    await boot(App);
    const group = $("ui-button-group");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Save options");
    const chevron = $(".chevron");
    expect(chevron.getAttribute("aria-label")).toBe("More save options");
    expect(chevron.getAttribute("aria-haspopup")).toBe("menu");
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    expect(group.className).toContain("[&>ui-dropdown-menu:not(:first-child)>*]:rounded-l-none");
    await expectNoA11yViolations(document.body);
  });

  it("the primary button acts on its own and the chevron opens the menu", async () => {
    const app = await boot(App);
    $(".main").click();
    expect(app.saved()).toBe(1);
    $(".chevron").click();
    await settle();
    expect($(".chevron").getAttribute("aria-expanded")).toBe("true");
    await expectNoA11yViolations(document.body);
    const items = $$("[role=menu][data-state=open] [role=menuitem]");
    expect(items.map((i) => i.textContent?.trim())).toEqual(["Save as draft", "Save a copy"]);
    items[1].click();
    await settle();
    expect(app.picked()).toBe("copy");
    expect(app.saved()).toBe(1);
  });
});
