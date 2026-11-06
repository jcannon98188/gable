// The HMR runtime (`@gable/core/hmr`). Dev only: importing it installs the core's dev hooks, so an app that
// never imports it (every production build) carries none of this. No semver promise.
import { hooks, type ComponentBegin, type DevHooks, type InjectorOps, type Region, type RouterOps, type ServiceBegin, type Swap } from "./dev-hooks.js";
import { registerComponentStyles } from "./component.js";
import { reportError } from "./errors.js";
import type { Scope } from "./scope.js";
import type { Renderer } from "./renderer.js";
import { signal, untracked, type WritableSignal } from "./signals.js";
import { describe, ownMembers, type Definition } from "./hmr-source.js";
import { transferState } from "./hmr-transfer.js";

type Cls = Function & Record<string, any>;
export type HmrMode = "reset" | "reload" | "ignore";

/** One re-evaluated module: its URL and namespace (export name to value). */
export interface ModuleUpdate {
  url: string;
  exports: Record<string, unknown>;
}

export interface HotResult {
  /**
   * `applied`: the app now runs the new code. `unchanged`: nothing needed to change.
   * `rolled-back`: the update failed and the app is exactly as it was (the error went to the ErrorHandler).
   * `reload`: the app must be reloaded (a class asked for it, or the app could not be kept consistent).
   */
  status: "applied" | "unchanged" | "rolled-back" | "reload";
  errors: unknown[];
}

// --- registry --------------------------------------------------------------

interface Meta {
  selector?: unknown;
  template?: { strings: ArrayLike<string> };
  imports?: readonly unknown[];
  providers?: readonly unknown[];
  host?: unknown;
  styles?: unknown;
  encapsulation?: unknown;
  id?: unknown;
}

/** The first-defined class (canonical) of an id, and the latest definition whose members it carries. */
interface Entry {
  id: string;
  canonical: Cls;
  latest: Cls;
  def: Definition;
  meta: Meta | undefined;
}

const entries = new Map<string, Entry>();
const entryOf = new WeakMap<Function, Entry>();

const isClass = (value: unknown): value is Cls => typeof value === "function" && /^class[\s{]/.test(Function.prototype.toString.call(value));
const moduleId = (url: string) => url.replace(/[?#].*$/, "");

function canon<T>(value: T): T {
  return (typeof value === "function" ? (entryOf.get(value)?.canonical ?? value) : value) as T;
}

function canonProvider(p: unknown): unknown {
  if (typeof p === "function") return canon(p);
  if (!p || typeof p !== "object") return p;
  const out: Record<string, unknown> = { ...p };
  for (const key of ["provide", "useClass", "useExisting"]) if (key in out) out[key] = canon(out[key]);
  return out;
}

function canonMeta(meta: Meta | undefined): Meta | undefined {
  if (!meta) return meta;
  const out: Meta = { ...meta };
  if (meta.imports) out.imports = meta.imports.map(canon);
  if (meta.providers) out.providers = meta.providers.map(canonProvider);
  return out;
}

/** Instrumented wrapper to the function it wraps. */
const instrumented = new WeakMap<Function, Function>();
const unwrap = (fn: Function): Function => instrumented.get(fn) ?? fn;
/** Per canonical class: bumped when an edit changes its methods; every call of a method reads it, so callers re-run. */
const versions = new WeakMap<Function, WritableSignal<number>>();

/**
 * Wraps the canonical prototype's methods and getters so each call reads the class's version signal. A computed
 * or binding that called a method then depends on the class's edits, and a method-only hot patch (which changes
 * no signal the caller read) still re-runs it.
 */
function instrument(C: Cls): WritableSignal<number> {
  let version = versions.get(C);
  if (version) return version;
  version = signal(0);
  versions.set(C, version);
  const read = version;
  const proto = C.prototype;
  const track = <F extends Function>(fn: F): F => {
    if (instrumented.has(fn) || /^class[s{]/.test(Function.prototype.toString.call(fn))) return fn;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      read();
      return fn.apply(this, args);
    } as unknown as F;
    Object.defineProperty(wrapped, "name", { value: fn.name, configurable: true });
    Object.defineProperty(wrapped, "length", { value: fn.length, configurable: true });
    instrumented.set(wrapped, fn);
    return wrapped;
  };
  for (const key of Reflect.ownKeys(proto)) {
    if (key === "constructor") continue;
    const d = Object.getOwnPropertyDescriptor(proto, key)!;
    if (!d.configurable) continue;
    if (typeof d.value === "function") Object.defineProperty(proto, key, { ...d, value: track(d.value) });
    else if (d.get) Object.defineProperty(proto, key, { ...d, get: track(d.get) });
  }
  return version;
}

function register(entryId: string, Class: Cls): Entry {
  const entry: Entry = { id: entryId, canonical: Class, latest: Class, def: describe(Class, unwrap), meta: canonMeta(Class.meta) };
  instrument(Class);
  entries.set(entryId, entry);
  entryOf.set(Class, entry);
  return entry;
}

// --- route configs ---------------------------------------------------------

/** A route config is an exported array of objects that each have a string `path`. */
const isRouteConfig = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0 && value.every((r) => r && typeof r === "object" && typeof (r as { path?: unknown }).path === "string");
/** The config currently live for an exported route array, by export id. */
const routeConfigs = new Map<string, unknown[]>();
const routers = new Set<RouterOps>();

/** Registers every class a module exports (call at first evaluation). A class already registered under its id is left alone. */
export function registerModule(url: string, namespace: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(namespace)) {
    if (isRouteConfig(value) && !routeConfigs.has(`${moduleId(url)}#${name}`)) routeConfigs.set(`${moduleId(url)}#${name}`, value);
    if (isClass(value) && !entries.has(`${moduleId(url)}#${name}`)) register(`${moduleId(url)}#${name}`, value);
  }
}

/**
 * Registers the live classes that a module's exports replace, matching by name, for modules whose first
 * evaluation was not registered. Restricted to what lives under `roots` (scopes or injectors) when given.
 */
export function adopt(url: string, namespace: Record<string, unknown>, roots?: object[]): void {
  const scopes = roots?.map((r) => ((r as { scope?: Scope }).scope ?? r) as Scope);
  for (const [name, value] of Object.entries(namespace)) {
    const entryId = `${moduleId(url)}#${name}`;
    if (!isClass(value) || entries.has(entryId)) continue;
    const live = [...records].filter((r) => r.Class.name === name && !entryOf.has(r.Class) && (!scopes || scopes.some((s) => within(r.scope, s))));
    const classes = new Set(live.map((r) => r.Class));
    if (classes.size === 1 || (scopes && classes.size > 1)) register(entryId, [...classes][0]!);
  }
}

// --- live instances --------------------------------------------------------

interface Rec {
  kind: "component" | "service";
  seq: number;
  Class: Cls;
  instance: object;
  scope: Scope;
  /** Service instances this one injected while it was set up. */
  deps: Set<object>;
  // component
  renderer?: Renderer<any>;
  injector?: object | null;
  buildView?: () => Swap;
  // service
  token?: unknown;
  owner?: object;
}

const records = new Set<Rec>();
const byInstance = new WeakMap<object, Rec>();
const injectors = new WeakMap<object, InjectorOps>();
const regions = new WeakMap<Scope, Region>();
const frames: Array<Set<object>> = [];
let seq = 0;
let building = 0;

function within(scope: Scope | null, ancestor: Scope): boolean {
  for (let s = scope; s; s = s.parent) if (s === ancestor) return true;
  return false;
}

const isService = (value: object) => byInstance.get(value)?.kind === "service";

/** The state-transfer pairing for one rebuild: old component instances waiting to hand their state to their replacements. */
interface Session {
  queues: Map<Function, Rec[]>;
  injectorPairs: Map<object, object>;
  noTransfer: Set<Function>;
}
let session: Session | null = null;

function construct(Class: Cls, take: (deps: Set<object>) => void): object {
  const target = canon(Class);
  const deps = new Set<object>();
  frames.push(deps);
  try {
    return Reflect.construct(entryOf.get(target)?.latest ?? target, [], target);
  } finally {
    frames.pop();
    take(deps);
  }
}

const impl: DevHooks = {
  canon,
  strict: () => building > 0,
  region: (scope, region) => void regions.set(scope, region),
  router(ops) {
    routers.add(ops);
    ops.scope?.onDispose(() => routers.delete(ops));
  },
  injectorCreated: (injector, ops) => void injectors.set(injector, ops),
  injected(value) {
    if (value && typeof value === "object") frames.at(-1)?.add(value);
  },
  component(Class, own): ComponentBegin {
    const C = canon(Class) as Cls;
    instrument(C);
    let deps = new Set<object>();
    const old = session?.queues.get(C)?.shift();
    if (session && old && own && old.injector) {
      session.injectorPairs.set(own, old.injector);
      // Services the old component's injector had resolved are re-created now so their state carries over.
      for (const [token] of injectors.get(old.injector)?.entries() ?? []) {
        if (byInstance.has(injectors.get(old.injector)!.value(token) as object)) (own as { get(t: unknown): unknown }).get(token);
      }
    }
    return {
      construct: () => construct(C, (d) => (deps = d)),
      done(info) {
        const rec: Rec = {
          kind: "component",
          seq: seq++,
          Class: C,
          instance: info.instance,
          scope: info.scope,
          deps,
          renderer: info.renderer,
          injector: info.injector,
          buildView: info.buildView,
        };
        records.add(rec);
        byInstance.set(info.instance, rec);
        info.scope.onDispose(() => records.delete(rec));
        if (old && !session!.noTransfer.has(C)) transferState(old.instance, info.instance, isService);
      },
    };
  },
  service(Class, injector): ServiceBegin {
    const C = canon(Class) as Cls;
    instrument(C);
    let deps = new Set<object>();
    return {
      construct: () => construct(C, (d) => (deps = d)),
      done(info) {
        const rec: Rec = { kind: "service", seq: seq++, Class: C, instance: info.instance, scope: info.scope, deps, owner: injector };
        records.add(rec);
        byInstance.set(info.instance, rec);
        info.scope.onDispose(() => records.delete(rec));
      },
    };
  },
  resolved(token, value, injector) {
    const rec = value && typeof value === "object" ? byInstance.get(value) : undefined;
    if (!rec || rec.kind !== "service" || rec.token !== undefined) return;
    rec.token = token;
    const oldInjector = session?.injectorPairs.get(injector);
    const oldValue = oldInjector && injectors.get(oldInjector)?.value(token);
    if (oldValue && typeof oldValue === "object" && byInstance.has(oldValue) && !session!.noTransfer.has(rec.Class)) transferState(oldValue, value as object, isService);
  },
};

hooks.current = impl;

// --- classifying an edit ---------------------------------------------------

type Kind = "none" | "patch" | "view" | "resetup";

const templateText = (m: Meta | undefined) => (m?.template ? Array.prototype.join.call(m.template.strings, "\u0000") : "");
const sameList = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) => (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((x, i) => sameValue(x, b![i]));
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => Object.is((a as any)[k], (b as any)[k]));
  }
  return false;
}
const styleText = (m: Meta | undefined) => (Array.isArray(m?.styles) ? m!.styles.join("\n") : String(m?.styles ?? ""));

function classify(entry: Entry, next: Definition, nextMeta: Meta | undefined): Kind {
  const prev = entry.def;
  const a = entry.meta;
  const b = nextMeta;
  if (prev.setup !== next.setup) return "resetup";
  if (a?.selector !== b?.selector || a?.encapsulation !== b?.encapsulation || a?.id !== b?.id || JSON.stringify(a?.host ?? null) !== JSON.stringify(b?.host ?? null) || !sameList(a?.providers, b?.providers)) return "resetup";
  const membersChanged = prev.members !== next.members;
  if (membersChanged && (prev.hasPrivate || next.hasPrivate)) return "resetup";
  if (templateText(a) !== templateText(b) || !sameList(a?.imports, b?.imports)) return "view";
  return membersChanged || styleText(a) !== styleText(b) ? "patch" : "none";
}

// --- canonical-class patching ----------------------------------------------

/** Copies `next`'s members onto the canonical class in place. Returns the undo. */
function patch(entry: Entry, next: Cls, def: Definition, meta: Meta | undefined): () => void {
  const C = entry.canonical;
  const undo: Array<() => void> = [];
  const before = { latest: entry.latest, def: entry.def, meta: entry.meta };
  const apply = (target: object, keys: Set<PropertyKey>, from: object, override?: (k: PropertyKey) => PropertyDescriptor | undefined) => {
    for (const key of keys) {
      const saved = Object.getOwnPropertyDescriptor(target, key);
      const fresh = override?.(key) ?? Object.getOwnPropertyDescriptor(from, key);
      if (fresh) Object.defineProperty(target, key, fresh);
      else delete (target as any)[key];
      undo.push(() => (saved ? void Object.defineProperty(target, key, saved) : void delete (target as any)[key]));
    }
  };
  const keys = (cls: Function, statics: boolean) =>
    ownMembers(cls)
      .filter(([, , s]) => s === statics)
      .map(([k]) => k);
  const protoKeys = new Set([...keys(entry.latest, false), ...keys(next, false)]);
  const staticKeys = new Set([...keys(entry.latest, true), ...keys(next, true)]);
  // Statics that are not methods are on the class too: ownMembers lists every own key.
  apply(C.prototype, protoKeys, next.prototype);
  apply(C, staticKeys, next, (k) => (k === "meta" && meta ? { ...Object.getOwnPropertyDescriptor(next, "meta")!, value: meta } : undefined));
  const methodsChanged = before.def.members !== def.members;
  entry.latest = next;
  entry.def = def;
  entry.meta = meta;
  const version = instrument(C);
  if (methodsChanged) version.set(version() + 1);
  return () => {
    for (const fn of undo.reverse()) fn();
    Object.assign(entry, before);
  };
}

// --- the transaction -------------------------------------------------------

interface Staged {
  entry: Entry;
  next: Cls;
  def: Definition;
  meta: Meta | undefined;
  kind: Kind;
  mode: HmrMode | undefined;
}

interface ConfigUpdate {
  id: string;
  next: unknown[];
  routers: RouterOps[];
}

/** Which live routers run the config an updated module re-exports. With no earlier registration, a lone router under `roots` is adopted. */
function routeUpdates(updates: ModuleUpdate[], roots?: object[]): ConfigUpdate[] {
  const scopes = roots?.map((r) => ((r as { scope?: Scope }).scope ?? r) as Scope);
  const out: ConfigUpdate[] = [];
  for (const u of updates) {
    for (const [name, next] of Object.entries(u.exports)) {
      if (!isRouteConfig(next)) continue;
      const id = `${moduleId(u.url)}#${name}`;
      const live = [...routers].filter((r) => !scopes || (r.scope && scopes.some((s) => within(r.scope, s))));
      const current = routeConfigs.get(id);
      let targets = current ? live.filter((r) => r.routes() === current) : live.length === 1 ? live : [];
      if (!current && targets.length === 1) routeConfigs.set(id, targets[0]!.routes() as unknown[]);
      targets = targets.filter((r) => r.routes() !== next);
      if (targets.length > 0) out.push({ id, next, routers: targets });
    }
  }
  return out;
}

/** Hands each edited config to its routers, which re-match it against their URL (asynchronously; a mismatch is reported and the old config kept). */
function applyRoutes(configs: ConfigUpdate[]): void {
  for (const { id, next, routers: targets } of configs) {
    void Promise.all(targets.map((r) => r.replaceRoutes(next))).then((adopted) => {
      if (adopted.every(Boolean)) routeConfigs.set(id, next);
    });
  }
}

const MODES = new Set(["reset", "reload", "ignore"]);

/** The rec nearest the root: where failures that belong to no instance are reported. */
function reporter(roots?: object[]): Scope | null {
  const scopes = roots?.map((r) => ((r as { scope?: Scope }).scope ?? r) as Scope);
  let best: Rec | undefined;
  for (const r of records) if ((!scopes || scopes.some((s) => within(r.scope, s))) && (!best || r.scope.depth < best.scope.depth)) best = r;
  return best?.scope ?? null;
}

function findRegion(scope: Scope): { scope: Scope; region: Region } | undefined {
  for (let s: Scope | null = scope; s; s = s.parent) {
    const region = regions.get(s);
    if (region) return { scope: s, region };
  }
  return undefined;
}

function withSession<T>(old: Rec[], pairs: Set<Function>, fn: () => T): T {
  const queues = new Map<Function, Rec[]>();
  for (const r of old.filter((r) => r.kind === "component").sort((a, b) => a.seq - b.seq)) queues.set(r.Class, [...(queues.get(r.Class) ?? []), r]);
  session = { queues, injectorPairs: new Map(), noTransfer: pairs };
  try {
    return fn();
  } finally {
    session = null;
  }
}

/**
 * Applies a batch of re-evaluated modules as one atomic transaction: stage and classify, patch the canonical
 * classes, re-set-up what changed (services, then the components that need it, parents before children) on new
 * instances beside the old ones, and only then retire the old. Any failure undoes everything.
 */
export function applyUpdate(updates: ModuleUpdate[], failures: unknown[] = [], roots?: object[]): HotResult {
  return untracked(() => {
    if (failures.length > 0) {
      for (const error of failures) reportError(error, "hmr", reporter(roots), "module failed to evaluate");
      return { status: "rolled-back", errors: failures };
    }
    for (const u of updates) adopt(u.url, u.exports, roots);

    const staged: Staged[] = [];
    for (const u of updates) {
      const moduleMode = u.exports.hmr;
      for (const [name, value] of Object.entries(u.exports)) {
        const entry = entries.get(`${moduleId(u.url)}#${name}`);
        if (!entry || !isClass(value) || value === entry.latest) continue;
        const own = value.hmr;
        const mode = ([own, moduleMode].find((m) => MODES.has(m as string)) as HmrMode | undefined) ?? undefined;
        if (mode === "ignore") continue;
        staged.push({ entry, next: value, def: describe(value), meta: undefined, kind: "none", mode });
      }
    }
    // Aliases first: a class from this batch must resolve to its canonical class wherever it is referenced.
    for (const s of staged) entryOf.set(s.next, s.entry);
    for (const s of staged) {
      s.meta = canonMeta(s.next.meta);
      s.kind = classify(s.entry, s.def, s.meta);
      if (s.mode === "reset" && s.kind !== "none") s.kind = "resetup";
    }
    const dropAliases = () => staged.forEach((s) => s.next !== s.entry.canonical && s.next !== s.entry.latest && entryOf.delete(s.next));
    if (staged.some((s) => s.mode === "reload" && s.kind !== "none")) {
      dropAliases();
      return { status: "reload", errors: [] };
    }
    const configs = routeUpdates(updates, roots);
    if (staged.length === 0) {
      applyRoutes(configs);
      return { status: configs.length > 0 ? "applied" : "unchanged", errors: [] };
    }

    const undoPatches = staged.map((s) => patch(s.entry, s.next, s.def, s.meta));
    const kinds = new Map<Function, Staged>(staged.map((s) => [s.entry.canonical, s]));
    const resets = new Set<Function>(staged.filter((s) => s.mode === "reset" && s.kind === "resetup").map((s) => s.entry.canonical));
    const undo: Array<() => void> = [];
    const swaps: Swap[] = [];
    const retire: Array<() => void> = [];
    const discard: Array<() => void> = [];
    building++;
    try {
      const kindOfRec = (r: Rec): Kind => kinds.get(r.Class)?.kind ?? "none";
      const targets = new Set<Rec>();

      // 1. Services: re-set-up with state transfer, then everything that injected them, up the graph.
      const queue = [...records].filter((r) => r.kind === "service" && r.token !== undefined && kindOfRec(r) === "resetup");
      const done = new Set<Rec>();
      for (const r of records) if (r.kind === "component" && kindOfRec(r) === "resetup") targets.add(r);
      while (queue.length > 0) {
        queue.sort((a, b) => a.seq - b.seq);
        const rec = queue.shift()!;
        if (done.has(rec) || rec.scope.disposed) continue;
        done.add(rec);
        const ops = injectors.get(rec.owner!)!;
        const value = ops.build(rec.token) as object;
        if (value === rec.instance) continue;
        const fresh = byInstance.get(value);
        if (fresh) {
          fresh.token = rec.token;
          discard.push(() => fresh.scope.dispose());
          if (!resets.has(rec.Class)) transferState(rec.instance, value, isService);
        }
        ops.install(rec.token, value);
        undo.push(() => ops.install(rec.token, rec.instance));
        retire.push(() => rec.scope.dispose());
        for (const r of records) {
          if (!r.deps.has(rec.instance) || done.has(r)) continue;
          if (r.kind === "service") queue.push(r);
          else targets.add(r);
        }
      }

      // 2. Components: re-set-up where needed, else rebuild the view; parents before children, each at most once.
      const items = [
        ...[...targets].map((rec) => ({ rec, resetup: true })),
        ...[...records].filter((r) => r.kind === "component" && !targets.has(r) && kindOfRec(r) === "view").map((rec) => ({ rec, resetup: false })),
      ].sort((a, b) => a.rec.scope.depth - b.rec.scope.depth || a.rec.seq - b.rec.seq);
      const covered: Array<{ scope: Scope; self: boolean }> = [];
      const built = new Set<Region>();
      const resetupIn = (rec: Rec) => {
        const found = findRegion(rec.scope);
        if (!found) throw new Error(`${rec.Class.name} cannot be re-created in place: it was not created by a template or by createComponent.`);
        if (built.has(found.region)) return;
        built.add(found.region);
        covered.push({ scope: found.scope, self: true });
        const old = [...records].filter((r) => within(r.scope, found.scope));
        swaps.push(withSession(old, resets, () => found.region.build()));
      };
      for (const { rec, resetup } of items) {
        if (rec.scope.disposed || covered.some((c) => (c.self ? within(rec.scope, c.scope) : rec.scope !== c.scope && within(rec.scope, c.scope)))) continue;
        if (resetup) resetupIn(rec);
        else {
          const old = [...records].filter((r) => r !== rec && within(r.scope, rec.scope));
          try {
            swaps.push(withSession(old, resets, () => rec.buildView!()));
            covered.push({ scope: rec.scope, self: false });
          } catch {
            resetupIn(rec); // a view that will not rebuild gets one more chance as a re-setup of its subtree
          }
        }
      }
    } catch (error) {
      try {
        for (const s of swaps.reverse()) s.abort();
        for (const fn of undo.reverse()) fn();
        for (const fn of discard) fn();
        undoPatches.reverse().forEach((fn) => fn());
        dropAliases();
      } catch (fatal) {
        building--;
        reportError(fatal, "hmr", reporter(roots), "rollback failed");
        return { status: "reload", errors: [error, fatal] };
      }
      building--;
      reportError(error, "hmr", reporter(roots), staged.map((s) => s.entry.canonical.name).join(", "));
      return { status: "rolled-back", errors: [error] };
    }
    building--;

    // Everything built: retire the old, then patch styles in place.
    for (const s of swaps) s.commit();
    for (const fn of retire) fn();
    for (const s of staged) {
      if (!s.entry.canonical.meta) continue;
      for (const r of records) if (r.kind === "component" && r.Class === s.entry.canonical && r.renderer) registerComponentStyles(r.Class as any, r.renderer);
    }
    applyRoutes(configs);
    return { status: staged.some((s) => s.kind !== "none") || configs.length > 0 ? "applied" : "unchanged", errors: [] };
  });
}

// --- the Vite entry --------------------------------------------------------

/** What `import.meta.hot` offers that the runtime needs. */
export interface HotHost {
  invalidate(message?: string): void;
}

let pending: Array<{ update?: ModuleUpdate; hot?: HotHost }> = [];

/**
 * The self-accept callback of a module that exports classes: `import.meta.hot?.accept(m => update(import.meta.url, m, import.meta.hot))`.
 * Callbacks of one Vite batch arrive in the same tick; they are applied together as one transaction.
 */
export function update(url: string, namespace: Record<string, unknown> | undefined, hot?: HotHost): void {
  // Vite passes `undefined` when re-importing the module failed: the batch rolls back and reports it.
  pending.push({ update: namespace ? { url, exports: namespace } : undefined, hot });
  if (pending.length > 1) return;
  queueMicrotask(() => {
    const batch = pending;
    pending = [];
    const failed = batch.filter((p) => !p.update);
    const result = applyUpdate(
      batch.flatMap((p) => (p.update ? [p.update] : [])),
      failed.map(() => new Error("A module failed to re-evaluate during a hot update")),
    );
    if (result.status === "reload") {
      const hot = batch.find((p) => p.hot)?.hot;
      if (hot) hot.invalidate("Gable cannot hot-update this change");
      else (globalThis as { location?: { reload(): void } }).location?.reload();
    }
  });
}

export { registerModule as register };
