// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, computed, ErrorHandler, html, inject, signal } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import * as combobox from "@zag-js/combobox";
import { COMBOBOX, ComboboxState, MENU, MenuState, type Item } from "./items-proto.fixtures.js";

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

// jsdom gaps Zag touches: CSS.escape, scroll methods, and rAF needs a task per frame.
(globalThis as any).CSS ??= { escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c) };
(Element.prototype as any).scrollTo ??= () => {};
(Element.prototype as any).scrollIntoView ??= () => {};
const realRaf = globalThis.requestAnimationFrame;
let host: HTMLElement;
let destroy: () => void = () => {};
beforeEach(() => {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  Collector.reports.length = 0;
  document.body.replaceChildren();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  destroy();
  destroy = () => {};
  expect(Collector.reports).toEqual([]);
});
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const boot = async <T extends object>(Root: new () => T) => {
  const ref = bootstrap(Root as never, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: T; destroy(): void };
  destroy = () => ref.destroy();
  await settle();
  return ref.instance;
};
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

const FRUIT: Item[] = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
];

describe("Combobox in jsdom: items as filtered data rendered with @for", () => {
  class App {
    static meta = {
      selector: "app-root",
      providers: [ComboboxState],
      imports: [...COMBOBOX],
      template: html`<input uiComboInput />
        <ul uiComboContent>
          @for (row of rows(); track row.value) {
            <li [uiComboItem]="row" [class.active]="row.highlighted">{{ row.label }}</li>
          } @empty {
            <li class="empty">No results</li>
          }
        </ul>`,
    };
    query = signal("");
    chosen: string[] = [];
    filtered = computed(() => FRUIT.filter((i) => i.label.toLowerCase().includes(this.query().toLowerCase())));
    combo = inject(ComboboxState).bind(() => ({
      collection: combobox.collection({ items: this.filtered() }),
      onInputValueChange: (d: { inputValue: string }) => this.query.set(d.inputValue),
      onValueChange: (d: { value: string[] }) => void (this.chosen = d.value),
    }));
    rows = computed(() => {
      const api = this.combo.api();
      return this.filtered().map((item) => ({ ...item, ...api.getItemState({ item }) }));
    });
  }
  const options = () => $$("[role=option]").map((n) => n.dataset.value);

  it("filters the collection as the input value changes and re-renders only the matching items", async () => {
    const app = await boot(App);
    app.combo.api().setInputValue("ap");
    await settle();
    expect(app.query()).toBe("ap");
    expect(options()).toEqual(["apple", "apricot"]);
    app.combo.api().setInputValue("zzz");
    await settle();
    expect(options()).toEqual([]);
    expect($(".empty")).toBeTruthy();
    expect($("input").getAttribute("role")).toBe("combobox");
  });

  it("highlights with arrow keys on the input (aria-activedescendant) and selects with Enter", async () => {
    const app = await boot(App);
    app.combo.api().setInputValue("a");
    await settle();
    app.combo.api().setOpen(true);
    await settle();
    expect(options()).toEqual(["apple", "apricot", "banana"]);
    $("input").focus();
    key($("input"), "ArrowDown");
    await settle();
    key($("input"), "ArrowDown");
    await settle();
    expect(app.combo.api().highlightedValue).toBe("apricot");
    expect($("input").getAttribute("aria-activedescendant")).toMatch(/apricot$/);
    expect($("[data-value=apricot]").classList.contains("active")).toBe(true);
    key($("input"), "Enter");
    await settle();
    expect(app.chosen).toEqual(["apricot"]);
  });

  it("marks disabled items", async () => {
    const app = await boot(App);
    app.combo.api().setInputValue("c");
    await settle();
    app.combo.api().setOpen(true);
    await settle();
    expect(options()).toEqual(["apricot", "cherry"]);
    expect($("[data-value=cherry]").hasAttribute("data-disabled")).toBe(true);
  });
});

describe("Menu in jsdom: items are DOM-registered, so any per-element directive works", () => {
  class App {
    static meta = {
      selector: "app-root",
      providers: [MenuState],
      imports: [...MENU],
      template: html`<button uiMenuTrigger>Actions</button>
        <div uiMenuContent>
          @for (a of actions(); track a.value) {
            <div [uiMenuItem]="a.value" [disabled]="a.disabled">{{ a.label }}</div>
          }
        </div>`,
    };
    actions = signal([
      { value: "copy", label: "Copy", disabled: false },
      { value: "cut", label: "Cut", disabled: true },
      { value: "paste", label: "Paste", disabled: false },
    ]);
    selected: string[] = [];
    menu = inject(MenuState).bind(() => ({ onSelect: (d: { value: string }) => void this.selected.push(d.value) }));
  }
  const item = (v: string) => $$("[role=menuitem]").find((n) => n.dataset.value === v)!;

  it("renders per-item props from data and selects with a click", async () => {
    const app = await boot(App);
    expect($$("[role=menuitem]")).toHaveLength(3);
    expect(item("cut").getAttribute("aria-disabled")).toBe("true");
    app.menu.api().setOpen(true);
    await settle();
    item("paste").click();
    await settle();
    expect(app.selected).toEqual(["paste"]);
  });

  it("arrow navigation reads item order from the DOM and skips disabled items", async () => {
    const app = await boot(App);
    app.menu.api().setOpen(true);
    await settle();
    app.menu.api().setHighlightedValue("copy");
    await settle();
    key(item("copy"), "ArrowDown");
    await settle();
    expect(app.menu.api().highlightedValue).toBe("paste");
  });

  it("typeahead matches item text (read from the DOM) and items added at runtime join the order", async () => {
    const app = await boot(App);
    app.menu.api().setOpen(true);
    await settle();
    app.actions.update((a) => [...a, { value: "delete", label: "Delete", disabled: false }]);
    await settle();
    expect($$("[role=menuitem]")).toHaveLength(4);
    key(item("copy"), "d");
    await settle();
    expect(app.menu.api().highlightedValue).toBe("delete");
  });
});
