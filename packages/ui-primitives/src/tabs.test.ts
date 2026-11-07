import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html, inject, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { domEvent, focusNode, pressKey, provideTestDom } from "./test-dom.js";
import { TABS, TabsState } from "./tabs.js";

class App {
  static meta = {
    selector: "app-root",
    providers: [TabsState],
    imports: [...TABS],
    template: html`<div uiTabsRoot>
      <div uiTabsList>
        <button uiTabTrigger="a">A</button>
        <button uiTabTrigger="b">B</button>
        <button uiTabTrigger="c" [disabled]="true">C</button>
        <button uiTabTrigger="d">D</button>
      </div>
      <div uiTabContent="a">pa</div>
      <div uiTabContent="b">pb</div>
      <div uiTabContent="d">pd</div>
    </div>`,
  };
  tab = signal<string | null>("a");
  changes: string[] = [];
  tabs = inject(TabsState).bind(() => ({
    value: this.tab(),
    onValueChange: (d) => {
      this.changes.push(d.value);
      this.tab.set(d.value);
    },
  }));
}

const mountTabs = () => {
  const f = mount(App, { providers: provideTestDom(), advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
  const tab = (value: string) => f.query(`[data-value=${value}]`)!;
  const panel = (value: string) => f.queryAll("[role=tabpanel]").find((p) => p.attrs["aria-labelledby"]!.endsWith(`trigger-${value}`))!;
  return { f, tab, panel };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("tabs in the in-memory renderer", () => {
  it("applies the prop getters as host bindings", async () => {
    const { f, tab, panel } = mountTabs();
    await f.settle();
    expect(f.query("[role=tablist]")!.attrs["aria-orientation"]).toBe("horizontal");
    expect(tab("a").attrs).toMatchObject({ role: "tab", "aria-selected": "true", tabindex: "0", "data-selected": "" });
    expect(tab("b").attrs).toMatchObject({ "aria-selected": "false", tabindex: "-1" });
    expect(tab("b").attrs["data-selected"]).toBeUndefined();
    expect(tab("c").attrs.disabled).toBe("");
    expect(panel("a").attrs.hidden).toBeUndefined();
    expect(panel("b").attrs.hidden).toBe("");
    expect(tab("a").attrs["aria-controls"]).toBe(panel("a").attrs.id);
    expect(panel("a").attrs["aria-labelledby"]).toBe(tab("a").attrs.id);
  });

  it("selects on click and reports through onValueChange", async () => {
    const { f, tab, panel } = mountTabs();
    await f.settle();
    f.dispatch(tab("b"), "click", domEvent(tab("b"), "click"));
    await f.settle();
    expect(f.instance.changes).toEqual(["b"]);
    expect(tab("b").attrs["aria-selected"]).toBe("true");
    expect(tab("a").attrs["aria-selected"]).toBe("false");
    expect(panel("b").attrs.hidden).toBeUndefined();
    expect(panel("a").attrs.hidden).toBe("");
  });

  it("follows a controlled value signal", async () => {
    const { f, tab, panel } = mountTabs();
    await f.settle();
    f.instance.tab.set("d");
    await f.settle();
    expect(tab("d").attrs["aria-selected"]).toBe("true");
    expect(panel("d").attrs.hidden).toBeUndefined();
  });

  it("moves with arrow keys, skipping disabled tabs, and wraps, Home and End", async () => {
    const { f, tab } = mountTabs();
    await f.settle();
    const press = async (from: string, key: string) => {
      focusNode(tab(from));
      pressKey(f, f.query("[role=tablist]")!, key, tab(from));
      await f.advance(50);
    };
    await press("a", "ArrowRight");
    expect(f.instance.tab()).toBe("b");
    await press("b", "ArrowRight"); // c is disabled
    expect(f.instance.tab()).toBe("d");
    await press("d", "ArrowRight"); // loops
    expect(f.instance.tab()).toBe("a");
    await press("a", "ArrowLeft");
    expect(f.instance.tab()).toBe("d");
    await press("d", "Home");
    expect(f.instance.tab()).toBe("a");
    await press("a", "End");
    expect(f.instance.tab()).toBe("d");
    expect(f.instance.changes).toEqual(["b", "d", "a", "d", "a", "d"]);
  });

  it("ignores keys that are not navigation", async () => {
    const { f, tab } = mountTabs();
    await f.settle();
    pressKey(f, f.query("[role=tablist]")!, "x", tab("a"));
    await f.settle();
    expect(f.instance.changes).toEqual([]);
  });

  it("stops the machine and removes listeners when the component is destroyed", async () => {
    const { f, tab } = mountTabs();
    await f.settle();
    const node = tab("a");
    expect(node.listeners.click?.length).toBe(1);
    const { service } = f.instance.tabs.binding;
    f.destroy();
    expect(node.listeners.click?.length ?? 0).toBe(0);
    expect(service.getStatus()).not.toBe("started");
  });
});

describe("data-driven items (Select/Combobox groundwork)", () => {
  class Dynamic {
    static meta = {
      selector: "app-root",
      providers: [TabsState],
      imports: [...TABS],
      template: html`<div uiTabsRoot>
        <div uiTabsList>
          @for (item of items(); track item.value) {
            <button [uiTabTrigger]="item.value" [disabled]="item.disabled">{{ item.label }}</button>
          }
        </div>
        @for (item of items(); track item.value) {
          <div [uiTabContent]="item.value">{{ item.label }} panel</div>
        }
      </div>`,
    };
    items = signal([{ value: "x", label: "X", disabled: false }, { value: "y", label: "Y", disabled: false }]);
    tabs = inject(TabsState).bind(() => ({ defaultValue: "x" }));
  }

  it("renders per-item directives from a signal of data, and picks up added items", async () => {
    const f = mount(Dynamic, { providers: provideTestDom() });
    await f.settle();
    expect(f.queryAll("[role=tab]").map((n) => n.attrs["aria-selected"])).toEqual(["true", "false"]);
    f.instance.items.update((items) => [...items, { value: "z", label: "Z", disabled: false }]);
    await f.settle();
    const tabs = f.queryAll("[role=tab]");
    expect(tabs.map((n) => n.attrs["data-value"])).toEqual(["x", "y", "z"]);
    expect(tabs[2]!.attrs.id).toMatch(/trigger-z$/);
    f.destroy();
  });
});
