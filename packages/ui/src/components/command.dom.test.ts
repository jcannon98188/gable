// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { commandMatches, UiCommand, UiCommandDialog, type CommandItem } from "./command.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const ITEMS: CommandItem[] = [
  { value: "calendar", label: "Calendar", group: "Suggestions" },
  { value: "search", label: "Search Emoji", group: "Suggestions", keywords: ["smile"] },
  { value: "calc", label: "Calculator", group: "Suggestions", disabled: true },
  { value: "profile", label: "Profile", group: "Settings", shortcut: "Ctrl+P" },
  { value: "billing", label: "Billing", group: "Settings" },
  { value: "help", label: "Help" },
];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiCommand, UiCommandDialog],
    template: html`<ui-command id="inline" [items]="items" [(query)]="query" (selected)="picks.push($event)"></ui-command>
      <ui-command-dialog [(open)]="open" [items]="items" (selected)="dialogPicks.push($event)"></ui-command-dialog>`,
  };
  items = ITEMS;
  query = signal("");
  picks: string[] = [];
  dialogPicks: string[] = [];
  open = signal(false);
}

const boot = useDomApp();
const input = () => $<HTMLInputElement>("#inline input");
const type = async (text: string) => {
  input().value = text;
  input().dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
};
const labels = () => $$("#inline [role=option]").map((o) => o.textContent!.trim());
const active = () => $("#inline [role=option][aria-selected=true]").textContent!.trim();

describe("commandMatches", () => {
  it("needs every word in the label, group or keywords", () => {
    expect(commandMatches(ITEMS[1]!, "emoji")).toBe(true);
    expect(commandMatches(ITEMS[1]!, "smile sug")).toBe(true);
    expect(commandMatches(ITEMS[1]!, "smile xyz")).toBe(false);
    expect(commandMatches(ITEMS[1]!, "  ")).toBe(true);
  });
});

describe("Command", () => {
  it("renders groups with headings, an ungrouped command first, and the combobox wiring", async () => {
    await boot(App);
    const groups = $$("#inline [role=group]");
    expect(groups.map((g) => g.querySelector("[role=presentation]")?.textContent ?? "")).toEqual(["", "Suggestions", "Settings"]);
    expect(groups[1]!.getAttribute("aria-labelledby")).toBe(groups[1]!.querySelector("[role=presentation]")!.id);
    expect(labels()).toEqual(["Help", "Calendar", "Search Emoji", "Calculator", "ProfileCtrl+P", "Billing"]);
    expect(input().getAttribute("role")).toBe("combobox");
    expect(input().getAttribute("aria-controls")).toBe($("#inline [role=listbox]").id);
    expect(input().getAttribute("aria-activedescendant")).toBe($("#inline [role=option][aria-selected=true]").id);
    expect(active()).toBe("Help");
    expect($("#inline [aria-disabled=true]").textContent).toContain("Calculator");
  });

  it("filters as you type (label, group, keywords), updates the two-way query and announces the count", async () => {
    const app = await boot(App);
    await type("smile");
    expect(app.query()).toBe("smile");
    expect(labels()).toEqual(["Search Emoji"]);
    expect($("#inline [role=status]").textContent).toBe("1 result");
    await type("settings");
    expect(labels()).toEqual(["ProfileCtrl+P", "Billing"]);
    expect(active()).toBe("ProfileCtrl+P");
    app.query.set("");
    await settle();
    expect(labels()).toHaveLength(6);
  });

  it("shows the empty state, with no listbox, when nothing matches", async () => {
    await boot(App);
    await type("zzz");
    expect($("#inline [data-part=empty]").textContent).toBe("No results found.");
    expect(document.querySelector("#inline [role=listbox]")).toBeNull();
    expect(input().hasAttribute("aria-controls")).toBe(false);
    expect($("#inline [role=status]").textContent).toBe("No results found.");
    key(input(), "Enter");
    await type("");
    expect(labels()).toHaveLength(6);
  });

  it("moves the highlight with the arrows (wrapping, skipping disabled), Home and End", async () => {
    await boot(App);
    key(input(), "ArrowDown");
    await settle();
    expect(active()).toBe("Calendar");
    key(input(), "ArrowDown");
    await settle();
    expect(active()).toBe("Search Emoji");
    key(input(), "ArrowDown"); // skips the disabled Calculator
    await settle();
    expect(active()).toBe("ProfileCtrl+P");
    key(input(), "End");
    await settle();
    expect(active()).toBe("Billing");
    key(input(), "ArrowDown");
    await settle();
    expect(active()).toBe("Help"); // wraps
    key(input(), "ArrowUp");
    await settle();
    expect(active()).toBe("Billing");
    key(input(), "Home");
    await settle();
    expect(active()).toBe("Help");
  });

  it("resets the highlight to the first match when the query changes", async () => {
    await boot(App);
    key(input(), "End");
    await settle();
    await type("a");
    expect(active()).toBe(labels()[0]);
  });

  it("runs the highlighted command on Enter, and a clicked one", async () => {
    const app = await boot(App);
    key(input(), "ArrowDown");
    key(input(), "Enter");
    await settle();
    expect(app.picks).toEqual(["calendar"]);
    $$("#inline [role=option]")[5]!.click();
    $$("#inline [role=option]")[3]!.click(); // disabled: ignored
    expect(app.picks).toEqual(["calendar", "billing"]);
  });

  it("highlights on hover", async () => {
    await boot(App);
    $$("#inline [role=option]")[5]!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    await settle();
    expect(active()).toBe("Billing");
  });
});

describe("CommandDialog", () => {
  it("opens, focuses the search box, runs a command and closes, clearing the search", async () => {
    const app = await boot(App);
    const dialog = () => $("[role=dialog]");
    expect(dialog().hidden).toBe(true);
    app.open.set(true);
    await settle();
    expect(dialog().hidden).toBe(false);
    expect(dialog().getAttribute("aria-labelledby")).toBe(dialog().querySelector("h2")!.id);
    const box = dialog().querySelector("input")!;
    // jsdom has no layout, so focus-trap finds nothing tabbable and falls back to the panel; in a browser Zag focuses the search box (initialFocusEl)
    expect(dialog().contains(document.activeElement)).toBe(true);
    box.value = "bill";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(dialog().querySelectorAll("[role=option]")).toHaveLength(1);
    key(box, "Enter");
    await settle();
    expect(app.dialogPicks).toEqual(["billing"]);
    expect(app.open()).toBe(false);
    expect(dialog().hidden).toBe(true);
    expect(box.value).toBe("");
  });

  it("closes on Escape", async () => {
    const app = await boot(App);
    app.open.set(true);
    await settle();
    key(document.activeElement!, "Escape");
    await settle();
    expect(app.open()).toBe(false);
  });
});

describe("Command accessibility", () => {
  it("has no axe violations (list, empty state and dialog)", async () => {
    const app = await boot(App);
    await expectNoA11yViolations($("#inline"));
    await type("zzz");
    await expectNoA11yViolations($("#inline"));
    app.open.set(true);
    await settle();
    await expectNoA11yViolations($("[role=dialog]"));
  });
});
