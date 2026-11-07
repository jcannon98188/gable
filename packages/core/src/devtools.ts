// The devtools instrumentation layer. Dev only: nothing imports this file except behind `if (DEV)`, so a production
// build (`__GABLE_DEV__: false`) drops it. It fills the runtime's `devtools` slot (see `dev-hooks.ts`) and exposes a
// transport-agnostic global, `window.__GABLE_DEVTOOLS_HOOK__`, that any client (the browser extension, a test, a
// console snippet) talks to: `call(method, params)` for state and actions, `connect(listener)` for pushed events.
// Every value that crosses the hook is JSON-safe. No semver promise.
import type { DevtoolsSink, HmrChange, RouterDevInfo } from "./dev-hooks.js";
import { devtools } from "./dev-hooks.js";
import { inspectNode, peekNode, pokeNode } from "./signals.js";
import type { Scope } from "./scope.js";

// --- protocol types ---------------------------------------------------------

/** A JSON-safe preview of any value. */
export interface Preview {
  /** `undefined` `null` `boolean` `number` `bigint` `string` `symbol` `function` `array` `object` `map` `set` `element` `date` `error` `unset` `thrown` */
  t: string;
  /** A short display string. */
  s: string;
  children?: Array<[string, Preview]>;
  /** How many children were left out. */
  more?: number;
}

export type SignalKind = "state" | "computed" | "input" | "model" | "effect" | "internal";

/** A dependency edge: the other end of a signal's source or sink relation. */
export interface Edge {
  id: string;
  name: string;
  kind: SignalKind;
}

export interface SignalInfo {
  id: string;
  name: string;
  kind: SignalKind;
  value: Preview;
  writable: boolean;
  /** What this reads. */
  sources: Edge[];
  /** What reads this (computeds and effects). */
  sinks: Edge[];
  /** The component that owns it, when known. */
  owner: { id: string; name: string } | null;
}

export interface EffectInfo {
  id: string;
  label: string;
  runs: number;
  totalMs: number;
  lastMs: number;
  sources: Edge[];
}

export interface TreeNode {
  id: string;
  parent: string | null;
  name: string;
  selector: string;
  /** The host's tag name (or node kind under a non-DOM renderer). */
  host: string;
  /** Id of the component's own injector, when it has one. */
  injector: string | null;
  /** What tells this instance apart from its siblings: the host's id, aria-label or a snippet of its text. Empty when none. */
  label: string;
}

export interface SourceInfo {
  /** The module path as served (for example `/src/app.ts`). */
  path: string;
  /** Absolute file path, when the dev server's root is known. */
  file: string | null;
}

export interface ComponentDetail extends TreeNode {
  source: SourceInfo | null;
  inputs: SignalInfo[];
  outputs: string[];
  signals: SignalInfo[];
  effects: EffectInfo[];
}

export interface InjectorNode {
  id: string;
  parent: string | null;
  /** The component whose own injector this is. */
  component: { id: string; name: string } | null;
  entryCount: number;
}

/** The Provider behind a Token: how its value is made. */
export interface ProviderInfo {
  /** `class`: a bare class or `useClass`; `value`: `useValue`; `factory`: `useFactory`; `existing`: `useExisting` (an alias of `target`). */
  kind: "class" | "value" | "factory" | "existing";
  /** The class (`class`), the aliased Token (`existing`), the factory's name (`factory`) or a preview of the value (`value`). */
  target: string;
}

export interface InjectorEntry {
  name: string;
  kind: "class" | "token";
  /** How this Token is provided in this injector; `null` when the entry did not come from a Provider. */
  provider: ProviderInfo | null;
  resolved: boolean;
  value: Preview;
  /** Signals found on a resolved class instance. */
  signals: SignalInfo[];
}

export interface InjectorDetail extends InjectorNode {
  entries: InjectorEntry[];
}

export interface EffectRun {
  id: string;
  label: string;
  component: string | null;
  ms: number;
  first: boolean;
}

/** One scheduler flush (or, with `kind: "init"`, the first runs of effects created outside a flush). */
export interface FlushRecord {
  seq: number;
  kind: "flush" | "init";
  /** `performance.now()` when it started. */
  at: number;
  ms: number;
  rounds: number;
  runs: EffectRun[];
  /** Runs left out of `runs`. */
  more: number;
}

export interface HmrEntry {
  seq: number;
  at: number;
  status: string;
  modules: string[];
  /** What the update did to each changed class: `patch`, `view` or `resetup` (classes whose edit changed nothing are left out). */
  changes: HmrChange[];
  errors: string[];
}

export interface RouteNode {
  path: string;
  component: string | null;
  redirectTo?: string;
  title?: string;
  guards: string[];
  children: RouteNode[] | "lazy" | null;
  active: boolean;
}

export interface RouterNavigation {
  seq: number;
  at: number;
  type: string;
  id: number;
  url: string;
  detail?: string;
}

export interface RouterInfo {
  id: string;
  url: string;
  navigating: boolean;
  params: Preview;
  queryParams: Preview;
  fragment: Preview;
  data: Preview;
  routes: RouteNode[];
  events: RouterNavigation[];
}

/** What a package (a store, say) registers to appear in the panel's inspector tab. */
export interface InspectorSpec {
  label: string;
  /** Current state of whatever it inspects, read when the panel asks. */
  snapshot(): unknown;
}

export interface InspectorLogEntry {
  seq: number;
  at: number;
  type: string;
  data: Preview;
}

export interface InspectorInfo {
  id: string;
  label: string;
  snapshot: Preview;
  log: InspectorLogEntry[];
}

export interface InspectorHandle {
  /** Appends to this inspector's history (an action, a patch) and notifies connected clients. */
  log(type: string, data?: unknown): void;
  dispose(): void;
}

export type DevtoolsEvent =
  | { type: "tree" }
  | { type: "injectors" }
  | { type: "flush"; flush: FlushRecord }
  | { type: "hmr"; entry: HmrEntry }
  | { type: "router"; id: string; event: RouterNavigation }
  | { type: "inspector"; id: string };

export type EditResult = { ok: true } | { ok: false; error: string };

/**
 * A signal's current value as JSON text, when it is plain data: what an editor can show for editing, and what a Scenario or a
 * recorded state can hold. `text` is "undefined" for the value undefined, which `setSignal` accepts back.
 */
export type SignalJson = { ok: true; text: string; writable: boolean; kind: SignalKind } | { ok: false; error: string; writable: boolean; kind: SignalKind | null };

/** Every method of `hook.call`, with its params and result. */
export interface DevtoolsMethods {
  hello: { params: void; result: { version: 1; root: string | null; location: string } };
  tree: { params: void; result: TreeNode[] };
  component: { params: { id: string }; result: ComponentDetail | null };
  signal: { params: { id: string }; result: SignalInfo | null };
  /** Writes JSON text (or `undefined`) to a signal. */
  setSignal: { params: { id: string; text: string }; result: EditResult };
  /** The signal's value as JSON text when it is plain data (no Map, Date, class instance, function or cycle). Added after version 1; additive. */
  signalJson: { params: { id: string }; result: SignalJson };
  /** Outlines the component's host in the page; `id: null` clears it. */
  highlight: { params: { id: string | null }; result: boolean };
  openInEditor: { params: { id: string }; result: EditResult };
  injectors: { params: void; result: InjectorNode[] };
  injector: { params: { id: string }; result: InjectorDetail | null };
  routers: { params: void; result: RouterInfo[] };
  navigate: { params: { id: string; url: string }; result: EditResult };
  effectLog: { params: void; result: FlushRecord[] };
  clearEffectLog: { params: void; result: true };
  hmrLog: { params: void; result: HmrEntry[] };
  inspectors: { params: void; result: InspectorInfo[] };
}

export interface GableDevtoolsHook {
  readonly version: 1;
  /** Subscribes to pushed events. Effect timings are only measured while at least one client is connected. */
  connect(listener: (event: DevtoolsEvent) => void): () => void;
  call<M extends keyof DevtoolsMethods>(method: M, params: DevtoolsMethods[M]["params"]): DevtoolsMethods[M]["result"] | Promise<DevtoolsMethods[M]["result"]>;
  /** The host node of a component (`inspect(hook.element(id))` reveals it in the Elements panel). */
  element(id: string): unknown;
  /** The id of the nearest component whose host is `node` or an ancestor of it. */
  componentFor(node: unknown): string | null;
  /** The component that owns `instance` (what design tooling needs to name the owner of a template node). */
  componentOfInstance(instance: object): { id: string; name: string; source: SourceInfo | null } | null;
  /** Lets a package show its own state and history in the panel. */
  registerInspector(id: string, spec: InspectorSpec): InspectorHandle;
}

declare global {
  // eslint-disable-next-line no-var
  var __GABLE_DEVTOOLS_HOOK__: GableDevtoolsHook | undefined;
  // eslint-disable-next-line no-var
  var __GABLE_DEV_SERVER__: { root?: string } | undefined;
}

// --- previews ---------------------------------------------------------------

const MAX_STRING = 200;
const MAX_CHILDREN = 20;

const trunc = (s: string) => (s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s);

function nodeLabel(node: any): string {
  const tag = String(node.tagName ?? node.tag ?? node.nodeName ?? "node").toLowerCase();
  const id = node.id ? `#${node.id}` : "";
  const cls = typeof node.className === "string" && node.className ? `.${node.className.trim().split(/\s+/).join(".")}` : "";
  return `<${tag}${id}${cls}>`;
}

/** Turns any value into a JSON-safe, size-bounded preview. */
export function preview(value: unknown, depth = 2, seen: Set<unknown> = new Set()): Preview {
  switch (typeof value) {
    case "undefined":
      return { t: "undefined", s: "undefined" };
    case "boolean":
      return { t: "boolean", s: String(value) };
    case "number":
      return { t: "number", s: String(value) };
    case "bigint":
      return { t: "bigint", s: `${value}n` };
    case "string":
      return { t: "string", s: JSON.stringify(trunc(value)) };
    case "symbol":
      return value.description === "gable.unset" ? { t: "unset", s: "(not set)" } : { t: "symbol", s: value.toString() };
    case "function":
      return { t: "function", s: `ƒ ${value.name || "anonymous"}()` };
  }
  if (value === null) return { t: "null", s: "null" };
  const obj = value as any;
  if (seen.has(obj)) return { t: "object", s: "[Circular]" };
  try {
    if (typeof obj.nodeType === "number" || (typeof obj.tag === "string" && "children" in obj)) return { t: "element", s: nodeLabel(obj) };
    if (obj instanceof Date) return { t: "date", s: Number.isNaN(+obj) ? "Invalid Date" : obj.toISOString() };
    if (obj instanceof Error) return { t: "error", s: `${obj.name}: ${obj.message}` };
    seen.add(obj);
    try {
      let entries: Array<[string, unknown]>;
      let t = "object";
      let s: string;
      if (Array.isArray(obj)) {
        t = "array";
        s = `Array(${obj.length})`;
        entries = obj.slice(0, MAX_CHILDREN).map((v, i) => [String(i), v]);
      } else if (obj instanceof Map) {
        t = "map";
        s = `Map(${obj.size})`;
        entries = [...obj].slice(0, MAX_CHILDREN).map(([k, v]) => [typeof k === "string" ? k : preview(k, 0).s, v]);
      } else if (obj instanceof Set) {
        t = "set";
        s = `Set(${obj.size})`;
        entries = [...obj].slice(0, MAX_CHILDREN).map((v, i) => [String(i), v]);
      } else {
        const name = obj.constructor?.name;
        const keys = Object.keys(obj);
        s = `${name && name !== "Object" ? `${name} ` : ""}{${keys.length > 0 ? "…" : ""}}`;
        entries = keys.slice(0, MAX_CHILDREN).map((k) => [k, read(obj, k)]);
      }
      const total = Array.isArray(obj) ? obj.length : obj instanceof Map || obj instanceof Set ? obj.size : Object.keys(obj).length;
      const out: Preview = { t, s };
      if (depth > 0) {
        out.children = entries.map(([k, v]) => [k, preview(v, depth - 1, seen)]);
        if (total > entries.length) out.more = total - entries.length;
      }
      return out;
    } finally {
      seen.delete(obj);
    }
  } catch (error) {
    return { t: "thrown", s: `(unreadable: ${error instanceof Error ? error.message : String(error)})` };
  }
}

function read(obj: any, key: string): unknown {
  try {
    return obj[key];
  } catch (error) {
    return error;
  }
}

/** Parses what the panel sends for an edit: JSON, or the word `undefined`. */
export function parseEdit(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === "undefined") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const MAX_JSON = 256 * 1024;

/** JSON text of a value that is plain data (so it parses back to an equal value), or why it is not. */
export function jsonOf(value: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, text: "undefined" };
  const why = plainProblem(value, "the value", new Set());
  if (why) return { ok: false, error: why };
  const text = JSON.stringify(value);
  return text.length > MAX_JSON ? { ok: false, error: `The value is too large to edit as text (${Math.round(text.length / 1024)} KB).` } : { ok: true, text };
}

function plainProblem(value: unknown, path: string, seen: Set<unknown>): string | null {
  switch (typeof value) {
    case "string":
    case "boolean":
      return null;
    case "number":
      return Number.isFinite(value) ? null : `${path} is ${value}, which JSON cannot hold.`;
    case "undefined":
      return `${path} is undefined, which JSON leaves out.`;
    case "object":
      break;
    default:
      return `${path} is a ${typeof value}, not plain data.`;
  }
  if (value === null) return null;
  if (seen.has(value)) return `${path} refers back to itself.`;
  if (Array.isArray(value)) {
    seen.add(value);
    for (let i = 0; i < value.length; i++) {
      const why = i in value ? plainProblem(value[i], `${path}[${i}]`, seen) : `${path}[${i}] is a hole.`;
      if (why) return why;
    }
    seen.delete(value);
    return null;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return `${path} is a ${(value as object).constructor?.name || "class instance"}, not plain data.`;
  seen.add(value);
  for (const key of Object.keys(value as object)) {
    const why = plainProblem((value as Record<string, unknown>)[key], `${path}.${key}`, seen);
    if (why) return why;
  }
  seen.delete(value);
  return null;
}

// --- the layer --------------------------------------------------------------

interface Rec {
  node: object;
  kind: SignalKind;
  scope: Scope | null;
  /** The callable (signals, inputs, models); effects have none. */
  read?: Function;
  name?: string;
  id?: string;
  seq: number;
  runs: number;
  totalMs: number;
  lastMs: number;
}

interface Comp {
  id: string;
  Class: Function;
  instance: object;
  host: unknown;
  scope: Scope;
  injector: object | null;
  parent: Comp | null;
  children: Comp[];
}

interface Inj {
  id: string;
  injector: object;
  parent: Inj | null;
  entries: () => Array<{ token: unknown; value: unknown; resolved: boolean; provider?: unknown }>;
  scope: Scope;
}

interface Rtr {
  id: string;
  info: RouterDevInfo;
  events: RouterNavigation[];
  off: () => void;
}

interface Insp {
  id: string;
  spec: InspectorSpec;
  log: InspectorLogEntry[];
}

const MAX_FLUSHES = 200;
const MAX_RUNS_PER_FLUSH = 200;
const MAX_ROUTER_EVENTS = 100;
const MAX_INSPECTOR_LOG = 500;
const MAX_HMR = 50;

const className = (fn: unknown): string => (typeof fn === "function" ? fn.name || "anonymous" : String(fn));

function describeProvider(p: unknown): ProviderInfo | null {
  if (typeof p === "function") return { kind: "class", target: className(p) };
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if ("useClass" in o) return { kind: "class", target: className(o.useClass) };
  if ("useValue" in o) return { kind: "value", target: preview(o.useValue, 0).s };
  if ("useFactory" in o) return { kind: "factory", target: className(o.useFactory) };
  if ("useExisting" in o) return { kind: "existing", target: tokenName(o.useExisting) };
  return null;
}

function tokenName(token: unknown): string {
  if (typeof token === "function") return className(token);
  const text = String(token);
  return text === "[object Object]" ? "token" : text;
}

export interface DevtoolsInstance {
  hook: GableDevtoolsHook;
  sink: DevtoolsSink;
  /** Detaches the sink and removes the global (tests). */
  dispose(): void;
}

/** Creates the layer and fills the runtime's `devtools` slot. Prefer `installDevtools`; tests call this directly. */
export function createDevtools(target?: { __GABLE_DEVTOOLS_HOOK__?: GableDevtoolsHook }): DevtoolsInstance {
  const byFn = new WeakMap<Function, Rec>();
  const byNode = new WeakMap<object, Rec>();
  const byId = new Map<string, WeakRef<Rec>>();
  const effects = new Set<Rec>();
  const comps = new Set<Comp>();
  const compByScope = new WeakMap<Scope, Comp>();
  const compByHost = new WeakMap<object, Comp>();
  const compById = new Map<string, Comp>();
  const injs = new Set<Inj>();
  const injByObj = new WeakMap<object, Inj>();
  const injById = new Map<string, Inj>();
  const routers = new Set<Rtr>();
  const inspectors = new Map<string, Insp>();
  const sources = new WeakMap<Function, string>();
  const listeners = new Set<(event: DevtoolsEvent) => void>();
  const flushes: FlushRecord[] = [];
  const hmrLog: HmrEntry[] = [];
  let seq = 0;
  let batch: EffectRun[] = [];
  let batchMore = 0;
  let batchMs = 0;
  let initQueued = false;
  let treeQueued = false;
  let injQueued = false;
  let highlighted: HTMLElement | null = null;

  const emit = (event: DevtoolsEvent) => {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // a broken client never breaks the app
      }
    }
  };
  const emitTree = () => {
    if (treeQueued || listeners.size === 0) return;
    treeQueued = true;
    queueMicrotask(() => ((treeQueued = false), emit({ type: "tree" })));
  };
  const emitInjectors = () => {
    if (injQueued || listeners.size === 0) return;
    injQueued = true;
    queueMicrotask(() => ((injQueued = false), emit({ type: "injectors" })));
  };

  const idOf = (rec: Rec): string => {
    if (!rec.id) {
      rec.id = `${rec.kind === "effect" ? "e" : "s"}${rec.seq}`;
      byId.set(rec.id, new WeakRef(rec));
    }
    return rec.id;
  };

  function ownerOf(scope: Scope | null): Comp | null {
    for (let s = scope; s; s = s.parent) {
      const c = compByScope.get(s);
      if (c) return c;
    }
    return null;
  }

  const recName = (rec: Rec): string => rec.name ?? (rec.kind === "effect" ? `effect #${rec.seq}` : `${rec.kind} #${rec.seq}`);

  function edge(node: object): Edge | null {
    const rec = byNode.get(node);
    return rec ? { id: idOf(rec), name: recName(rec), kind: rec.kind } : null;
  }

  function edgesOf(nodes: object[]): Edge[] {
    const out: Edge[] = [];
    for (const n of nodes) {
      const e = edge(n);
      if (e) out.push(e);
    }
    return out;
  }

  function valueOf(rec: Rec): Preview {
    try {
      return preview(peekNode(rec.node));
    } catch (error) {
      return { t: "thrown", s: `threw: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  function signalInfo(rec: Rec): SignalInfo {
    const { sources: src, sinks, state } = inspectNode(rec.node);
    const owner = ownerOf(rec.scope);
    return {
      id: idOf(rec),
      name: recName(rec),
      kind: rec.kind,
      value: valueOf(rec),
      writable: state,
      sources: edgesOf(src),
      sinks: edgesOf(sinks),
      owner: owner ? { id: owner.id, name: className(owner.Class) } : null,
    };
  }

  /** The signals held in the fields of an instance, named after their fields (also names them for edges). */
  function scan(instance: object): Rec[] {
    const out: Rec[] = [];
    for (const [key, value] of Object.entries(instance)) {
      if (typeof value !== "function") continue;
      const rec = byFn.get(value);
      if (!rec) continue;
      rec.name ??= key;
      out.push(rec);
    }
    return out;
  }

  const outputsOf = (instance: object): string[] =>
    Object.entries(instance)
      .filter(([, v]) => v && typeof v === "object" && typeof (v as any).emit === "function" && typeof (v as any).subscribe === "function")
      .map(([k]) => k);

  const hostTag = (host: unknown): string => {
    const h = host as any;
    return h && typeof h === "object" ? String(h.tagName ?? h.tag ?? h.nodeName ?? "node").toLowerCase() : "node";
  };

  const hostLabel = (host: unknown): string => {
    const h = host as any;
    if (!h || typeof h.getAttribute !== "function") return "";
    const text = String(h.getAttribute("aria-label") ?? h.getAttribute("id") ?? h.textContent ?? "").replace(/s+/g, " ").trim();
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  };

  const selectorOf = (Class: Function): string => String((Class as any).meta?.selector ?? "");

  function treeNode(c: Comp): TreeNode {
    const inj = c.injector ? injByObj.get(c.injector) : undefined;
    return { id: c.id, parent: c.parent?.id ?? null, name: className(c.Class), selector: selectorOf(c.Class), host: hostTag(c.host), injector: inj?.id ?? null, label: hostLabel(c.host) };
  }

  function sourceOf(Class: Function): SourceInfo | null {
    const url = sources.get(Class);
    if (!url) return null;
    let path = url;
    try {
      path = decodeURIComponent(new URL(url).pathname);
    } catch {
      // already a path
    }
    const root = globalThis.__GABLE_DEV_SERVER__?.root;
    const file = path.startsWith("/@fs/") ? path.slice(4) : root ? `${root.replace(/\/$/, "")}${path}` : null;
    return { path, file };
  }

  function effectInfo(rec: Rec): EffectInfo {
    return { id: idOf(rec), label: recName(rec), runs: rec.runs, totalMs: round(rec.totalMs), lastMs: round(rec.lastMs), sources: edgesOf(inspectNode(rec.node).sources) };
  }

  function componentDetail(c: Comp): ComponentDetail {
    const recs = scan(c.instance);
    const infos = recs.map(signalInfo);
    return {
      ...treeNode(c),
      source: sourceOf(c.Class),
      inputs: infos.filter((i) => i.kind === "input" || i.kind === "model"),
      outputs: outputsOf(c.instance),
      signals: infos.filter((i) => i.kind !== "input" && i.kind !== "model"),
      effects: [...effects].filter((e) => ownerOf(e.scope) === c).map(effectInfo),
    };
  }

  function injNode(i: Inj): InjectorNode {
    const comp = [...comps].find((c) => c.injector === i.injector);
    return { id: i.id, parent: i.parent?.id ?? null, component: comp ? { id: comp.id, name: className(comp.Class) } : null, entryCount: i.entries().length };
  }

  function injDetail(i: Inj): InjectorDetail {
    return {
      ...injNode(i),
      entries: i.entries().map((e) => ({
        name: tokenName(e.token),
        kind: typeof e.token === "function" ? "class" : "token",
        provider: describeProvider(e.provider),
        resolved: e.resolved,
        value: e.resolved ? preview(e.value, 1) : { t: "undefined", s: "(not created yet)" },
        signals: e.resolved && e.value && typeof e.value === "object" ? scan(e.value as object).map(signalInfo) : [],
      })),
    };
  }

  function routeNode(route: any, active: Set<unknown>): RouteNode {
    const component = route.component;
    const guards = [...(route.canActivate ?? []), ...(route.canDeactivate ?? []), ...(route.canMatch ?? [])].map((g: unknown) => className(g));
    const out: RouteNode = {
      path: String(route.path),
      component: component ? (component.kind === "lazy" ? `lazy(${component.name ?? ""})` : className(component)) : null,
      guards,
      children: Array.isArray(route.children) ? route.children.map((r: unknown) => routeNode(r, active)) : route.children ? "lazy" : null,
      active: active.has(route),
    };
    if (route.redirectTo !== undefined) out.redirectTo = String(route.redirectTo);
    if (route.title !== undefined) out.title = String(route.title);
    return out;
  }

  function routerInfo(r: Rtr): RouterInfo {
    const s = r.info.state();
    const active = new Set(r.info.active());
    return {
      id: r.id,
      url: s.url,
      navigating: s.navigating,
      params: preview(s.params),
      queryParams: preview(s.queryParams),
      fragment: preview(s.fragment),
      data: preview(s.data),
      routes: r.info.routes().map((route) => routeNode(route, active)),
      events: [...r.events],
    };
  }

  function pushFlush(record: Omit<FlushRecord, "seq">) {
    const flush: FlushRecord = { seq: ++seq, ...record };
    flushes.push(flush);
    if (flushes.length > MAX_FLUSHES) flushes.shift();
    emit({ type: "flush", flush });
  }

  function highlight(id: string | null): boolean {
    if (highlighted) {
      highlighted.remove();
      highlighted = null;
    }
    if (id === null) return true;
    const host = compById.get(id)?.host as any;
    if (typeof document === "undefined" || !host || typeof host.getBoundingClientRect !== "function") return false;
    const box = host.getBoundingClientRect();
    const el = document.createElement("div");
    el.setAttribute("data-gable-devtools", "highlight");
    Object.assign(el.style, {
      position: "fixed",
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      background: "rgba(66, 133, 244, 0.25)",
      outline: "1px solid rgb(66, 133, 244)",
      pointerEvents: "none",
      zIndex: "2147483647",
    });
    const label = document.createElement("span");
    label.textContent = `${className(compById.get(id)!.Class)}  ${Math.round(box.width)} × ${Math.round(box.height)}`;
    Object.assign(label.style, {
      position: "absolute",
      left: "0",
      top: box.top > 20 ? "-18px" : "0",
      font: "11px/16px ui-monospace, monospace",
      background: "rgb(66, 133, 244)",
      color: "#fff",
      padding: "0 4px",
      whiteSpace: "nowrap",
    });
    el.appendChild(label);
    document.documentElement.appendChild(el);
    highlighted = el;
    return true;
  }

  function lookup(id: string): Rec | null {
    const rec = byId.get(id)?.deref();
    if (rec) return rec;
    byId.delete(id);
    return null;
  }

  const sink: DevtoolsSink = {
    get timing() {
      return listeners.size > 0;
    },
    signal(read, node, kind, scope) {
      const rec: Rec = { node, kind, scope, read, seq: ++seq, runs: 0, totalMs: 0, lastMs: 0 };
      byFn.set(read, rec);
      byNode.set(node, rec);
    },
    alias(read, of, kind) {
      const rec = byFn.get(of);
      if (!rec) return;
      rec.kind = kind;
      rec.read = read;
      byFn.set(read, rec);
    },
    effect(node, scope) {
      const rec: Rec = { node, kind: "effect", scope, seq: ++seq, runs: 0, totalMs: 0, lastMs: 0 };
      byNode.set(node, rec);
      effects.add(rec);
      scope.onDispose(() => effects.delete(rec));
    },
    effectRun(node, ms, first) {
      const rec = byNode.get(node);
      if (!rec) return;
      rec.runs++;
      rec.totalMs += ms;
      rec.lastMs = ms;
      batchMs += ms;
      if (batch.length < MAX_RUNS_PER_FLUSH) {
        const owner = ownerOf(rec.scope);
        batch.push({ id: idOf(rec), label: recName(rec), component: owner ? className(owner.Class) : null, ms: round(ms), first });
      } else batchMore++;
      if (first && !initQueued) {
        initQueued = true;
        // First runs inside a flush belong to it; the rest (setup outside a flush) are closed on the next microtask.
        queueMicrotask(() => {
          initQueued = false;
          if (batch.length === 0 && batchMore === 0) return;
          pushFlush({ kind: "init", at: performance.now() - batchMs, ms: round(batchMs), rounds: 0, runs: batch, more: batchMore });
          batch = [];
          batchMore = 0;
          batchMs = 0;
        });
      }
    },
    flushed(startedAt, _ran, rounds) {
      const runs = batch.filter((r) => !r.first);
      const firsts = batch.filter((r) => r.first);
      // Effects that ran their first time during this flush are part of it.
      batch = [];
      const more = batchMore;
      batchMore = 0;
      batchMs = 0;
      if (runs.length === 0 && firsts.length === 0 && more === 0) return;
      pushFlush({ kind: "flush", at: startedAt, ms: round(performance.now() - startedAt), rounds, runs: [...runs, ...firsts], more });
    },
    component({ Class, instance, host, scope, injector }) {
      const parent = ownerOf(scope.parent);
      const comp: Comp = { id: `c${++seq}`, Class, instance, host, scope, injector, parent, children: [] };
      comps.add(comp);
      compById.set(comp.id, comp);
      compByScope.set(scope, comp);
      if (host && typeof host === "object") compByHost.set(host, comp);
      parent?.children.push(comp);
      scan(instance); // names the signals for the edges other signals show
      scope.onDispose(() => {
        comps.delete(comp);
        compById.delete(comp.id);
        if (parent) parent.children = parent.children.filter((c) => c !== comp);
        if (host && typeof host === "object" && compByHost.get(host) === comp) compByHost.delete(host);
        emitTree();
      });
      emitTree();
    },
    injector(injector, parent, entries, scope) {
      const inj: Inj = { id: `i${++seq}`, injector, parent: parent ? (injByObj.get(parent) ?? null) : null, entries, scope };
      injs.add(inj);
      injByObj.set(injector, inj);
      injById.set(inj.id, inj);
      scope.onDispose(() => {
        injs.delete(inj);
        injById.delete(inj.id);
        emitInjectors();
      });
      emitInjectors();
    },
    router(info) {
      const rtr: Rtr = { id: `r${++seq}`, info, events: [], off: () => {} };
      rtr.off = info.events((raw) => {
        const e = raw as { type: string; id: number; url: string; reason?: string; error?: unknown };
        const detail = e.reason ?? (e.error !== undefined ? (e.error instanceof Error ? e.error.message : String(e.error)) : undefined);
        const event: RouterNavigation = { seq: ++seq, at: performance.now(), type: e.type, id: e.id, url: e.url, ...(detail !== undefined ? { detail } : {}) };
        rtr.events.push(event);
        if (rtr.events.length > MAX_ROUTER_EVENTS) rtr.events.shift();
        emit({ type: "router", id: rtr.id, event });
      });
      routers.add(rtr);
      info.scope?.onDispose(() => {
        rtr.off();
        routers.delete(rtr);
      });
    },
    hmr({ status, errors, modules, changes }) {
      const entry: HmrEntry = { seq: ++seq, at: performance.now(), status, modules, changes: (changes ?? []).filter((c) => c.kind !== "none"), errors: errors.map((e) => (e instanceof Error ? e.message : String(e))) };
      hmrLog.push(entry);
      if (hmrLog.length > MAX_HMR) hmrLog.shift();
      emit({ type: "hmr", entry });
    },
    source(Class, url) {
      sources.set(Class, url);
    },
  };

  const methods: { [M in keyof DevtoolsMethods]: (params: DevtoolsMethods[M]["params"]) => DevtoolsMethods[M]["result"] | Promise<DevtoolsMethods[M]["result"]> } = {
    hello: () => ({ version: 1, root: globalThis.__GABLE_DEV_SERVER__?.root ?? null, location: String((globalThis as any).location?.href ?? "") }),
    tree: () => {
      const out: TreeNode[] = [];
      const walk = (c: Comp) => (out.push(treeNode(c)), c.children.forEach(walk));
      for (const c of comps) if (!c.parent) walk(c);
      return out;
    },
    component: ({ id }) => {
      const c = compById.get(id);
      return c ? componentDetail(c) : null;
    },
    signal: ({ id }) => {
      const rec = lookup(id);
      return rec && rec.kind !== "effect" ? signalInfo(rec) : null;
    },
    setSignal: ({ id, text }) => {
      const rec = lookup(id);
      if (!rec || rec.kind === "effect") return { ok: false, error: "No such signal." };
      if (!inspectNode(rec.node).state) return { ok: false, error: "A computed cannot be written." };
      const parsed = parseEdit(text);
      if (!parsed.ok) return parsed;
      try {
        // A model's own setter also notifies its parent binding; everything else writes the state directly.
        if (rec.kind === "model" && rec.read) (rec.read as unknown as { set(v: unknown): void }).set(parsed.value);
        else pokeNode(rec.node, parsed.value);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    signalJson: ({ id }) => {
      const rec = lookup(id);
      if (!rec || rec.kind === "effect") return { ok: false, error: "No such signal.", writable: false, kind: null };
      const writable = inspectNode(rec.node).state;
      let value: unknown;
      try {
        value = peekNode(rec.node);
      } catch (error) {
        return { ok: false, error: `Reading it threw: ${error instanceof Error ? error.message : String(error)}`, writable, kind: rec.kind };
      }
      const json = jsonOf(value);
      return json.ok ? { ok: true, text: json.text, writable, kind: rec.kind } : { ...json, writable, kind: rec.kind };
    },
    highlight: ({ id }) => highlight(id),
    openInEditor: async ({ id }) => {
      const c = compById.get(id);
      const source = c ? sourceOf(c.Class) : null;
      if (!source) return { ok: false, error: "No source known for this component (the Gable Vite plugin registers it in dev)." };
      if (!source.file) return { ok: false, error: "The dev server root is unknown (use the gable() Vite plugin)." };
      try {
        const response = await fetch(`/__open-in-editor?file=${encodeURIComponent(source.file)}`);
        return response.ok ? { ok: true } : { ok: false, error: `The dev server answered ${response.status}.` };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    injectors: () => [...injs].map(injNode),
    injector: ({ id }) => {
      const i = injById.get(id);
      return i ? injDetail(i) : null;
    },
    routers: () => [...routers].map(routerInfo),
    navigate: async ({ id, url }) => {
      const r = [...routers].find((x) => x.id === id);
      if (!r) return { ok: false, error: "No such router." };
      await r.info.navigate(url);
      return { ok: true };
    },
    effectLog: () => [...flushes],
    clearEffectLog: () => ((flushes.length = 0), true),
    hmrLog: () => [...hmrLog],
    inspectors: () =>
      [...inspectors.values()].map((i) => {
        let snapshot: Preview;
        try {
          snapshot = preview(i.spec.snapshot(), 4);
        } catch (error) {
          snapshot = { t: "thrown", s: `threw: ${error instanceof Error ? error.message : String(error)}` };
        }
        return { id: i.id, label: i.spec.label, snapshot, log: [...i.log] };
      }),
  };

  const hook: GableDevtoolsHook = {
    version: 1,
    connect(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    call(method, params) {
      const fn = methods[method] as ((p: unknown) => unknown) | undefined;
      if (!fn) throw new Error(`Unknown devtools method "${String(method)}".`);
      return fn(params) as any;
    },
    element: (id) => compById.get(id)?.host ?? null,
    componentFor(node) {
      for (let n = node as any; n && typeof n === "object"; n = n.parentNode ?? n.parent) {
        const c = compByHost.get(n);
        if (c) return c.id;
      }
      return null;
    },
    componentOfInstance(instance) {
      for (const c of comps) if (c.instance === instance) return { id: c.id, name: className(c.Class), source: sourceOf(c.Class) };
      return null;
    },
    registerInspector(id, spec) {
      const insp: Insp = { id, spec, log: [] };
      inspectors.set(id, insp);
      emit({ type: "inspector", id });
      return {
        log(type, data) {
          insp.log.push({ seq: ++seq, at: performance.now(), type, data: preview(data, 3) });
          if (insp.log.length > MAX_INSPECTOR_LOG) insp.log.shift();
          emit({ type: "inspector", id });
        },
        dispose() {
          if (inspectors.get(id) === insp) inspectors.delete(id);
          emit({ type: "inspector", id });
        },
      };
    },
  };

  devtools.current = sink;
  if (target) target.__GABLE_DEVTOOLS_HOOK__ = hook;
  return {
    hook,
    sink,
    dispose() {
      if (devtools.current === sink) devtools.current = null;
      if (target?.__GABLE_DEVTOOLS_HOOK__ === hook) delete target.__GABLE_DEVTOOLS_HOOK__;
      highlight(null);
      listeners.clear();
    },
  };
}

const round = (ms: number) => Math.round(ms * 1000) / 1000;

/** Installs the layer as `globalThis.__GABLE_DEVTOOLS_HOOK__` once and announces it to a waiting client. */
export function installDevtools(): GableDevtoolsHook {
  const existing = globalThis.__GABLE_DEVTOOLS_HOOK__;
  if (existing) return existing;
  const { hook } = createDevtools(globalThis);
  try {
    globalThis.dispatchEvent?.(new Event("gable:devtools-ready"));
  } catch {
    // not an event target
  }
  return hook;
}
