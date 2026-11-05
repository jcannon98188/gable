import { computed, effect, signal, untracked, type WritableSignal } from "./signals.js";
import type { Renderer } from "./renderer.js";
import { createEnv, evaluate, readModel, runHandler, writeModel, type Env, type Expr, type HandlerExpr } from "./expression.js";
import { createScope, currentScope, runInScope, type Scope } from "./scope.js";
import { DEV } from "./di.js";
import { inputOf } from "./input.js";
import { OutputEmitter } from "./output.js";
import { prepare, type ComponentClass } from "./component.js";
import { parseSelector, matchesNode } from "./select.js";
import { viewOf, type Content } from "./view-context.js";
import { registerEntry, withContentTarget } from "./query.js";
import type { ElementNode, ForNode, IfNode, SwitchNode, TemplateNode } from "./template.js";

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
  switch (node.type) {
    case "text":
      return buildText(node.parts, renderer, env, parent, before);
    case "element":
      return buildElement(node, renderer, env, parent, before);
    case "if":
      return buildIf(node, renderer, env, parent, before);
    case "for":
      return buildFor(node, renderer, env, parent, before);
    case "switch":
      return buildSwitch(node, renderer, env, parent, before);
    case "let": {
      env.locals.set(node.name, computed(() => evaluate(node.expr, env)));
      return () => [];
    }
  }
}

function buildText<N>(parts: Array<string | Expr>, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  const dynamic = parts.some((p) => typeof p !== "string");
  const text = renderer.createText(dynamic ? "" : (parts as string[]).join(""));
  renderer.insert(parent, text, before);
  if (dynamic) {
    effect(() => {
      let out = "";
      for (const part of parts) {
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

type Bindings = Pick<ElementNode, "attrs" | "bindings" | "models" | "events">;

/** Applies attributes, bindings, two-way models and event listeners to `el`, all owned by the current scope. */
export function applyBindings<N>(el: N, spec: Bindings, renderer: Renderer<N>, env: Env): void {
  const scope = currentScope();
  for (const { name, value } of spec.attrs) renderer.setAttribute(el, name, value);

  for (const { kind, name, expr } of spec.bindings) {
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

  for (const { name, expr } of spec.models) {
    effect(() => renderer.setProperty(el, name, readModel(expr, env)));
    // The renderer decides what produces `<name>Change` (e.g. an input event on a native input).
    scope?.onDispose(renderer.listen(el, `${name}Change`, (event) => writeModel(expr, env, event)));
  }

  for (const { name, handler } of spec.events) scope?.onDispose(renderer.listen(el, name, eventHandler(handler, env)));
}

function eventHandler(handler: HandlerExpr, env: Env): (event: unknown) => void {
  return (event) => {
    const local: Env = { instance: env.instance, locals: new Map([["$event", () => event]]), parent: env };
    untracked(() => runHandler(handler, local));
  };
}

function buildElement<N>(node: ElementNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  if (node.tag === "slot") return buildSlot(node, renderer, env, parent, before);
  const el = renderer.createElement(node.tag, parent);
  const scope = currentScope();
  const view = viewOf(env);
  const matches = (view?.imports ?? []).filter((Class) => matchesNode(parseSelector(Class.meta.selector), node));
  if (DEV && matches.length === 0 && node.tag.includes("-")) {
    throw new Error(
      `Unknown element <${node.tag}>. Add its component to meta.imports of the component whose template uses it.`,
    );
  }
  if (view?.scopeToken) renderer.setAttribute(el, view.scopeToken, "");
  renderer.insert(parent, el, before);
  for (const ref of node.refs) env.locals.set(ref, () => el);

  const projects = matches.some((Class) => Class.meta.template);
  const content = projects ? partitionContent(node.children, env) : null;
  const comps = matches.map((Class) => prepare(Class, { renderer, host: el, parentScope: scope, injector: view?.injector ?? null, content }));
  for (const comp of comps) registerEntry(view?.queries, { instance: comp.instance, node: el, refs: node.refs }, scope);
  if (node.refs.length > 0) registerEntry(view?.queries, { node: el, refs: node.refs }, scope);
  const rest: Bindings = { attrs: node.attrs, bindings: [], models: [], events: [] };
  const inputFor = (name: string) => comps.map((c) => inputOf(c.instance, name)).find((h) => h);
  const subscribe = <T,>(source: { subscribe(next: (v: T) => void): { unsubscribe(): void } }, next: (v: T) => void) => {
    const sub = source.subscribe(next);
    scope?.onDispose(() => sub.unsubscribe());
  };

  for (const { name, value } of node.attrs) inputFor(name)?.set(value);
  for (const binding of node.bindings) {
    const target = binding.kind === "prop" ? inputFor(binding.name) : undefined;
    if (target) effect(() => target.set(evaluate(binding.expr, env)));
    else rest.bindings.push(binding);
  }
  for (const model of node.models) {
    const target = inputFor(model.name);
    if (!target) rest.models.push(model);
    else {
      effect(() => target.set(readModel(model.expr, env)));
      if (target.changes) subscribe(target.changes, (v) => writeModel(model.expr, env, v));
    }
  }
  for (const event of node.events) {
    const out = comps.map((c) => (c.instance as Record<string, unknown>)[event.name]).find((o) => o instanceof OutputEmitter);
    if (out) subscribe(out as OutputEmitter<unknown>, eventHandler(event.handler, env));
    else rest.events.push(event);
  }

  applyBindings(el, rest, renderer, env);
  for (const comp of comps) comp.render();
  if (!projects) buildNodes(node.children, renderer, env, el, null);
  return () => [el];
}

/** Splits a component element's children into named slots (`slot="name"`) and the default slot. */
function partitionContent(children: TemplateNode[], env: Env): Content {
  const slots = new Map<string, TemplateNode[]>();
  for (const child of children) {
    const name = (child.type === "element" && child.attrs.find((a) => a.name === "slot")?.value) || "";
    slots.set(name, [...(slots.get(name) ?? []), child]);
  }
  return { env, slots };
}

/** `<slot>` renders what the parent projected, built in the parent's Env, else its own fallback children. */
function buildSlot<N>(node: ElementNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  const view = viewOf(env);
  const name = node.attrs.find((a) => a.name === "name")?.value ?? "";
  const projected = view?.content?.slots.get(name);
  const parts =
    projected && view?.content
      ? withContentTarget(view.queries, () => buildNodes(projected, renderer, view.content!.env, parent, before))
      : buildNodes(node.children, renderer, env, parent, before);
  return () => flatten(parts);
}

// --- control flow ----------------------------------------------------------

/** A region that swaps between alternative bodies, each built in its own scope. */
function createSwitcher<N>(renderer: Renderer<N>, parent: N, before: N | null) {
  const anchor = renderer.createAnchor();
  renderer.insert(parent, anchor, before);
  const outer = currentScope();
  let scope: Scope | null = null;
  let parts: Part<N>[] = [];
  return {
    part: (() => [...flatten(parts), anchor]) as Part<N>,
    anchor,
    /** Disposes the current body and builds a new one (or none) in a fresh child scope. */
    show(build: (() => Part<N>[]) | null): void {
      scope?.dispose();
      for (const node of flatten(parts)) renderer.remove(node);
      parts = [];
      scope = null;
      if (!build) return;
      const fresh = createScope(outer);
      scope = fresh;
      parts = untracked(() => runInScope(fresh, build));
    },
  };
}

function buildIf<N>(node: IfNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  const view = createSwitcher(renderer, parent, before);
  const alias = signal<unknown>(undefined);
  let shown = -2;
  effect(() => {
    let index = -1;
    let value: unknown;
    for (let i = 0; i < node.branches.length && index < 0; i++) {
      const cond = node.branches[i]!.cond;
      value = cond ? evaluate(cond, env) : true;
      if (value) index = i;
    }
    alias.set(value);
    if (index === shown) return;
    shown = index;
    const branch = node.branches[index];
    view.show(
      branch &&
        (() => {
          const branchEnv = createEnv(env.instance, env);
          if (branch.alias) branchEnv.locals.set(branch.alias, alias);
          return buildNodes(branch.children, renderer, branchEnv, parent, view.anchor);
        }),
    );
  });
  return view.part;
}

function buildSwitch<N>(node: SwitchNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  const view = createSwitcher(renderer, parent, before);
  let shown = -2;
  effect(() => {
    const value = evaluate(node.expr, env);
    let index = node.cases.findIndex((c) => c.expr !== null && evaluate(c.expr, env) === value);
    if (index < 0) index = node.cases.findIndex((c) => c.expr === null);
    if (index === shown) return;
    shown = index;
    const chosen = node.cases[index];
    view.show(chosen && (() => buildNodes(chosen.children, renderer, createEnv(env.instance, env), parent, view.anchor)));
  });
  return view.part;
}

interface Row<N> {
  scope: Scope;
  item: WritableSignal<unknown>;
  index: WritableSignal<number>;
  parts: Part<N>[];
  /** Position in the previous render. */
  pos: number;
}

function buildFor<N>(node: ForNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  const anchor = renderer.createAnchor();
  renderer.insert(parent, anchor, before);
  const outer = currentScope();
  const rows = new Map<unknown, Row<N>>();
  const count = signal(0);
  let empty: { scope: Scope; parts: Part<N>[] } | null = null;

  const showEmpty = (on: boolean) => {
    if (on && !empty && node.empty) {
      const scope = createScope(outer);
      const children = node.empty;
      empty = { scope, parts: runInScope(scope, () => buildNodes(children, renderer, createEnv(env.instance, env), parent, anchor)) };
    } else if (!on && empty) {
      empty.scope.dispose();
      for (const n of flatten(empty.parts)) renderer.remove(n);
      empty = null;
    }
  };

  const makeRow = (item: unknown, index: number, nextBefore: N): Row<N> => {
    const scope = createScope(outer);
    const itemSig = signal(item);
    const indexSig = signal(index);
    const rowEnv = createEnv(env.instance, env);
    rowEnv.locals.set(node.item, itemSig);
    rowEnv.locals.set("$index", indexSig);
    rowEnv.locals.set("$count", count);
    rowEnv.locals.set("$first", () => indexSig() === 0);
    rowEnv.locals.set("$last", () => indexSig() === count() - 1);
    rowEnv.locals.set("$even", () => indexSig() % 2 === 0);
    rowEnv.locals.set("$odd", () => indexSig() % 2 === 1);
    const parts = runInScope(scope, () => buildNodes(node.children, renderer, rowEnv, parent, nextBefore));
    return { scope, item: itemSig, index: indexSig, parts, pos: index };
  };

  effect(() => {
    const raw = evaluate(node.source, env);
    if (raw != null && typeof (raw as Iterable<unknown>)[Symbol.iterator] !== "function") {
      throw new TypeError("@for source must be an array or other iterable");
    }
    const items = raw == null ? [] : Array.from(raw as Iterable<unknown>);
    const keys = items.map((item, i) => {
      const trackEnv = createEnv(env.instance, env);
      trackEnv.locals.set(node.item, () => item);
      trackEnv.locals.set("$index", () => i);
      return evaluate(node.track, trackEnv);
    });
    const seen = new Set<unknown>();
    for (const key of keys) {
      if (seen.has(key)) throw new Error(`@for track expression produced the duplicate key ${String(key)}; track keys must be unique.`);
      seen.add(key);
    }
    untracked(() => {
      for (const [key, row] of rows) {
        if (seen.has(key)) continue;
        row.scope.dispose();
        for (const n of flatten(row.parts)) renderer.remove(n);
        rows.delete(key);
      }
      // Rows whose previous order is still increasing keep their nodes; the rest move.
      const moved = new Set<unknown>();
      let maxPos = -1;
      keys.forEach((key, i) => {
        const row = rows.get(key);
        if (!row) return;
        row.item.set(items[i]);
        row.index.set(i);
        if (row.pos > maxPos) maxPos = row.pos;
        else moved.add(key);
      });
      // Create new rows first-to-last so anything registered while building (queries) is in order.
      const created = new Set<unknown>();
      keys.forEach((key, i) => {
        if (rows.has(key)) return;
        rows.set(key, makeRow(items[i], i, anchor));
        created.add(key);
      });
      // Then place rows last-to-first: moved and new rows go before their successor.
      let nextBefore: N = anchor;
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i];
        const row = rows.get(key)!;
        if (moved.has(key) || created.has(key)) {
          for (const n of flatten(row.parts)) renderer.insert(parent, n, nextBefore);
        }
        nextBefore = flatten(row.parts)[0] ?? nextBefore;
      }
      keys.forEach((key, i) => (rows.get(key)!.pos = i));
      count.set(keys.length);
      showEmpty(keys.length === 0);
    });
  });

  return () => [
    ...[...rows.values()].sort((a, b) => a.pos - b.pos).flatMap((r) => flatten(r.parts)),
    ...(empty ? flatten(empty.parts) : []),
    anchor,
  ];
}
