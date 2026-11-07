import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { injectHost } from "@gable/core/internal";
import { mount, type TestNode } from "@gable/testing";
import { queryAll } from "@gable/testing/renderer";
import { useLayer } from "./layer.js";
import { usePosition } from "./position.js";
import { useRovingTabindex } from "./roving.js";

const key = (f: { dispatch(node: TestNode, name: string, event?: unknown): void }, container: TestNode, from: TestNode, k: string, init: Record<string, unknown> = {}) =>
  f.dispatch(container, "keydown", { key: k, target: from, ...init, preventDefault() {} });

class Toolbar {
  static meta = {
    selector: "app-root",
    template: html`<div id="bar">
      <button id="b1" data-item>One</button>
      <button id="b2" data-item>Two</button>
      <button id="b3" data-item disabled>Three</button>
      <button id="b4" data-item>Four</button>
    </div>`,
  };
  focused: string[] = [];
  host = injectHost<TestNode>().host;
  roving = useRovingTabindex<TestNode>({
    items: () => queryAll(this.host, "[data-item]"),
    isDisabled: (n) => "disabled" in n.attrs,
    focus: (n) => this.focused.push(n.attrs.id!),
  });
}

describe("roving tabindex (in-memory renderer)", () => {
  async function setup() {
    const f = mount(Toolbar);
    await f.settle();
    f.instance.roving.refresh(); // items exist only after the first render
    const bar = f.query("#bar")!;
    // the test renderer does not bubble: the listener is on the app root, the event comes from a button
    const root = f.root;
    return { f, bar, root, tabindexes: () => ["#b1", "#b2", "#b3", "#b4"].map((s) => f.query(s)!.attrs.tabindex) };
  }

  it("puts exactly the first enabled item in the tab order", async () => {
    const { tabindexes } = await setup();
    expect(tabindexes()).toEqual(["0", "-1", "-1", "-1"]);
  });

  it("arrow keys move focus and the tab stop, skipping disabled items and wrapping", async () => {
    const { f, root, tabindexes } = await setup();
    const at = (id: string) => f.query(id)!;
    key(f, root, at("#b1"), "ArrowRight");
    expect(f.instance.focused.at(-1)).toBe("b2");
    expect(tabindexes()).toEqual(["-1", "0", "-1", "-1"]);
    key(f, root, at("#b2"), "ArrowRight"); // skips the disabled b3
    expect(f.instance.focused.at(-1)).toBe("b4");
    key(f, root, at("#b4"), "ArrowRight"); // wraps
    expect(f.instance.focused.at(-1)).toBe("b1");
    key(f, root, at("#b1"), "ArrowLeft"); // wraps backwards
    expect(f.instance.focused.at(-1)).toBe("b4");
    expect(tabindexes()).toEqual(["-1", "-1", "-1", "0"]);
  });

  it("Home and End jump to the ends; vertical arrows are ignored in a horizontal group", async () => {
    const { f, root } = await setup();
    key(f, root, f.query("#b2")!, "End");
    expect(f.instance.focused.at(-1)).toBe("b4");
    key(f, root, f.query("#b4")!, "Home");
    expect(f.instance.focused.at(-1)).toBe("b1");
    const before = f.instance.focused.length;
    key(f, root, f.query("#b1")!, "ArrowDown");
    expect(f.instance.focused.length).toBe(before);
  });

  it("focus moving into an item (a click) moves the tab stop to it", async () => {
    const { f, root, tabindexes } = await setup();
    f.dispatch(root, "focusin", { target: f.query("#b4")! });
    expect(tabindexes()).toEqual(["-1", "-1", "-1", "0"]);
  });

  it("stops listening when the component is destroyed", async () => {
    const { f, root } = await setup();
    f.destroy();
    const before = f.instance.focused.length;
    key(f, root, f.root, "ArrowRight");
    expect(f.instance.focused.length).toBe(before);
  });
});

class Floating {
  static meta = { selector: "app-root", template: html`<div id="pop">content</div>` };
  open = signal(false);
  dismissed = 0;
  layer = useLayer({ open: () => this.open(), onDismiss: () => this.dismissed++ });
  position = usePosition({ anchor: () => "anchor", open: () => this.open() });
}

describe("layer and positioning under the in-memory renderer", () => {
  it("install nothing without a DOM and clean up without errors", async () => {
    const f = mount(Floating);
    await f.settle();
    f.instance.open.set(true);
    await f.settle();
    expect(f.instance.layer.active()).toBe(false);
    expect(f.query("#pop")!.attrs["data-placement"]).toBeUndefined();
    expect(f.instance.position.placement()).toBe("bottom");
    f.instance.position.update(); // no-op
    f.destroy();
  });
});
