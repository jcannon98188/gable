import { effect } from "./signals.js";
import { createScope, runInScope, type Scope } from "./scope.js";
import type { Renderer } from "./renderer.js";
import { evaluate } from "./expression.js";
import { parseTemplate, type TemplateNode, type TemplateResult } from "./template.js";

/** Static component metadata. */
export interface ComponentMeta {
  selector: string;
  template: TemplateResult;
}

/** A component is a plain class with `static meta`. No base class, no constructor. */
export interface ComponentClass<T extends object = object> {
  new (): T;
  meta: ComponentMeta;
}

export interface MountedComponent<T extends object, N> {
  readonly instance: T;
  readonly host: N;
  destroy(): void;
}

/** Splits a simple selector (`tag`, `.class`, `[attr]`, `[attr=value]`) into host parts. */
function parseSelector(selector: string): { tag: string; classes: string[]; attrs: Array<[string, string]> } {
  const tagMatch = /^[A-Za-z][\w-]*/.exec(selector);
  const tag = tagMatch?.[0] ?? "div";
  const rest = selector.slice(tagMatch ? tag.length : 0);
  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
  const attrs = [...rest.matchAll(/\[([\w-]+)(?:=([^\]]*))?\]/g)].map((m): [string, string] => [m[1]!, m[2] ?? ""]);
  return { tag, classes, attrs };
}

/**
 * Instantiates a component against a renderer and returns a handle. This is
 * the internal seam beneath the later public `createComponent`/`bootstrap`
 * and the testing `mount`.
 */
export function instantiate<T extends object, N>(
  Class: ComponentClass<T>,
  renderer: Renderer<N>,
  parent: N,
  parentScope: Scope | null = null,
): MountedComponent<T, N> {
  const scope = createScope(parentScope);
  const { selector, template } = Class.meta;
  const hostSpec = parseSelector(selector);
  return runInScope(scope, () => {
    const instance = new Class(); // field initialisers run owned by `scope`
    const host = renderer.createElement(hostSpec.tag, parent);
    for (const [name, value] of hostSpec.attrs) renderer.setAttribute(host, name, value);
    for (const name of hostSpec.classes) renderer.setClass(host, name, true);
    renderer.insert(parent, host);
    for (const node of parseTemplate(template)) build(node, renderer, host, instance);
    return {
      instance,
      host,
      destroy() {
        scope.dispose();
        renderer.remove(host);
      },
    };
  });
}

function build<N>(node: TemplateNode, renderer: Renderer<N>, parent: N, instance: object): void {
  if (node.type === "text") {
    const dynamic = node.parts.some((p) => typeof p !== "string");
    const text = renderer.createText(dynamic ? "" : (node.parts as string[]).join(""));
    renderer.insert(parent, text);
    if (dynamic) {
      effect(() => {
        let out = "";
        for (const part of node.parts) {
          if (typeof part === "string") out += part;
          else {
            const v = evaluate(part, instance);
            out += v == null ? "" : String(v);
          }
        }
        renderer.setText(text, out);
      });
    }
    return;
  }
  const el = renderer.createElement(node.tag, parent);
  for (const { name, value } of node.attrs) renderer.setAttribute(el, name, value);
  renderer.insert(parent, el);
  for (const { name, expr } of node.props) effect(() => renderer.setProperty(el, name, evaluate(expr, instance)));
  for (const child of node.children) build(child, renderer, el, instance);
}
