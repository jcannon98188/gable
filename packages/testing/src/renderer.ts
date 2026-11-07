import type { Renderer } from "@gable/core/renderer";
import { createTestPlatform, type TestPlatform } from "./platform.js";

export { createTestPlatform } from "./platform.js";
export type { TestPlatform } from "./platform.js";

/** A node of the in-memory test renderer. Plain, read-only-by-convention data. */
export interface TestNode {
  readonly kind: "element" | "text" | "anchor";
  readonly tag?: string;
  text: string;
  readonly props: Record<string, unknown>;
  readonly attrs: Record<string, string>;
  readonly classes: string[];
  readonly styles: Record<string, string>;
  readonly children: TestNode[];
  readonly listeners: Record<string, Array<(event: unknown) => void>>;
}

const parents = new WeakMap<TestNode, TestNode>();

export function parentOf(node: TestNode): TestNode | undefined {
  return parents.get(node);
}

function makeNode(kind: TestNode["kind"], tag?: string, text = ""): TestNode {
  return { kind, tag, text, props: {}, attrs: {}, classes: [], styles: {}, children: [], listeners: {} };
}

function detach(node: TestNode): void {
  const parent = parents.get(node);
  if (!parent) return;
  parent.children.splice(parent.children.indexOf(node), 1);
  parents.delete(node);
}

/** The test renderer, with the CSS it was asked to register (by component id) exposed for assertions. */
export interface TestRenderer extends Renderer<TestNode> {
  readonly styles: Map<string, string>;
  readonly name: string;
  /** The in-memory Location, History and Title this renderer provides to `bootstrap`. */
  readonly platform: TestPlatform;
  /** Sets the node the overlay root is attached to (as a child), so overlay content stays in the mounted tree. `mount` and `resolveTarget` call it. */
  setOverlayContainer(container: TestNode): void;
}

/** The in-memory renderer: an inspectable node tree, no DOM. */
export function createTestRenderer(options: { url?: string } = {}): TestRenderer {
  const styles = new Map<string, string>();
  const platform = createTestPlatform(options.url);
  let container: TestNode | undefined;
  platform.bindTree({ root: () => container, find: query });
  let overlay: TestNode | undefined;
  return {
    setOverlayContainer(root) {
      container = root;
      if (overlay && parents.get(overlay) !== root) {
        detach(overlay);
        parents.set(overlay, root);
        root.children.push(overlay);
      }
    },
    overlayRoot() {
      if (!overlay) {
        overlay = makeNode("element", "gable-overlay");
        if (container) {
          parents.set(overlay, container);
          container.children.push(overlay);
        }
      }
      return overlay;
    },
    name: "test",
    styles,
    platform,
    providers: platform.providers,
    createElement: (tag) => makeNode("element", tag),
    createText: (text) => makeNode("text", undefined, text),
    createAnchor: () => makeNode("anchor"),
    setProperty(node, name, value) {
      node.props[name] = value;
    },
    setAttribute(node, name, value) {
      if (value === null) delete node.attrs[name];
      else node.attrs[name] = value;
    },
    setClass(node, name, on) {
      const i = node.classes.indexOf(name);
      if (on && i < 0) node.classes.push(name);
      else if (!on && i >= 0) node.classes.splice(i, 1);
    },
    setStyle(node, name, value) {
      if (value === null) delete node.styles[name];
      else node.styles[name] = value;
    },
    setText(node, text) {
      node.text = text;
    },
    insert(parent, node, before) {
      detach(node);
      const at = before ? parent.children.indexOf(before) : -1;
      if (at >= 0) parent.children.splice(at, 0, node);
      else parent.children.push(node);
      parents.set(node, parent);
    },
    remove: detach,
    listen(node, name, handler) {
      (node.listeners[name] ??= []).push(handler);
      return () => {
        const list = node.listeners[name];
        const i = list?.indexOf(handler) ?? -1;
        if (i >= 0) list!.splice(i, 1);
      };
    },
    fieldControl(node) {
      const type = () => String(node.attrs.type ?? node.props.type ?? "text");
      const tag = node.tag;
      const checkable = () => tag === "input" && (type() === "checkbox" || type() === "radio");
      const optionValue = () => String(node.attrs.value ?? node.props.value ?? "");
      const self = this;
      return {
        write(value) {
          if (tag === "input" && type() === "checkbox") node.props.checked = !!value;
          else if (tag === "input" && type() === "radio") node.props.checked = value != null && optionValue() === String(value);
          else node.props.value = value == null ? "" : String(value);
        },
        setState({ disabled, readonly, invalid }) {
          node.props.disabled = disabled;
          node.props.readOnly = readonly;
          if (invalid) node.attrs["aria-invalid"] = "true";
          else delete node.attrs["aria-invalid"];
        },
        listen({ value, touched }) {
          const event = checkable() || tag === "select" ? "change" : "input";
          const onValue = () => {
            if (checkable()) {
              if (type() === "radio") {
                if (node.props.checked) value(optionValue());
              } else value(!!node.props.checked);
            } else if (tag === "input" && (type() === "number" || type() === "range")) {
              const text = String(node.props.value ?? "");
              const n = text === "" ? Number.NaN : Number(text);
              value(Number.isNaN(n) ? null : n);
            } else value(node.props.value ?? "");
          };
          const offs = [self.listen(node, event, onValue), self.listen(node, "blur", () => touched())];
          return () => offs.forEach((off) => off());
        },
      };
    },
    registerStyles(componentId, css, options) {
      styles.set(componentId, css);
      return options?.scoped === false ? "" : `g-${componentId}`;
    },
    resolveTarget(target) {
      if (typeof target === "object" && target !== null && "kind" in target) {
        this.setOverlayContainer(target as TestNode);
        return target as TestNode;
      }
      throw new Error(`The test renderer cannot resolve the target ${String(target)}: pass a node from createTestRoot().`);
    },
  };
}

// --- queries ---------------------------------------------------------------

interface Compound {
  tag?: string;
  classes: string[];
  id?: string;
  attrs: Array<[string, string | undefined]>;
  /** How this compound relates to the previous one. */
  combinator: " " | ">";
}

function parseSelector(selector: string): Compound[] {
  const steps: Compound[] = [];
  const re = /\s*(>)?\s*((?:[\w*-]+|[.#][\w-]+|\[[^\]]+\])+)/gy;
  let m: RegExpExecArray | null;
  let end = 0;
  while ((m = re.exec(selector.trim()))) {
    end = re.lastIndex;
    const c: Compound = { classes: [], attrs: [], combinator: m[1] ? ">" : " " };
    for (const part of m[2]!.matchAll(/([.#]?)([\w*-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g)) {
      if (part[3] !== undefined) c.attrs.push([part[3], part[4] ?? part[5] ?? part[6]]);
      else if (part[1] === ".") c.classes.push(part[2]!);
      else if (part[1] === "#") c.id = part[2]!;
      else if (part[2] !== "*") c.tag = part[2]!;
    }
    steps.push(c);
  }
  if (steps.length === 0 || end !== selector.trim().length) throw new Error(`Unsupported selector "${selector}"`);
  return steps;
}

/** Classes from the `class` attribute and from `setClass`. */
function classList(node: TestNode): string[] {
  return [...(node.attrs.class ? node.attrs.class.split(/\s+/) : []), ...node.classes];
}

function matchesCompound(node: TestNode, c: Compound): boolean {
  if (node.kind !== "element") return false;
  if (c.tag && node.tag !== c.tag) return false;
  if (c.id !== undefined && node.attrs.id !== c.id) return false;
  if (!c.classes.every((cls) => classList(node).includes(cls))) return false;
  return c.attrs.every(([name, value]) => (value === undefined ? name in node.attrs : node.attrs[name] === value));
}

function matchesFrom(node: TestNode, steps: Compound[], i: number): boolean {
  if (!matchesCompound(node, steps[i]!)) return false;
  if (i === 0) return true;
  const parent = parents.get(node);
  if (steps[i]!.combinator === ">") return parent !== undefined && matchesFrom(parent, steps, i - 1);
  for (let p = parent; p; p = parents.get(p)) if (matchesFrom(p, steps, i - 1)) return true;
  return false;
}

/** CSS subset: tag, .class, #id, [attr], [attr=value], descendant and child combinators. Matches descendants of `root`. */
export function queryAll(root: TestNode, selector: string): TestNode[] {
  const steps = parseSelector(selector);
  const out: TestNode[] = [];
  const walk = (node: TestNode) => {
    for (const child of node.children) {
      if (matchesFrom(child, steps, steps.length - 1)) out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

export function query(root: TestNode, selector: string): TestNode | null {
  return queryAll(root, selector)[0] ?? null;
}

// --- serialisation ---------------------------------------------------------

export function textContent(node: TestNode): string {
  if (node.kind === "text") return node.text;
  return node.children.map(textContent).join("");
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function openTag(node: TestNode): string {
  let out = `<${node.tag}`;
  const attrs = { ...node.attrs };
  const classes = [...(attrs.class ? attrs.class.split(/\s+/) : []), ...node.classes];
  delete attrs.class;
  if (classes.length) out += ` class="${classes.join(" ")}"`;
  for (const [k, v] of Object.entries(attrs)) out += ` ${k}="${escape(v)}"`;
  const style = Object.entries(node.styles).map(([k, v]) => `${k}: ${v}`).join("; ");
  if (style) out += ` style="${style}"`;
  return out + ">";
}

/** Stable pretty-printed markup: attributes, classes and styles; properties are not shown. */
export function serialize(node: TestNode, indent = ""): string {
  if (node.kind === "text") return indent + escape(node.text);
  if (node.kind === "anchor") return `${indent}<!---->`;
  const open = openTag(node);
  const close = `</${node.tag}>`;
  if (node.children.length === 0) return indent + open + close;
  if (node.children.every((c) => c.kind === "text")) return indent + open + escape(textContent(node)) + close;
  const inner = node.children.map((c) => serialize(c, indent + "  ")).join("\n");
  return `${indent}${open}\n${inner}\n${indent}${close}`;
}

/** A detached root container to mount into. */
export function createTestRoot(): TestNode {
  return makeNode("element", "#root");
}

export { defineRendererConformance } from "./conformance.js";
export type { RendererHarness, TestApi } from "./conformance.js";
