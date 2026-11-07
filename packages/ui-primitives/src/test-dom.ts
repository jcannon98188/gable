import type { Provider } from "@gable/core";
import { parentOf, queryAll, type TestNode } from "@gable/testing/renderer";
import { MACHINE_ENV, type RootNodeLike } from "./env.js";

/**
 * A small DOM facade over the in-memory test renderer, enough for Zag machine actions (look up an element by id,
 * query siblings, move focus). Machine effects (focus trap, scroll lock, outside click) stay off, so tests of
 * Escape-to-close or focus trapping belong in a real DOM (jsdom).
 */
export interface TestDom extends RootNodeLike {
  /** The facade element for a node: what a real event would carry as `target` / `currentTarget`. */
  element(node: TestNode): unknown;
  /** The node holding focus, set by `focus()` calls from machine actions. */
  readonly activeNode: TestNode | null;
}

const doms = new WeakMap<TestNode, TestDom>();

/** Creates (or returns the existing) `TestDom` facade for the tree that `anyNode` belongs to. Provide it to machines under the in-memory test renderer through `MACHINE_ENV` so Zag actions can find elements by id and move focus. */
export function createTestDom(anyNode: TestNode): TestDom {
  let top = anyNode;
  for (let p = parentOf(top); p; p = parentOf(top)) top = p;
  const existing = doms.get(top);
  if (existing) return existing;
  const topOf = () => {
    let n = anyNode;
    for (let p = parentOf(n); p; p = parentOf(n)) n = p;
    return n;
  };
  const wrappers = new WeakMap<TestNode, ElementLike>();
  let active: TestNode | null = null;

  interface ElementLike {
    node: TestNode;
    [key: string]: unknown;
  }
  const unwrap = (x: unknown): TestNode | undefined => (x && typeof x === "object" ? ((x as { node?: TestNode }).node ?? undefined) : undefined);
  const wrap = (node: TestNode): ElementLike => {
    let el = wrappers.get(node);
    if (el) return el;
    el = {
      node,
      nodeType: 1,
      get id() {
        return node.attrs.id ?? "";
      },
      get nodeName() {
        return (node.tag ?? "").toUpperCase();
      },
      get localName() {
        return node.tag ?? "";
      },
      get tagName() {
        return (node.tag ?? "").toUpperCase();
      },
      get ownerDocument() {
        return doc;
      },
      get disabled() {
        return !!node.props.disabled || "disabled" in node.attrs;
      },
      get dataset() {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(node.attrs)) if (k.startsWith("data-")) out[k.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
        return out;
      },
      getRootNode: () => doc,
      matches(selector: string) {
        try {
          return queryAll(topOf(), selector).includes(node);
        } catch {
          return false;
        }
      },
      getAttribute: (name: string) => node.attrs[name] ?? null,
      setAttribute: (name: string, value: string) => void (node.attrs[name] = String(value)),
      removeAttribute: (name: string) => void delete node.attrs[name],
      hasAttribute: (name: string) => name in node.attrs,
      contains(other: unknown) {
        const target = unwrap(other);
        for (let n: TestNode | undefined = target; n; n = parentOf(n)) if (n === node) return true;
        return false;
      },
      querySelectorAll(selector: string) {
        // The test renderer's selector subset has no :not() or ~=; Zag uses `:not([disabled])` and `[data-ownedby~=id]` (one owner).
        const skipDisabled = selector.includes(":not([disabled])");
        let found: TestNode[];
        try {
          found = queryAll(node, selector.replace(/:not\(\[disabled\]\)/g, "").replace(/~=/g, "="));
        } catch {
          return []; // outside the test renderer's selector subset (e.g. Zag's focusable-elements list)
        }
        return found.filter((n) => !skipDisabled || !("disabled" in n.attrs || n.props.disabled)).map(wrap);
      },
      querySelector(selector: string) {
        return (el!.querySelectorAll as (s: string) => unknown[])(selector)[0] ?? null;
      },
      // select, combobox and menu scroll the highlighted item into view; there is no layout to scroll in memory.
      scrollIntoView() {},
      scrollTo() {},
      focus() {
        if (active === node) return;
        active = node;
        const event = { type: "focusin", target: el, currentTarget: el, bubbles: true, cancelable: true, defaultPrevented: false, preventDefault() {}, stopPropagation() {} };
        for (const handler of [...(node.listeners.focusin ?? [])]) handler(event);
      },
      blur() {
        if (active === node) active = null;
      },
    };
    wrappers.set(node, el);
    return el;
  };
  const doc: TestDom = {
    nodeType: 9,
    element: wrap,
    get activeNode() {
      return active;
    },
    get activeElement() {
      return active ? wrap(active) : null;
    },
    get ownerDocument() {
      return null;
    },
    getElementById(id: string) {
      const found = queryAll(topOf(), `[id="${id}"]`)[0];
      return found ? wrap(found) : null;
    },
  };
  doms.set(top, doc);
  return doc;
}

/** A realistic event for `fixture.dispatch(node, type, domEvent(node, type))`: `target` and `currentTarget` are DOM-like elements.
 * The test renderer does not bubble: to simulate an event from `from` reaching a listener on `node`, pass `from`. */
export function domEvent(node: TestNode, type: string, init: Record<string, unknown> = {}, from: TestNode = node): Record<string, unknown> {
  const dom = createTestDom(node);
  const element = dom.element(node);
  const event: Record<string, unknown> = {
    type,
    target: dom.element(from),
    currentTarget: element,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    button: 0,
    preventDefault() {
      event.defaultPrevented = true;
    },
    stopPropagation() {},
    ...init,
  };
  return event;
}

/** Providers that let machines run under the in-memory test renderer: `mount(App, { providers: provideTestDom() })`. */
export function provideTestDom(): Provider[] {
  const g = globalThis as { requestAnimationFrame?: (cb: () => void) => number; cancelAnimationFrame?: (id: number) => void };
  g.requestAnimationFrame ??= (cb) => setTimeout(cb, 0) as unknown as number;
  g.cancelAnimationFrame ??= (id) => clearTimeout(id);
    return [{ provide: MACHINE_ENV, useValue: { effects: false, getRootNode: (host: unknown) => createTestDom(host as TestNode) } }];
}

/** Presses a key on `from` the way a browser delivers it: the keydown listener on `node` (an ancestor, or `from` itself) sees it. */
export function pressKey(fixture: { dispatch(node: TestNode, name: string, event?: unknown): void }, node: TestNode, key: string, from: TestNode = node, init: Record<string, unknown> = {}): void {
  fixture.dispatch(node, "keydown", domEvent(node, "keydown", { key, code: key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, ...init }, from));
}

/** Moves focus to a node as a user tabbing or clicking would: fires its `focusin` listeners. */
export function focusNode(node: TestNode): void {
  (createTestDom(node).element(node) as { focus(): void }).focus();
}
