import { bootstrap, createComponent, html, signal, type ComponentRef } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";

/** How a renderer under test is created and inspected. Every method is about observable results, never internals. */
export interface RendererHarness<N> {
  /** Shown as the suite title. */
  name: string;
  /** A fresh renderer and a detached container node to mount into, per test. `target` is a value `resolveTarget` accepts and resolves to `root`. */
  create(): { renderer: Renderer<N>; root: N; target?: unknown };
  /** Lower-case tag name of an element node; throws or returns another value for non-elements. */
  tag(node: N): string;
  /** Child nodes in order, including text and anchor nodes. */
  children(node: N): N[];
  /** Concatenated text of a node's subtree. */
  text(node: N): string;
  attribute(node: N, name: string): string | null;
  hasClass(node: N, name: string): boolean;
  /** A style declaration's value ("" when unset). */
  style(node: N, name: string): string;
  /** Reads a property as `setProperty` wrote it. */
  property(node: N, name: string): unknown;
  /** Delivers an event to the node's listeners, as the platform would. */
  fire(node: N, name: string): void;
  /** Simulates the user editing a control: typing a string, choosing an option, or (boolean) checking or unchecking. Needed for the `fieldControl` suite. */
  edit?(node: N, value: string | boolean): void;
  /** Simulates the control losing focus. Needed for the `fieldControl` suite. */
  blur?(node: N): void;
}

/** The slice of a test runner the suite needs; pass vitest's `describe`, `it` and `expect`. */
export interface TestApi {
  describe(name: string, body: () => void): void;
  it(name: string, body: () => void | Promise<void>): void;
  expect: (value: unknown) => any;
}

/** Registers the Renderer-contract conformance suite for one renderer. The Test and DOM renderers must both pass it. */
export function defineRendererConformance<N>(api: TestApi, harness: RendererHarness<N>): void {
  const { describe, it, expect } = api;
  const h = harness;
  const isElement = (node: N, tag: string): boolean => {
    try {
      return h.tag(node) === tag;
    } catch {
      return false;
    }
  };
  const elementNamed = (parent: N, tag: string): N => {
    const found = h.children(parent).find((c) => isElement(c, tag));
    if (found === undefined) throw new Error(`no <${tag}> among the children`);
    return found;
  };

  describe(`Renderer contract: ${h.name}`, () => {
    describe("node operations", () => {
      it("creates elements and text and inserts them in order, honouring `before`", () => {
        const { renderer: r, root } = h.create();
        const a = r.createElement("p", root);
        const b = r.createElement("span", root);
        const text = r.createText("hello");
        r.insert(root, a);
        r.insert(root, b);
        r.insert(root, text, a);
        expect(h.children(root)).toEqual([text, a, b]);
        expect(h.tag(a)).toBe("p");
        expect(h.text(text)).toBe("hello");
      });

      it("moves a node that is inserted again, and removes nodes", () => {
        const { renderer: r, root } = h.create();
        const a = r.createElement("p", root);
        const b = r.createElement("span", root);
        r.insert(root, a);
        r.insert(root, b);
        r.insert(root, b, a);
        expect(h.children(root)).toEqual([b, a]);
        r.remove(b);
        expect(h.children(root)).toEqual([a]);
      });

      it("creates anchors that hold a position without showing text", () => {
        const { renderer: r, root } = h.create();
        const before = r.createText("a");
        const anchor = r.createAnchor();
        const after = r.createText("b");
        r.insert(root, before);
        r.insert(root, anchor);
        r.insert(root, after);
        const marker = r.createText("-");
        r.insert(root, marker, anchor);
        expect(h.children(root)).toEqual([before, marker, anchor, after]);
        expect(h.text(root)).toBe("a-b");
      });

      it("updates text, properties, attributes, classes and styles", () => {
        const { renderer: r, root } = h.create();
        const el = r.createElement("div", root);
        const text = r.createText("one");
        r.insert(root, el);
        r.insert(el, text);
        r.setText(text, "two");
        expect(h.text(el)).toBe("two");
        r.setProperty(el, "id", "box");
        expect(h.property(el, "id")).toBe("box");
        r.setAttribute(el, "data-x", "1");
        expect(h.attribute(el, "data-x")).toBe("1");
        r.setAttribute(el, "data-x", null);
        expect(h.attribute(el, "data-x")).toBeNull();
        r.setClass(el, "on", true);
        r.setClass(el, "other", true);
        r.setClass(el, "other", false);
        expect(h.hasClass(el, "on")).toBe(true);
        expect(h.hasClass(el, "other")).toBe(false);
        r.setStyle(el, "color", "red");
        expect(h.style(el, "color")).toBe("red");
        r.setStyle(el, "color", null);
        expect(h.style(el, "color")).toBe("");
      });

      it("listens for events and stops after unsubscribe", () => {
        const { renderer: r, root } = h.create();
        const el = r.createElement("button", root);
        r.insert(root, el);
        const seen: unknown[] = [];
        const off = r.listen(el, "click", (e) => seen.push(e));
        h.fire(el, "click");
        expect(seen).toHaveLength(1);
        off();
        h.fire(el, "click");
        expect(seen).toHaveLength(1);
      });
    });

    describe("form controls (fieldControl)", () => {
      const setup = (tag: string, attrs: Record<string, string> = {}) => {
        const { renderer: r, root } = h.create();
        const el = r.createElement(tag, root);
        for (const [k, v] of Object.entries(attrs)) r.setAttribute(el, k, v);
        r.insert(root, el);
        const control = r.fieldControl!(el);
        const values: unknown[] = [];
        let touched = 0;
        const off = control.listen({ value: (v) => values.push(v), touched: () => touched++ });
        return { r, root, el, control, values, off, touchedCount: () => touched };
      };
      const supported = () => {
        const { renderer } = h.create();
        return renderer.fieldControl !== undefined && h.edit !== undefined && h.blur !== undefined;
      };

      it("maps a text input's value both ways", () => {
        if (!supported()) return;
        const { el, control, values } = setup("input", { type: "text" });
        control.write("hi");
        expect(h.property(el, "value")).toBe("hi");
        control.write(null);
        expect(h.property(el, "value")).toBe("");
        h.edit!(el, "yo");
        expect(values).toEqual(["yo"]);
      });

      it("maps number inputs to number | null", () => {
        if (!supported()) return;
        const { el, control, values } = setup("input", { type: "number" });
        control.write(5);
        expect(String(h.property(el, "value"))).toBe("5");
        control.write(null);
        expect(h.property(el, "value")).toBe("");
        h.edit!(el, "42");
        h.edit!(el, "");
        expect(values).toEqual([42, null]);
      });

      it("maps checkboxes to booleans", () => {
        if (!supported()) return;
        const { el, control, values } = setup("input", { type: "checkbox" });
        control.write(true);
        expect(h.property(el, "checked")).toBe(true);
        control.write(false);
        expect(h.property(el, "checked")).toBe(false);
        h.edit!(el, true);
        h.edit!(el, false);
        expect(values).toEqual([true, false]);
      });

      it("maps radios to their option value", () => {
        if (!supported()) return;
        const { el, control, values } = setup("input", { type: "radio", value: "b" });
        control.write("b");
        expect(h.property(el, "checked")).toBe(true);
        control.write("a");
        expect(h.property(el, "checked")).toBe(false);
        h.edit!(el, true);
        expect(values).toEqual(["b"]);
      });

      it("maps a select to the chosen option's value", () => {
        if (!supported()) return;
        const { r, el, control, values } = setup("select");
        for (const v of ["a", "b"]) {
          const option = r.createElement("option", el);
          r.setAttribute(option, "value", v);
          r.insert(el, option);
        }
        control.write("b");
        expect(h.property(el, "value")).toBe("b");
        h.edit!(el, "a");
        expect(values).toEqual(["a"]);
      });

      it("reports touched on blur and applies disabled, readonly and invalid", () => {
        if (!supported()) return;
        const { el, control, touchedCount } = setup("input", { type: "text" });
        h.blur!(el);
        expect(touchedCount()).toBe(1);
        control.setState({ disabled: true, readonly: true, invalid: true });
        expect(h.property(el, "disabled")).toBe(true);
        expect(h.property(el, "readOnly")).toBe(true);
        expect(h.attribute(el, "aria-invalid")).toBe("true");
        control.setState({ disabled: false, readonly: false, invalid: false });
        expect(h.property(el, "disabled")).toBe(false);
        expect(h.attribute(el, "aria-invalid")).toBeNull();
      });

      it("stops reporting after unsubscribe", () => {
        if (!supported()) return;
        const { el, values, off, touchedCount } = setup("input", { type: "text" });
        off();
        h.edit!(el, "x");
        h.blur!(el);
        expect(values).toEqual([]);
        expect(touchedCount()).toBe(0);
      });
    });

    describe("styles", () => {
      it("returns a scoping token when scoped and none when not", () => {
        const { renderer: r } = h.create();
        expect(r.registerStyles!("Card", ".a { color: red }", { scoped: true })).not.toBe("");
        expect(r.registerStyles!("Plain", ".a { color: red }", { scoped: false })).toBe("");
      });

      it("gives the same id the same token when re-registered", () => {
        const { renderer: r } = h.create();
        const first = r.registerStyles!("Card", ".a { color: red }");
        expect(r.registerStyles!("Card", ".a { color: green }")).toBe(first);
      });
    });

    describe("bootstrap and the core on this renderer", () => {
      class Counter {
        static meta = {
          selector: "app-counter",
          template: html`<button (click)="inc()">add</button><p [class.big]="big()" [attr.data-n]="count()">{{ count() }}</p>@if (big()) { <b>big</b> }`,
        };
        count = signal(0);
        big = signal(false);
        inc() {
          this.count.update((n) => n + 1);
          if (this.count() > 1) this.big.set(true);
        }
      }

      it("adopts the resolved target as the root host", () => {
        const { renderer, root, target } = h.create();
        expect(renderer.resolveTarget).toBeTypeOf("function");
        const app = bootstrap(Counter, { renderer, target: target ?? root });
        expect(app.host).toBe(root);
        expect(h.text(root)).toContain("add");
        app.destroy();
      });

      it("renders a template, applies bindings after a flush, and runs event handlers", async () => {
        const { renderer, root } = h.create();
        const ref: ComponentRef<Counter, N> = createComponent(Counter, { renderer, parent: root });
        const host = h.children(root)[0]!;
        expect(h.tag(host)).toBe("app-counter");
        const p = elementNamed(host, "p");
        expect(h.text(p)).toBe("0");
        h.fire(elementNamed(host, "button"), "click");
        h.fire(elementNamed(host, "button"), "click");
        await whenFlushed();
        expect(h.text(p)).toBe("2");
        expect(h.attribute(p, "data-n")).toBe("2");
        expect(h.hasClass(p, "big")).toBe(true);
        expect(h.text(host)).toContain("big");
        ref.destroy();
        expect(h.children(root)).toEqual([]);
      });

      it("renders @for lists and keeps them in order as they change", async () => {
        class List {
          static meta = { selector: "app-list", template: html`<ul>@for (item of items(); track item) { <li>{{ item }}</li> }</ul>` };
          items = signal(["a", "b", "c"]);
        }
        const { renderer, root } = h.create();
        const ref = createComponent(List, { renderer, parent: root });
        const ul = elementNamed(h.children(root)[0]!, "ul");
        const items = () => h.children(ul).filter((c) => isElement(c, "li")).map((c) => h.text(c));
        expect(items()).toEqual(["a", "b", "c"]);
        ref.instance.items.set(["c", "a", "d"]);
        await whenFlushed();
        expect(items()).toEqual(["c", "a", "d"]);
        ref.destroy();
      });

      it("stamps the scoping token of scoped styles on the host and its elements", () => {
        class Box {
          static meta = { selector: "app-box", styles: ".a { color: red }", template: html`<div class="a">x</div>` };
        }
        const { renderer, root } = h.create();
        createComponent(Box, { renderer, parent: root });
        const host = h.children(root)[0]!;
        const token = renderer.registerStyles!("Box", ".a { color: red }", { scoped: true });
        expect(h.attribute(host, token)).toBe("");
        expect(h.attribute(elementNamed(host, "div"), token)).toBe("");
      });
    });
  });
}
