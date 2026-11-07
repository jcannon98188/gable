import { computed, effect, signal, untracked, type WritableSignal } from "./signals.js";
import type { Renderer } from "./renderer.js";
import { createEnv, evaluate, readModel, runHandler, writeModel, type Env, type Expr, type HandlerExpr } from "./expression.js";
import { createScope, currentScope, runInScope, type Scope } from "./scope.js";
import { FAILED, guard, guarded } from "./errors.js";
import { DEV } from "./dev-hooks.js";
import { disposeAndRemove } from "./removal.js";
import { devtools, hooks, retireView } from "./dev-hooks.js";
import { inputOf } from "./input.js";
import { OutputEmitter } from "./output.js";
import { prepare, type ComponentClass } from "./component.js";
import { parseSelector, matchesNode } from "./select.js";
import { viewOf, type Content, type ViewContext } from "./view-context.js";
import { keepContentTarget, registerEntry, withContentTarget } from "./query.js";
import { buildDefer } from "./defer.js";
import { bindI18nAttrs, buildI18nText } from "./i18n-view.js";
import { bindCustomField, bindNativeField, isCustomControl } from "./field-binding.js";
import type { ElementNode, ForNode, IfNode, SwitchNode, TemplateNode } from "./template.js";

/** The live top-level nodes of a built piece of template (blocks change theirs over time). */
export type Part<N> = () => N[];

export function flatten<N>(parts: Part<N>[]): N[] {
  return parts.flatMap((p) => p());
}

/** Builds template nodes into `parent`, before `before` (or at the end), and returns their live parts. */
export function buildNodes<N>(nodes: TemplateNode[], renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N>[] {
  const parts: Part<N>[] = [];
  try {
    for (const node of nodes) parts.push(buildNode(node, renderer, env, parent, before));
  } catch (error) {
    // Dev: a failed rebuild must leave nothing half-built behind.
    if (DEV) for (const part of parts) for (const node of part()) renderer.remove(node);
    throw error;
  }
  return parts;
}

function buildNode<N>(node: TemplateNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  switch (node.type) {
    case "text":
      return node.i18n ? buildI18nText(node.parts, node.i18n, renderer, env, parent, before) : buildText(node.parts, renderer, env, parent, before);
    case "element":
      return buildElement(node, renderer, env, parent, before);
    case "if":
      return buildIf(node, renderer, env, parent, before);
    case "for":
      return buildFor(node, renderer, env, parent, before);
    case "switch":
      return buildSwitch(node, renderer, env, parent, before);
    case "defer":
      return buildDefer(node, renderer, env, parent, before);
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
    const safe = guard(currentScope(), "text");
    effect(() => {
      const out = safe(() => {
        let out = "";
        for (const part of parts) {
          if (typeof part === "string") out += part;
          else {
            const v = evaluate(part, env);
            out += v == null ? "" : String(v);
          }
        }
        return out;
      });
      if (out !== FAILED) renderer.setText(text, out);
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
    const safe = guard(scope, `${kind}:${name}`);
    effect(() => {
      const value = safe(() => evaluate(expr, env));
      if (value === FAILED) return;
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
    const safe = guard(scope, `model:${name}`);
    effect(() => {
      const value = safe(() => readModel(expr, env));
      if (value !== FAILED) renderer.setProperty(el, name, value);
    });
    // The renderer decides what produces `<name>Change` (e.g. an input event on a native input).
    scope?.onDispose(renderer.listen(el, `${name}Change`, (event) => guarded(scope, "event", () => writeModel(expr, env, event), `${name}Change`)));
  }

  for (const { name, handler } of spec.events) scope?.onDispose(renderer.listen(el, name, eventHandler(handler, env, scope, name)));
}

/** A listener that reports its errors (and its returned Promise's rejection) as `event` instead of throwing. */
function eventHandler(handler: HandlerExpr, env: Env, scope: Scope | null, name: string): (event: unknown) => void {
  return (event) => {
    const local: Env = { instance: env.instance, locals: new Map([["$event", () => event]]), parent: env };
    guarded(scope, "event", () => untracked(() => runHandler(handler, local)), name);
  };
}

function buildElement<N>(node: ElementNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  if (node.tag === "slot") return buildSlot(node, renderer, env, parent, before);
  const view = viewOf(env);
  const matches = (view?.imports ?? []).filter((Class) => matchesNode(parseSelector(Class.meta.selector), node));
  if (DEV && matches.length === 0 && node.tag.includes("-")) {
    throw new Error(
      `Unknown element <${node.tag}>. Add its component to meta.imports of the component whose template uses it` +
        ((view?.lazies.length ?? 0) > 0 ? `; lazy() entries (${view!.lazies.map((l) => l.name).join(", ")}) can only be used inside @defer.` : "."),
    );
  }
  const dispatch = (before: N | null): Part<N> => buildElementOf(node, renderer, env, parent, before, view, matches);
  if (!(DEV && hooks.current && matches.length > 0)) return dispatch(before);
  return replaceable(renderer, dispatch, before);
}

/** Dev: an element hosting components lives in its own scope so a hot update can re-create it in place. */
function replaceable<N>(renderer: Renderer<N>, build: (before: N | null) => Part<N>, before: N | null): Part<N> {
  const outer = currentScope();
  const inTarget = keepContentTarget();
  let scope = createScope(outer);
  let part = runInScope(scope, () => build(before));
  const region = {
    build() {
      const next = createScope(outer);
      // The replacement goes in just before the live element; commit removes the old one.
      let nextPart: Part<N>;
      try {
        nextPart = inTarget(() => runInScope(next, () => build(part()[0] ?? null)));
      } catch (error) {
        next.dispose();
        throw error;
      }
      hooks.current?.region(next, region);
      return {
        commit() {
          const old = { scope, part };
          retireView(renderer, old.part(), nextPart(), () => {
            scope = next;
            part = nextPart;
            old.scope.dispose();
            for (const node of old.part()) renderer.remove(node);
          });
        },
        abort() {
          next.dispose();
          for (const node of nextPart()) renderer.remove(node);
        },
      };
    },
  };
  hooks.current!.region(scope, region);
  return () => part();
}

function buildElementOf<N>(
  node: ElementNode,
  renderer: Renderer<N>,
  env: Env,
  parent: N,
  before: N | null,
  view: ViewContext | undefined,
  matches: ComponentClass<any>[],
): Part<N> {
  const el = renderer.createElement(node.tag, parent);
  if (DEV) devtools.current?.element?.(el, node);
  const scope = currentScope();
  if (view?.scopeToken) renderer.setAttribute(el, view.scopeToken, "");
  renderer.insert(parent, el, before);
  try {
    for (const ref of node.refs) env.locals.set(ref, () => el);

    const projects = matches.some((Class) => Class.meta.template);
    const content = projects ? partitionContent(node.children, env) : null;
    const comps = matches
      .map((Class) => prepare(Class, { renderer, host: el, parentScope: scope, injector: view?.injector ?? null, content }))
      .filter((comp) => !comp.failed);
    for (const comp of comps) registerEntry(view?.queries, { instance: comp.instance, node: el, refs: node.refs }, scope);
    if (node.refs.length > 0) registerEntry(view?.queries, { node: el, refs: node.refs }, scope);
    const rest: Bindings = { attrs: node.attrs, bindings: [], models: [], events: [] };
    const inputFor = (name: string) => comps.map((c) => inputOf(c.instance, name)).find((h) => h);
    const subscribe = <T,>(source: { subscribe(next: (v: T) => void): { unsubscribe(): void } }, next: (v: T) => void) => {
      const sub = source.subscribe(next);
      scope?.onDispose(() => sub.unsubscribe());
    };

    for (const { name, value } of node.attrs) inputFor(name)?.set(value);
    if (node.i18nAttrs) bindI18nAttrs(node.i18nAttrs, env, (name, value) => (inputFor(name) ? inputFor(name)!.set(value) : renderer.setAttribute(el, name, value)));
    let field: Expr | undefined;
    for (const binding of node.bindings) {
      if (binding.kind === "prop" && binding.name === "field") {
        field = binding.expr;
        continue;
      }
      const target = binding.kind === "prop" ? inputFor(binding.name) : undefined;
      if (target) {
        const safe = guard(scope, `input:${binding.name}`);
        effect(() => {
          const value = safe(() => evaluate(binding.expr, env));
          if (value !== FAILED) target.set(value);
        });
      }
      else rest.bindings.push(binding);
    }
    for (const model of node.models) {
      const target = inputFor(model.name);
      if (!target) rest.models.push(model);
      else {
        const safe = guard(scope, `model:${model.name}`);
        effect(() => {
          const value = safe(() => readModel(model.expr, env));
          if (value !== FAILED) target.set(value);
        });
        if (target.changes) subscribe(target.changes, (v) => guarded(scope, "event", () => writeModel(model.expr, env, v), `${model.name}Change`));
      }
    }
    for (const event of node.events) {
      const out = comps.map((c) => (c.instance as Record<string, unknown>)[event.name]).find((o) => o instanceof OutputEmitter);
      if (out) subscribe(out as OutputEmitter<unknown>, eventHandler(event.handler, env, scope, event.name));
      else rest.events.push(event);
    }

    applyBindings(el, rest, renderer, env);
    const custom = field && isCustomControl(comps.map((c) => c.instance));
    if (field && custom) bindCustomField(comps.map((c) => c.instance), field, env);
    for (const comp of comps) comp.render();
    if (!projects) buildNodes(node.children, renderer, env, el, null);
    // A native control is bound last so that its options (<select>) exist when the value is written.
    if (field && !custom) bindNativeField(el, field, renderer, env);
    return () => [el];
  } catch (error) {
    if (DEV) renderer.remove(el);
    throw error;
  }
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
export function createSwitcher<N>(renderer: Renderer<N>, parent: N, before: N | null) {
  const anchor = renderer.createAnchor();
  renderer.insert(parent, anchor, before);
  const outer = currentScope();
  const inTarget = keepContentTarget();
  let scope: Scope | null = null;
  let parts: Part<N>[] = [];
  return {
    part: (() => [...flatten(parts), anchor]) as Part<N>,
    anchor,
    /** Disposes the current body and builds a new one (or none) in a fresh child scope. */
    show(build: (() => Part<N>[]) | null): void {
      const old = flatten(parts);
      const oldScope = scope;
      parts = [];
      scope = null;
      disposeAndRemove(renderer, oldScope, old);
      if (!build) return;
      const fresh = createScope(outer);
      scope = fresh;
      parts = untracked(() => inTarget(() => runInScope(fresh, build)));
    },
  };
}

function buildIf<N>(node: IfNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  const view = createSwitcher(renderer, parent, before);
  const alias = signal<unknown>(undefined);
  let shown = -2;
  const safe = guard(currentScope(), "@if");
  effect(() => {
    const picked = safe(() => {
      let index = -1;
      let value: unknown;
      for (let i = 0; i < node.branches.length && index < 0; i++) {
        const cond = node.branches[i]!.cond;
        value = cond ? evaluate(cond, env) : true;
        if (value) index = i;
      }
      return { index, value };
    });
    if (picked === FAILED) return;
    const { index, value } = picked;
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
  const safe = guard(currentScope(), "@switch");
  effect(() => {
    const found = safe(() => {
      const value = evaluate(node.expr, env);
      let index = node.cases.findIndex((c) => c.expr !== null && evaluate(c.expr, env) === value);
      if (index < 0) index = node.cases.findIndex((c) => c.expr === null);
      return index;
    });
    if (found === FAILED) return;
    const index = found;
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
  /** The item last written to the item signal. */
  value: unknown;
  /** Position in the previous render. */
  pos: number;
}

/** Marks the members of one longest strictly increasing subsequence of `seq` (O(n log n)). */
function longestIncreasing(seq: number[]): boolean[] {
  const tails: number[] = []; // tails[k]: index in seq of the smallest tail of an increasing run of length k + 1
  const prev: number[] = new Array(seq.length);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < seq[i]) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }
  const keep: boolean[] = new Array(seq.length).fill(false);
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep[i] = true;
  return keep;
}

function buildFor<N>(node: ForNode, renderer: Renderer<N>, env: Env, parent: N, before: N | null): Part<N> {
  const anchor = renderer.createAnchor();
  renderer.insert(parent, anchor, before);
  const outer = currentScope();
  const inTarget = keepContentTarget();
  const rows = new Map<unknown, Row<N>>();
  const count = signal(0);
  let empty: { scope: Scope; parts: Part<N>[] } | null = null;

  const showEmpty = (on: boolean) => {
    if (on && !empty && node.empty) {
      const scope = createScope(outer);
      const children = node.empty;
      empty = { scope, parts: inTarget(() => runInScope(scope, () => buildNodes(children, renderer, createEnv(env.instance, env), parent, anchor))) };
    } else if (!on && empty) {
      const old = empty;
      empty = null;
      disposeAndRemove(renderer, old.scope, flatten(old.parts));
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
    const parts = inTarget(() => runInScope(scope, () => buildNodes(node.children, renderer, rowEnv, parent, nextBefore)));
    return { scope, item: itemSig, index: indexSig, parts, value: item, pos: index };
  };

  const safe = guard(outer, "@for");
  effect(() => {
    const computed = safe(() => {
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
      return { items, keys, seen };
    });
    if (computed === FAILED) return;
    const { items, keys, seen } = computed;
    untracked(() => {
      for (const [key, row] of rows) {
        if (seen.has(key)) continue;
        rows.delete(key);
        disposeAndRemove(renderer, row.scope, flatten(row.parts));
      }
      // Surviving rows on a longest increasing subsequence of their previous positions keep their nodes; the rest move.
      const survivors: Row<N>[] = [];
      const survivorKeys: unknown[] = [];
      keys.forEach((key, i) => {
        const row = rows.get(key);
        if (!row) return;
        // Skip writes that change nothing: an unchanged item (by identity) and index wake no dependents.
        if (row.value !== items[i]) {
          row.value = items[i];
          row.item.set(items[i]);
        }
        if (row.pos !== i) row.index.set(i);
        survivors.push(row);
        survivorKeys.push(key);
      });
      const moved = new Set<unknown>();
      const stay = longestIncreasing(survivors.map((r) => r.pos));
      survivors.forEach((_, i) => {
        if (!stay[i]) moved.add(survivorKeys[i]);
      });
      // Create new rows first-to-last so anything registered while building (queries) is in order.
      const created = new Set<unknown>();
      keys.forEach((key, i) => {
        if (rows.has(key)) return;
        rows.set(key, makeRow(items[i], i, anchor));
        created.add(key);
      });
      // Then place rows last-to-first: moved and new rows go before their successor.
      // New rows were built just before the anchor in order, so a run of them at the end is already in place.
      let nextBefore: N = anchor;
      let trailing = true;
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i];
        const row = rows.get(key)!;
        const isNew = created.has(key);
        if (!isNew) trailing = false;
        if (moved.has(key) || (isNew && !trailing)) {
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
