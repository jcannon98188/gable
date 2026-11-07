import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { domEvent, focusNode, pressKey, provideTestDom } from "@gable/ui-primitives/testing";
import { UiSelect, type SelectItem } from "./select.js";

const FRUIT: SelectItem[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "date", label: "Date" },
];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiSelect],
    template: html`<ui-select [items]="fruit()" [(value)]="chosen" placeholder="Pick a fruit" triggerClass="w-[180px]"></ui-select>`,
  };
  fruit = signal(FRUIT);
  chosen = signal("");
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = async () => {
  const f = mount(App, { providers: provideTestDom(), advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
  await f.settle();
  const option = (value: string) => f.queryAll("[role=option]").find((n) => n.attrs["data-value"] === value)!;
  const click = async (node: ReturnType<typeof f.query>) => {
    f.dispatch(node!, "click", domEvent(node!, "click"));
    await f.settle();
  };
  return { f, option, click, trigger: () => f.query("[role=combobox]")!, list: () => f.query("[role=listbox]")! };
};

describe("Select", () => {
  it("renders the placeholder, a hidden list in the overlay root, and one option per item", async () => {
    const { f, trigger, list, option } = await setup();
    expect(f.textOf(trigger())).toContain("Pick a fruit");
    expect(trigger().attrs.class).toContain("w-[180px]");
    expect(trigger().attrs.class).not.toContain("w-full");
    expect(trigger().attrs["data-placeholder-shown"]).toBe("");
    expect(list().attrs.hidden).toBe("");
    expect(f.query("gable-overlay [role=listbox]")).not.toBeNull();
    expect(f.queryAll("[role=option]").map((n) => n.attrs["data-value"])).toEqual(["apple", "banana", "cherry", "date"]);
    expect(option("cherry").attrs["aria-disabled"]).toBe("true");
  });

  it("opens on click, picks with a click, writes the two-way value and shows the label", async () => {
    const { f, trigger, list, option, click } = await setup();
    await click(trigger());
    expect(list().attrs["data-state"]).toBe("open");
    expect(list().attrs.hidden).toBeUndefined();
    await click(option("banana"));
    expect(f.instance.chosen()).toBe("banana");
    expect(f.textOf(trigger())).toContain("Banana");
    expect(trigger().attrs["data-placeholder-shown"]).toBeUndefined();
    expect(option("banana").attrs["aria-selected"]).toBe("true");
    // a check icon is drawn in the selected option only
    expect(option("banana").children[0]!.children.some((c) => c.tag === "svg")).toBe(true);
    expect(option("apple").children[0]!.children.some((c) => c.tag === "svg")).toBe(false);
    expect(list().attrs["data-state"]).toBe("closed");
  });

  it("highlights with the arrow keys (skipping disabled) and picks with Enter", async () => {
    const { f, trigger, list, option, click } = await setup();
    await click(trigger());
    f.instance.fruit.set([...FRUIT]); // a new list does not disturb an open select
    await f.settle();
    focusNode(option("apple"));
    pressKey(f, list(), "ArrowDown", option("apple"));
    await f.advance(50);
    pressKey(f, list(), "ArrowDown", option("apple"));
    await f.advance(50);
    pressKey(f, list(), "ArrowDown", option("apple"));
    await f.advance(50);
    expect(option("date").attrs["data-highlighted"]).toBe("");
    pressKey(f, list(), "Enter", option("date"));
    await f.advance(50);
    expect(f.instance.chosen()).toBe("date");
  });

  it("follows a bound value and a changing item list", async () => {
    const { f, trigger, option } = await setup();
    f.instance.chosen.set("apple");
    await f.settle();
    expect(f.textOf(trigger())).toContain("Apple");
    f.instance.fruit.update((items) => [...items, { value: "elder", label: "Elderberry" }]);
    await f.settle();
    expect(f.queryAll("[role=option]")).toHaveLength(5);
    expect(option("elder")).toBeDefined();
  });
});
