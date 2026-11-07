import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, contentChildren, viewChild, effect, html, inject, input, signal, type ReadonlySignal } from "@gable/core";
import { mount } from "@gable/testing";
import * as select from "@zag-js/select";
import { domEvent, focusNode, pressKey } from "./test-dom.js";
import { bindProps } from "./props.js";
import { SELECT, SelectState, provideItemsDom, type Item } from "./items-proto.fixtures.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("(a) ${} template values as item bodies", () => {
  it("html`` holes are dropped from the design (TASK-30), so a per-item template value cannot be rendered", () => {
    class Row {
      static meta = { selector: "app-root", template: html`<li>${html`<b>x</b>`}</li>` };
    }
    expect(() => mount(Row)).toThrow(/does not support \$\{\} holes/);
  });

  it("the small-component equivalent works: a row component with a view-model input renders the per-item context", async () => {
    class Row {
      static meta = {
        selector: "ui-option-row",
        template: html`<b>{{ row().label }}</b><i [class.sel]="row().selected">{{ row().value }}</i>`,
      };
      row = input.required<{ label: string; value: string; selected: boolean; highlighted: boolean }>();
    }
    class App {
      static meta = {
        selector: "app-root",
        providers: [SelectState],
        imports: [...SELECT, Row],
        template: html`<ul uiSelectContent>
          @for (row of rows(); track row.value) {
            <li [uiSelectItem]="row"><ui-option-row [row]="row"></ui-option-row></li>
          }
        </ul>`,
      };
      items = signal<Item[]>([{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]);
      select = inject(SelectState).bind(() => ({ collection: select.collection({ items: this.items() }), defaultValue: ["b"] }));
      rows = computed(() => this.items().map((item) => ({ ...item, ...this.select.api().getItemState({ item }) })));
    }
    const f = mount(App, { providers: provideItemsDom() });
    await f.settle();
    const rows = f.queryAll("ui-option-row");
    expect(rows.map((n) => n.children[0]!.children[0]!.text)).toEqual(["Alpha", "Beta"]);
    expect(rows[1]!.children[1]!.classes).toContain("sel");
    expect(rows[0]!.children[1]!.classes).not.toContain("sel");
    f.instance.select.api().selectValue("a");
    await f.settle();
    expect(rows[0]!.children[1]!.classes).toContain("sel");
  });
});

describe("(b) slot-based item components collected with contentChildren", () => {
  class UiSelectOption {
    static meta = { selector: "ui-option", template: html`<slot></slot>` };
    value = input<string>("");
    label = input<string>("");
    disabled = input<boolean>(false);
    /** Set by the owning <ui-select>: projected content is injected from the declaring component, so it cannot inject SelectState. */
    owner = signal<SelectState | null>(null);
    item = computed<Item>(() => ({ value: this.value(), label: this.label(), disabled: this.disabled() }));
    _p = bindProps(() => {
      const owner = this.owner();
      return owner && this.value() ? owner.api().getItemProps({ item: this.item() }) : null;
    });
  }
  class UiSelect {
    static meta = {
      selector: "ui-select",
      providers: [SelectState],
      imports: [...SELECT],
      template: html`<button uiSelectTrigger>{{ text() }}</button>
        <ul uiSelectContent><slot></slot></ul>`,
    };
    options: ReadonlySignal<UiSelectOption[]> = contentChildren(UiSelectOption);
    value = signal<string[]>([]);
    state = inject(SelectState).bind(() => ({
      collection: select.collection({ items: this.options().map((o) => o.item()) }), // the second source of truth
      value: this.value(),
      onValueChange: (d: { value: string[] }) => this.value.set(d.value),
    }));
    text = computed(() => this.state.api().valueAsString || "Pick");
    _link = effect(() => {
      for (const o of this.options()) o.owner.set(this.state);
    });
  }
  class App {
    static meta = {
      selector: "app-root",
      imports: [UiSelect, UiSelectOption],
      template: html`<ui-select>
        @for (f of fruit(); track f.value) {
          <ui-option [value]="f.value" [label]="f.label" [disabled]="f.disabled">{{ f.label }}</ui-option>
        }
      </ui-select>`,
    };
    sel = viewChild(UiSelect);
    fruit = signal([
      { value: "apple", label: "Apple", disabled: false },
      { value: "banana", label: "Banana", disabled: false },
      { value: "cherry", label: "Cherry", disabled: true },
      { value: "date", label: "Date", disabled: false },
    ]);
  }

  const setup = async () => {
    const f = mount(App, { providers: provideItemsDom(), advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
    await f.settle();
    const opt = (v: string) => f.queryAll("[role=option]").find((n) => n.attrs["data-value"] === v)!;
    return { f, opt, trigger: f.query("button")!, content: f.query("[role=listbox]")! };
  };

  it("collects the items into the machine collection after content creation and applies item props", async () => {
    const { f, opt } = await setup();
    expect(f.queryAll("[role=option]").map((n) => n.attrs["data-value"])).toEqual(["apple", "banana", "cherry", "date"]);
    expect(opt("cherry").attrs["aria-disabled"]).toBe("true");
  });

  it("opens, arrows skip disabled, Enter selects, typeahead works from the collected collection", async () => {
    const { f, opt, trigger, content } = await setup();
    f.dispatch(trigger, "click", domEvent(trigger, "click"));
    await f.settle();
    pressKey(f, content, "ArrowDown", opt("apple"));
    await f.advance(50);
    pressKey(f, content, "ArrowDown", opt("apple"));
    await f.advance(50);
    pressKey(f, content, "ArrowDown", opt("apple"));
    await f.advance(50);
    expect(opt("date").attrs["data-highlighted"]).toBe("");
    pressKey(f, content, "Enter", opt("date"));
    await f.advance(50);
    expect(f.query("button")!.children[0]!.text).toBe("Date");
  });

  it("typeahead is ignored when the item element tag contains select (Zag treats localName /textarea|select/ as editable)", async () => {
    class Opt2 extends UiSelectOption {
      static override meta = { selector: "ui-select-option", template: html`<slot></slot>` };
    }
    class App2 {
      static meta = { selector: "app-root", imports: [UiSelect, Opt2], template: html`<ui-select><ui-select-option value="a" label="Apple"></ui-select-option><ui-select-option value="b" label="Banana"></ui-select-option></ui-select>` };
      sel = viewChild(UiSelect);
    }
    const f = mount(App2, { providers: provideItemsDom(), advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
    await f.settle();
    expect(f.queryAll("ui-select-option").length).toBe(2);
    f.dispatch(f.query("button")!, "click", domEvent(f.query("button")!, "click"));
    await f.settle();
    const target = f.queryAll("ui-select-option")[0]!;
    pressKey(f, f.query("[role=listbox]")!, "b", target);
    await f.advance(50);
    expect(f.instance.sel()!.state.api().highlightedValue).toBe(null);
  });

  it("typeahead highlights by label from the collected collection", async () => {
    const { f, opt, trigger, content } = await setup();
    f.dispatch(trigger, "click", domEvent(trigger, "click"));
    await f.settle();
    focusNode(opt("apple"));
    pressKey(f, content, "b", opt("apple"));
    await f.advance(50);
    expect(opt("banana").attrs["data-highlighted"]).toBe("");
  });

  it("picks up options added at runtime", async () => {
    const { f } = await setup();
    f.instance.fruit.update((x) => [...x, { value: "elder", label: "Elder", disabled: false }]);
    await f.settle();
    expect(f.queryAll("[role=option]")).toHaveLength(5);
  });

  it("drops options removed at runtime", async () => {
    const { f } = await setup();
    f.instance.fruit.update((x) => x.filter((i) => i.value !== "apple"));
    await f.settle();
    expect(f.queryAll("[role=option]").map((n) => n.attrs["data-value"])).toEqual(["banana", "cherry", "date"]);
  });
});
