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

/** Adds methods. The factory runs once, in the injection context, so it can call `inject()`. */
export function withMethods<In extends StoreShape, Methods extends Record<string, (...args: never[]) => unknown>>(
  factory: (store: SignalStoreOf<In>) => Methods,
): StoreFeature<In, { state: {}; props: {}; methods: Methods }> {
  return ((store: object) => {
    const methods = factory(store as SignalStoreOf<In>);
    for (const [name, fn] of Object.entries(methods)) define(store, name, fn);
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

/**
 * Shows the store in the Gable devtools panel (Stores tab; dev only, in production this does nothing). The panel reads
 * the current state, and every `patchState` that changes something is added to the history as a `patch` entry holding
 * the changed keys with their new values. `name` identifies the store in the panel; give each live store its own
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
    h.persist.push((next) => {
      if (!handle) return;
      const changes: Record<string, unknown> = {};
      for (const key of Object.keys(next)) if (!Object.is(next[key], last[key])) changes[key] = next[key];
      last = next;
      if (Object.keys(changes).length > 0) handle.log("patch", changes);
    });
    h.onDestroy.push(() => {
      handle?.dispose();
      handle = undefined;
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
  const h: Hooks = { onInit: [], onDestroy: [], ready: [], persist: [] };
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
