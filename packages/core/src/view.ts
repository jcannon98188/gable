import { effect, untracked } from "./signals.js";
import type { Renderer } from "./renderer.js";
import { evaluate, runHandler, writeModel, type Env } from "./expression.js";
import { currentScope } from "./scope.js";
import type { ElementNode, TemplateNode } from "./template.js";

/** The live top-level nodes of a built piece of template (blocks change theirs over time). */
export type Part<N> = () => N[];

export function flatten<N>(parts: Part<N>[]): N[] {
  return parts.flatMap((p) => p());
}

/** Builds template nodes into `parent`, before `before` (or at the end), and returns their live parts. */
export function buildNodes<N>(nodes: TemplateNode[], renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N>[] {
  const parts: Part<N>[] = [];
  for (const node of nodes) parts.push(buildNode(node, renderer, env, parent, before));
  return parts;
}

function buildNode<N>(node: TemplateNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  if (node.type === "text") {
    const dynamic = node.parts.some((p) => typeof p !== "string");
    const text = renderer.createText(dynamic ? "" : (node.parts as string[]).join(""));
    renderer.insert(parent, text, before);
    if (dynamic) {
      effect(() => {
        let out = "";
        for (const part of node.parts) {
          if (typeof part === "string") out += part;
          else {
            const v = evaluate(part, env);
            out += v == null ? "" : String(v);
          }
        }
        renderer.setText(text, out);
      });
    }
    return () => [text];
  }
  return buildElement(node, renderer, env, parent, before);
}

function buildElement<N>(node: ElementNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  const el = renderer.createElement(node.tag, parent);
  const scope = currentScope();
  for (const { name, value } of node.attrs) renderer.setAttribute(el, name, value);
  renderer.insert(parent, el, before);
  for (const ref of node.refs) env.locals.set(ref, () => el);

  for (const { kind, name, expr } of node.bindings) {
    effect(() => {
      const value = evaluate(expr, env);
      switch (kind) {
        case "prop":
          return renderer.setProperty(el, name, value);
        case "attr":
          return renderer.setAttribute(el, name, value == null ? null : String(value));
        case "class":
          return renderer.setClass(el, name, !!value);
        case "style":
          return renderer.setStyle(el, name, value == null || value === false ? null : String(value));
      }
    });
  }

  for (const { name, expr } of node.models) {
    effect(() => renderer.setProperty(el, name, evaluate(expr, env)));
    // The renderer decides what produces `<name>Change` (e.g. an input event on a native input).
    listen(`${name}Change`, (event) => writeModel(expr, env, event));
  }

  for (const { name, handler } of node.events) {
    listen(name, (event) => {
      const local: Env = { instance: env.instance, locals: new Map([["$event", () => event]]), parent: env };
      untracked(() => runHandler(handler, local));
    });
  }

  function listen(name: string, handler: (event: unknown) => void): void {
    const off = renderer.listen(el, name, handler);
    scope?.onDispose(off);
  }

  buildNodes(node.children, renderer, env, el, null);
  return () => [el];
}
