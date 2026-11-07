import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, html, inject, signal } from "@gable/core";
import { mount } from "@gable/testing";
import * as select from "@zag-js/select";
const createListCollection = select.collection;
import { domEvent, focusNode, pressKey } from "./test-dom.js";
import { SELECT, SelectState, provideItemsDom, type Item } from "./items-proto.fixtures.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const FRUIT: Item[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "date", label: "Date" },
];

describe("(c) Select items rendered from data with @for", () => {
  class App {
    static meta = {
      selector: "app-root",
      providers: [SelectState],
      imports: [...SELECT],
      template: html`<button uiSelectTrigger>{{ label() }}</button>
        <ul uiSelectContent>
          @for (row of rows(); track row.value) {
            <li [uiSelectItem]="row" [class.on]="row.selected" [class.active]="row.highlighted">{{ row.label }}</li>
          }
        </ul>`,
    };
    items = signal<Item[]>(FRUIT);
    value = signal<string[]>([]);
    highlights: (string | null)[] = [];
    select = inject(SelectState).bind(() => ({
      collection: createListCollection({ items: this.items() }),
      value: this.value(),
      onValueChange: (d: { value: string[] }) => this.value.set(d.value),
      onHighlightChange: (d: { highlightedValue: string | null }) => void this.highlights.push(d.highlightedValue),
    }));
    // The per-item context (value, selected, active) as a computed view model: templates cannot call getItemState.
    rows = computed(() => {
      const api = this.select.api();
      return this.items().map((item) => ({ ...item, ...api.getItemState({ item }) }));
    });
    label = computed(() => this.select.api().valueAsString || "Pick");
  }
  const setup = async () => {
    const f = mount(App, { providers: provideItemsDom(), advanceTimers: async (ms) => void (await vi.advanceTimersByTimeAsync(ms)) });
    await f.settle();
    const li = (v: string) => f.queryAll("[role=option]").find((n) => n.attrs["data-value"] === v)!;
    return { f, li, trigger: f.query("button")!, content: f.query("[role=listbox]")! };
  };

  it("renders options with roles and per-item view-model context", async () => {
    const { f, li } = await setup();
    expect(f.queryAll("[role=option]").map((n) => n.attrs["data-value"])).toEqual(["apple", "banana", "cherry", "date"]);
    expect(li("cherry").attrs["aria-disabled"]).toBe("true");
    f.instance.select.binding.service.send({ type: "VALUE.SET", value: ["banana"] });
    await f.settle();
    expect(li("banana").attrs["aria-selected"]).toBe("true");
    expect(li("banana").classes.includes("on")).toBe(true);
    expect(f.instance.label()).toBe("Banana");
    expect(f.query("button")!.children[0]!.text).toBe("Banana");
  });

  it("opens, highlights with arrows (skipping disabled), selects with Enter", async () => {
    const { f, li, trigger, content } = await setup();
    f.dispatch(trigger, "click", domEvent(trigger, "click"));
    await f.settle();
    expect(f.instance.select.api().open).toBe(true);
    f.instance.select.api().setHighlightValue("banana");
    await f.settle();
    expect(li("banana").classes.includes("active")).toBe(true);
    pressKey(f, content, "ArrowDown", li("banana"));
    await f.advance(50);
    expect(f.instance.select.api().highlightedValue).toBe("date"); // cherry is disabled
    expect(li("date").classes.includes("active")).toBe(true);
    expect(li("banana").classes.includes("active")).toBe(false);
    pressKey(f, content, "Enter", li("date"));
    await f.advance(50);
    expect(f.instance.value()).toEqual(["date"]);
    expect(li("date").attrs["aria-selected"]).toBe("true");
  });

  it("typeahead highlights by label from the collection data (no DOM query)", async () => {
    const { f, li, trigger, content } = await setup();
    f.dispatch(trigger, "click", domEvent(trigger, "click"));
    await f.settle();
    focusNode(li("apple"));
    pressKey(f, content, "d", li("apple"));
    await f.advance(50);
    expect(f.instance.select.api().highlightedValue).toBe("date");
    expect(li("date").classes.includes("active")).toBe(true);
  });

  it("follows a changing item list (items added at runtime become options with their own props)", async () => {
    const { f, li } = await setup();
    f.instance.items.update((x) => [...x, { value: "elder", label: "Elderberry" }]);
    await f.settle();
    expect(f.queryAll("[role=option]")).toHaveLength(5);
    expect(li("elder").attrs.id).toMatch(/elder$/);
    f.instance.select.api().setHighlightValue("elder");
    await f.settle();
    expect(li("elder").classes.includes("active")).toBe(true);
  });
});
