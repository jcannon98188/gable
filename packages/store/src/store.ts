import { computed, signal, untracked, type ReadonlySignal, type WritableSignal } from "@gable/core";
import { hotState } from "@gable/core";
import { currentScope } from "@gable/core/internal";

/** Dev-only code is gated on this so bundlers can drop it (`define: { __GABLE_DEV__: false }`), the same flag core uses. */
declare const __GABLE_DEV__: boolean | undefined;
const DEV = typeof __GABLE_DEV__ === "undefined" || __GABLE_DEV__ !== false;

// --- types -----------------------------------------------------------------

/** What a (partial) store contains: state keys, computed/other props, and methods. */
export interface StoreShape {
  state: object;
  props: object;
  methods: object;
}

type EmptyShape = { state: {}; props: {}; methods: {} };

/** The writable source behind a store. Only `patchState` and `getState` use it. */
export const STATE_SOURCE: unique symbol = Symbol("gable.store.state");
export interface WritableStateSource<S extends object> {
  readonly [STATE_SOURCE]: WritableSignal<S>;
}

type Prettify<T> = { [K in keyof T]: T[K] } & {};

// Object types that look like records but are never deep-signalled.
type Opaque = readonly unknown[] | ((...args: never[]) => unknown) | Date | Map<unknown, unknown> | Set<unknown> | WeakMap<object, unknown> | WeakSet<object> | Promise<unknown> | RegExp | Error;

type IsDeep<T> = [T] extends [Opaque] ? false : [T] extends [object] ? true : false;

/** A read-only signal; when its value is a plain object, each key is also a `DeepSignal` (`store.user.name()`). */
export type DeepSignal<T> = ReadonlySignal<T> & (IsDeep<T> extends true ? { readonly [K in keyof T]: DeepSignal<T[K]> } : unknown);

/** One read-only (deep) signal per state key. */
export type StateSignals<S> = { [K in keyof S]: DeepSignal<S[K]> };

type Merge<A extends StoreShape, B extends StoreShape> = {
  state: Prettify<A["state"] & B["state"]>;
  props: Prettify<A["props"] & B["props"]>;
  methods: Prettify<A["methods"] & B["methods"]>;
};

/** The public type of a store with the given shape. */
export type SignalStoreOf<S extends StoreShape> = Prettify<StateSignals<S["state"]> & S["props"] & S["methods"] & WritableStateSource<S["state"]>>;

declare const SHAPE: unique symbol;
interface InnerStore<S extends StoreShape> {
  readonly [SHAPE]?: S;
}

/**
 * One step of a store. `In` is what the features before it provide; `Out` is what this one adds.
 * The runtime value is a function over the store under construction; the types ride on its signature.
 */
export type StoreFeature<In extends StoreShape, Out extends StoreShape> = (store: InnerStore<In>) => InnerStore<Out>;

export type StateUpdater<S> = Partial<S> | ((state: S) => Partial<S>);

// --- runtime ---------------------------------------------------------------

const stateKey = STATE_SOURCE;

interface Hooks {
  onInit: Array<() => void>;
  onDestroy: Array<() => void>;
  /** Run after every feature has been applied, before onInit (state restore). */
  ready: Array<() => void>;
  /** Called synchronously with the new state after every patchState. */
  persist: Array<(state: Record<string, unknown>) => void>;
  /** Dev only: wrappers around every method call (devtools action log). Each receives the method name, its arguments and a function that runs it. */
  actions: Array<(name: string, args: unknown[], run: () => unknown) => unknown>;
}

const hooksOf = new WeakMap<object, Hooks>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Wraps a signal so that, while its value is a plain object, `sig.key` is a signal of that key.
 * Nested signals are created on first access and cached; a key that is not in the current value
 * falls through to the function's own properties.
 */
function deepSignal<T>(read: ReadonlySignal<T>): DeepSignal<T> {
  const cache = new Map<string, unknown>();
  return new Proxy(read, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const value = untracked(target);
        if (isPlainObject(value) && prop in value) {
          let child = cache.get(prop);
          if (!child) {
            child = deepSignal(computed(() => (target() as Record<string, unknown>)?.[prop]));
            cache.set(prop, child);
          }
          return child;
        }
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as DeepSignal<T>;
}

function define(store: object, name: string, value: unknown): void {
  if (Object.prototype.hasOwnProperty.call(store, name)) {
    throw new Error(`signalStore: member "${name}" is declared twice. Names must be unique across state, computed and methods.`);
  }
  Object.defineProperty(store, name, { value, enumerable: true });
}

function state(store: object): WritableSignal<Record<string, unknown>> {
  return (store as Record<symbol, WritableSignal<Record<string, unknown>>>)[stateKey]!;
}

function hooks(store: object): Hooks {
  return hooksOf.get(store)!;
}

/**
 * Adds state. Each key becomes a read-only deep signal; change it with `patchState`.
 * Pass a factory to compute the initial state at construction (it runs in the injection context).
 */
export function withState<S extends object>(initial: S | (() => S)): StoreFeature<EmptyShape, { state: S; props: {}; methods: {} }> {
  return ((store: object) => {
    const value = typeof initial === "function" ? (initial as () => S)() : initial;
    const source = state(store);
    for (const key of Object.keys(value)) {
      if (Object.prototype.hasOwnProperty.call(source(), key)) {
        throw new Error(`signalStore: state key "${key}" is declared twice.`);
      }
    }
    source.set({ ...source(), ...value });
    for (const key of Object.keys(value)) {
      define(store, key, deepSignal(computed(() => source()[key])));
    }
    return store;
  }) as never;
}

/** Adds computed values. Each function in the returned record becomes a read-only deep signal. */
export function withComputed<In extends StoreShape, Props extends Record<string, () => unknown>>(
  factory: (store: SignalStoreOf<In>) => Props,
): StoreFeature<In, { state: {}; props: { [K in keyof Props]: DeepSignal<ReturnType<Props[K]>> }; methods: {} }> {
  return ((store: object) => {
    const props = factory(store as SignalStoreOf<In>);
    for (const [name, fn] of Object.entries(props)) define(store, name, deepSignal(computed(fn)));
    return store;
  }) as never;
}

/**
 * Dev only: routes a method call through the store's action wrappers (see `withDevtools`). With none registered it calls the
 * method directly. Own properties of the method (an `rxMethod`'s `destroy`) are kept.
 */
function instrument(store: object, name: string, fn: (...args: never[]) => unknown): (...args: never[]) => unknown {
  const wrapped = function (this: unknown, ...args: never[]) {
    const wrappers = hooksOf.get(store)?.actions;
    if (!wrappers || wrappers.length === 0) return fn.apply(this, args);
    let run = () => fn.apply(this, args);
    for (const wrap of wrappers) {
      const inner = run;
      run = () => wrap(name, args, inner);
    }
    return run();
  };
  return Object.assign(wrapped, fn);
}

/** Adds methods. The factory runs once, in the injection context, so it can call `inject()`. */
export function withMethods<In extends StoreShape, Methods extends Record<string, (...args: never[]) => unknown>>(
  factory: (store: SignalStoreOf<In>) => Methods,
): StoreFeature<In, { state: {}; props: {}; methods: Methods }> {
  return ((store: object) => {
    const methods = factory(store as SignalStoreOf<In>);
    for (const [name, fn] of Object.entries(methods)) define(store, name, DEV ? instrument(store, name, fn) : fn);
    return store;
  }) as never;
}

interface HookSet<S> {
  /** Runs once, after every feature has been applied. Runs in the injection context; effects created here are owned by the store's scope. */
  onInit?: (store: S) => void;
  /** Runs when the store's owner (component or injector) is destroyed. */
  onDestroy?: (store: S) => void;
}

/** Adds lifecycle hooks, as an object or as a factory that returns one. May be used more than once. */
export function withHooks<In extends StoreShape>(
  hooks_: HookSet<SignalStoreOf<In>> | ((store: SignalStoreOf<In>) => HookSet<SignalStoreOf<In>>),
): StoreFeature<In, EmptyShape> {
  return ((store: object) => {
    const set = typeof hooks_ === "function" ? hooks_(store as SignalStoreOf<In>) : hooks_;
    const h = hooks(store);
    if (set.onInit) h.onInit.push(() => set.onInit!(store as SignalStoreOf<In>));
    if (set.onDestroy) h.onDestroy.push(() => set.onDestroy!(store as SignalStoreOf<In>));
    return store;
  }) as never;
}

/**
 * Keeps the store's state across hot module updates (dev only; in production this does nothing).
 * When the module is edited and evaluated again, the new store class starts from the state the old one
 * last had: keys the new store still declares are restored, keys it no longer declares are dropped, and keys
 * it added keep their initial value. Put it after the `withState` calls. `key` names the store within the
 * module; rename it, or pass `{ reset: true }`, to start fresh.
 *
 *     class TodoStore extends signalStore(withState({ ... }), withHotState(import.meta, "TodoStore")) {}
 */
export function withHotState<In extends StoreShape>(
  meta: { url: string; hot?: unknown },
  key: string,
  options: { reset?: boolean } = {},
): StoreFeature<In, EmptyShape> {
  return ((store: object) => {
    const holder = hotState(meta, `store:${key}`, () => ({ saved: undefined as Record<string, unknown> | undefined }), options);
    const h = hooks(store);
    h.ready.push(() => {
      const source = state(store);
      const current = untracked(source);
      const saved = holder.saved;
      if (saved) {
        const restored: Record<string, unknown> = { ...current };
        for (const k of Object.keys(current)) if (k in saved) restored[k] = saved[k];
        source.set(restored);
      }
      holder.saved = untracked(source);
    });
    h.persist.push((next) => {
      holder.saved = next;
    });
    return store;
  }) as never;
}

interface DevtoolsHook {
  registerInspector(id: string, spec: { label: string; snapshot(): unknown }): { log(type: string, data?: unknown): void; dispose(): void };
}

/** A short, JSON-safe description of a method argument for the action log. */
function summarize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 80 ? value.slice(0, 80) + "…" : value;
  if (typeof value === "bigint" || typeof value === "symbol") return String(value);
  if (typeof value === "function") return `[Function${value.name ? " " + value.name : ""}]`;
  if (Array.isArray(value)) return depth > 0 ? `Array(${value.length})` : value.slice(0, 5).map((v) => summarize(v, 1)).concat(value.length > 5 ? [`… ${value.length - 5} more`] : []);
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { subscribe?: unknown }).subscribe === "function") return "[Observable]";
  if (isPlainObject(value)) {
    if (depth > 0) return "{…}";
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).slice(0, 8)) out[key] = summarize(value[key], 1);
    return out;
  }
  return `[${(value as object).constructor?.name ?? "Object"}]`;
}

/**
 * Shows the store in the Gable devtools panel (Stores tab; dev only, in production this does nothing). The panel reads
 * the current state, and every `patchState` that changes something is added to the history as a `patch` entry holding
 * the changed keys with their new values. Method calls (`withMethods`, including an `rxMethod` used as a method) are logged
 * as `action` entries: the method `name`, a short summary of its `args`, and the `patches` it made before returning
 * (grouped under the action instead of separate `patch` entries; a failed call also has `error`). Patches made later, such as
 * after an `await` or from an rxMethod pipeline, appear as ordinary `patch` entries. `name` identifies the store in the panel; give each live store its own
 * (a second store with the same name replaces the first). Without the devtools hook on the page it does nothing.
 *
 *     class CartStore extends signalStore(withState({ ... }), withDevtools("Cart")) {}
 */
export function withDevtools<In extends StoreShape>(name: string): StoreFeature<In, EmptyShape> {
  return ((store: object) => {
    if (!DEV) return store;
    const h = hooks(store);
    let handle: ReturnType<DevtoolsHook["registerInspector"]> | undefined;
    let last: Record<string, unknown> = {};
    h.ready.push(() => {
      const hook = (globalThis as { __GABLE_DEVTOOLS_HOOK__?: DevtoolsHook }).__GABLE_DEVTOOLS_HOOK__;
      if (!hook) return;
      const source = state(store);
      last = untracked(source);
      handle = hook.registerInspector(name, { label: name, snapshot: () => untracked(source) });
    });
    // The action being run (outermost method call), collecting the patches it makes synchronously.
    let frame: { patches: Array<Record<string, unknown>> } | undefined;
    h.persist.push((next) => {
      if (!handle) return;
      const changes: Record<string, unknown> = {};
      for (const key of Object.keys(next)) if (!Object.is(next[key], last[key])) changes[key] = next[key];
      last = next;
      if (Object.keys(changes).length === 0) return;
      if (frame) frame.patches.push(changes);
      else handle.log("patch", changes);
    });
    h.actions.push((method, args, run) => {
      if (!handle || frame) return run(); // not registered, or nested in an action already being logged
      const own = (frame = { patches: [] });
      let error: unknown;
      let failed = false;
      try {
        return run();
      } catch (e) {
        failed = true;
        error = e;
        throw e;
      } finally {
        frame = undefined;
        const entry: Record<string, unknown> = { name: method, args: args.map((a) => summarize(a)), patches: own.patches };
        if (failed) entry.error = error instanceof Error ? error.message : String(error);
        handle.log("action", entry);
      }
    });
    h.onDestroy.push(() => {
      handle?.dispose();
      handle = undefined;
    });
    return store;
  }) as never;
}

/** The part of the Web Storage API `withStorage` uses. `localStorage`, `sessionStorage` and a hand-written adapter all fit. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface WithStorageOptions<S> {
  /** Which state keys to persist. Default: every key the store has when the feature runs. */
  keys?: ReadonlyArray<keyof S & string>;
  /** `"local"` (default), `"session"`, or any `StorageLike`. When the storage is missing or throws (SSR, private mode, blocked cookies) the feature does nothing. */
  storage?: "local" | "session" | StorageLike | (() => StorageLike | undefined);
  /** Schema version of the saved data (default 0). Data saved under another version goes to `migrate`, or is discarded without one. */
  version?: number;
  /** Turns data saved under an older (or newer) `version` into the current shape. Return the state to restore; throw to discard it. */
  migrate?: (saved: Record<string, unknown>, savedVersion: number) => Record<string, unknown>;
  /** Milliseconds to wait after the last change before writing (default 100). `0` writes synchronously on every change. */
  debounce?: number;
  /** Apply changes other tabs make to the same key (the `storage` event). Default false. */
  sync?: boolean;
}

function resolveStorage(option: WithStorageOptions<never>["storage"]): StorageLike | undefined {
  try {
    if (option === undefined || option === "local") return (globalThis as { localStorage?: StorageLike }).localStorage;
    if (option === "session") return (globalThis as { sessionStorage?: StorageLike }).sessionStorage;
    return typeof option === "function" ? option() : option;
  } catch {
    return undefined; // accessing localStorage can throw (SecurityError)
  }
}

/**
 * Saves chosen state keys to `localStorage` (or `sessionStorage`, or any `StorageLike`) and restores them when the store
 * is created. The saved value is JSON: `{ v: version, state: { ...picked keys } }` under `key`, so only JSON-friendly
 * state (no Dates, Maps or class instances) round-trips. Writes are debounced and flushed when the store is destroyed
 * and when the page is hidden. Only keys the store declares are restored; values are not validated, so use `version` and
 * `migrate` when the shape changes. Storage that is missing or throws (SSR, private browsing, quota) is skipped silently.
 *
 * Restoring happens after all features are applied and before `onInit`. When combined with `withHotState`, list
 * `withStorage` first so the in-session hot state wins over the saved copy.
 *
 *     class Prefs extends signalStore(withState({ theme: "light", draft: "" }), withStorage("prefs", { keys: ["theme"], version: 2 })) {}
 */
export function withStorage<In extends StoreShape>(key: string, options: WithStorageOptions<In["state"]> = {}): StoreFeature<In, EmptyShape> {
  return ((store: object) => {
    const h = hooks(store);
    const storage = resolveStorage(options.storage as never);
    if (!storage) return store;
    const version = options.version ?? 0;
    const delay = options.debounce ?? 100;
    const source = state(store);
    let keys: string[] = [];
    let written: Record<string, unknown> = {};
    let pending: Record<string, unknown> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let applying = false;

    const read = (raw: string | null): Record<string, unknown> | undefined => {
      if (raw === null) return undefined;
      try {
        const parsed = JSON.parse(raw) as { v?: unknown; state?: unknown };
        if (!isPlainObject(parsed) || !isPlainObject(parsed.state)) return undefined;
        const savedVersion = typeof parsed.v === "number" ? parsed.v : 0;
        if (savedVersion === version) return parsed.state;
        return options.migrate ? options.migrate(parsed.state, savedVersion) : undefined;
      } catch {
        return undefined; // corrupt JSON or a throwing migrate: start from the initial state
      }
    };
    const load = (): Record<string, unknown> | undefined => {
      try {
        return read(storage.getItem(key));
      } catch {
        return undefined;
      }
    };
    const apply = (saved: Record<string, unknown>): boolean => {
      const current = untracked(source);
      const next: Record<string, unknown> = { ...current };
      let changed = false;
      for (const k of keys) {
        if (k in saved && !Object.is(saved[k], current[k])) {
          next[k] = saved[k];
          changed = true;
        }
      }
      if (changed) source.set(next);
      return changed;
    };
    const flush = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const snapshot = pending;
      pending = undefined;
      if (!snapshot) return;
      const picked: Record<string, unknown> = {};
      for (const k of keys) picked[k] = snapshot[k];
      try {
        storage.setItem(key, JSON.stringify({ v: version, state: picked }));
        written = picked;
      } catch {
        // quota exceeded, storage went away, or unserialisable state: keep running without persistence
      }
    };

    h.ready.push(() => {
      const current = untracked(source);
      keys = (options.keys as string[] | undefined)?.filter((k) => k in current) ?? Object.keys(current);
      const saved = load();
      if (saved) apply(saved);
      written = Object.fromEntries(keys.map((k) => [k, untracked(source)[k]]));
    });
    h.persist.push((next) => {
      if (applying || keys.every((k) => Object.is(next[k], written[k]))) return;
      pending = next;
      if (delay <= 0) flush();
      else if (timer === undefined) timer = setTimeout(flush, delay);
    });

    const target = (globalThis as { addEventListener?: typeof addEventListener; removeEventListener?: typeof removeEventListener });
    const onHide = () => flush();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || (e.storageArea && e.storageArea !== (storage as unknown))) return;
      const saved = e.newValue === null ? undefined : read(e.newValue);
      if (!saved) return;
      applying = true;
      try {
        if (apply(saved)) {
          const now = untracked(source);
          written = Object.fromEntries(keys.map((k) => [k, now[k]]));
          for (const fn of h.persist) fn(now);
        }
      } finally {
        applying = false;
      }
    };
    h.onInit.push(() => {
      target.addEventListener?.("pagehide", onHide);
      if (options.sync) target.addEventListener?.("storage", onStorage as never);
    });
    h.onDestroy.push(() => {
      flush();
      target.removeEventListener?.("pagehide", onHide);
      target.removeEventListener?.("storage", onStorage as never);
    });
    return store;
  }) as never;
}

/** Merges partial state (objects, or functions of the current state) into the store. Shallow: a nested object is replaced whole. */
export function patchState<S extends object>(store: WritableStateSource<S>, ...updaters: Array<StateUpdater<NoInfer<S>>>): void {
  const source = store[stateKey as never] as unknown as WritableSignal<S>;
  let next = untracked(source);
  for (const u of updaters) next = { ...next, ...(typeof u === "function" ? u(next) : u) };
  source.set(next);
  const persist = hooksOf.get(store);
  if (persist) for (const fn of persist.persist) fn(next as Record<string, unknown>);
}

/** The current state as a plain object. Reading it inside an effect or computed subscribes to every key. */
export function getState<S extends object>(store: WritableStateSource<S>): S {
  return (store[stateKey as never] as unknown as WritableSignal<S>)();
}

// --- signalStore -----------------------------------------------------------

type Feature = (store: never) => unknown;

function assemble(store: object, features: Feature[]): void {
  Object.defineProperty(store, stateKey, { value: signal<Record<string, unknown>>({}) });
  const h: Hooks = { onInit: [], onDestroy: [], ready: [], persist: [], actions: [] };
  hooksOf.set(store, h);
  for (const feature of features) feature(store as never);
  for (const fn of h.ready) untracked(fn);
  const scope = currentScope();
  if (scope && h.onDestroy.length > 0) {
    scope.onDispose(() => {
      for (const fn of h.onDestroy) untracked(fn);
    });
  }
  for (const fn of h.onInit) untracked(fn);
}

type StoreClass<S extends StoreShape> = new () => SignalStoreOf<S>;
type E = EmptyShape;
type M<A extends StoreShape, B extends StoreShape> = Merge<A, B>;

/**
 * Builds a store class from features. Extend it (`static scope = 'root'` for a singleton),
 * or provide it as is in a component's `providers`; get it with `inject(Store)`.
 */
export function signalStore<A extends StoreShape>(a: StoreFeature<E, A>): StoreClass<M<E, A>>;
export function signalStore<A extends StoreShape, B extends StoreShape>(a: StoreFeature<E, A>, b: StoreFeature<M<E, A>, B>): StoreClass<M<M<E, A>, B>>;
export function signalStore<A extends StoreShape, B extends StoreShape, C extends StoreShape>(
  a: StoreFeature<E, A>,
  b: StoreFeature<M<E, A>, B>,
  c: StoreFeature<M<M<E, A>, B>, C>,
): StoreClass<M<M<M<E, A>, B>, C>>;
export function signalStore<A extends StoreShape, B extends StoreShape, C extends StoreShape, D extends StoreShape>(
  a: StoreFeature<E, A>,
  b: StoreFeature<M<E, A>, B>,
  c: StoreFeature<M<M<E, A>, B>, C>,
  d: StoreFeature<M<M<M<E, A>, B>, C>, D>,
): StoreClass<M<M<M<M<E, A>, B>, C>, D>>;
export function signalStore<A extends StoreShape, B extends StoreShape, C extends StoreShape, D extends StoreShape, F extends StoreShape>(
  a: StoreFeature<E, A>,
  b: StoreFeature<M<E, A>, B>,
  c: StoreFeature<M<M<E, A>, B>, C>,
  d: StoreFeature<M<M<M<E, A>, B>, C>, D>,
  e: StoreFeature<M<M<M<M<E, A>, B>, C>, D>, F>,
): StoreClass<M<M<M<M<M<E, A>, B>, C>, D>, F>>;
export function signalStore<A extends StoreShape, B extends StoreShape, C extends StoreShape, D extends StoreShape, F extends StoreShape, G extends StoreShape>(
  a: StoreFeature<E, A>,
  b: StoreFeature<M<E, A>, B>,
  c: StoreFeature<M<M<E, A>, B>, C>,
  d: StoreFeature<M<M<M<E, A>, B>, C>, D>,
  e: StoreFeature<M<M<M<M<E, A>, B>, C>, D>, F>,
  f: StoreFeature<M<M<M<M<M<E, A>, B>, C>, D>, F>, G>,
): StoreClass<M<M<M<M<M<M<E, A>, B>, C>, D>, F>, G>>;
export function signalStore<A extends StoreShape, B extends StoreShape, C extends StoreShape, D extends StoreShape, F extends StoreShape, G extends StoreShape, H extends StoreShape>(
  a: StoreFeature<E, A>,
  b: StoreFeature<M<E, A>, B>,
  c: StoreFeature<M<M<E, A>, B>, C>,
  d: StoreFeature<M<M<M<E, A>, B>, C>, D>,
  e: StoreFeature<M<M<M<M<E, A>, B>, C>, D>, F>,
  f: StoreFeature<M<M<M<M<M<E, A>, B>, C>, D>, F>, G>,
  g: StoreFeature<M<M<M<M<M<M<E, A>, B>, C>, D>, F>, G>, H>,
): StoreClass<M<M<M<M<M<M<M<E, A>, B>, C>, D>, F>, G>, H>>;
export function signalStore<A extends StoreShape, B extends StoreShape, C extends StoreShape, D extends StoreShape, F extends StoreShape, G extends StoreShape, H extends StoreShape, I extends StoreShape>(
  a: StoreFeature<E, A>,
  b: StoreFeature<M<E, A>, B>,
  c: StoreFeature<M<M<E, A>, B>, C>,
  d: StoreFeature<M<M<M<E, A>, B>, C>, D>,
  e: StoreFeature<M<M<M<M<E, A>, B>, C>, D>, F>,
  f: StoreFeature<M<M<M<M<M<E, A>, B>, C>, D>, F>, G>,
  g: StoreFeature<M<M<M<M<M<M<E, A>, B>, C>, D>, F>, G>, H>,
  h: StoreFeature<M<M<M<M<M<M<M<E, A>, B>, C>, D>, F>, G>, H>, I>,
): StoreClass<M<M<M<M<M<M<M<M<E, A>, B>, C>, D>, F>, G>, H>, I>>;
export function signalStore(...features: Feature[]): unknown {
  // No explicit constructor: Gable classes have none (a field initialiser does the work), so this class can be provided directly.
  return class SignalStore {
    #init = assemble(this, features);
  };
}
