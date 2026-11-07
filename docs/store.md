# @gable/store

A SignalStore-style state container built on core signals, `computed`, `inject()` and scopes. It adds nothing to `@gable/core`.

```ts
import { effect, inject } from '@gable/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@gable/store';

export class TodoStore extends signalStore(
  withState({ todos: [] as Todo[], filter: 'all' as Filter, user: { name: 'Ada' } }),
  withComputed((store) => ({
    remaining: () => store.todos().filter((t) => !t.done).length,
  })),
  withMethods((store) => {
    const storage = inject(TodoStorage); // factories run in the injection context
    return {
      add(title: string) {
        patchState(store, (s) => ({ todos: [...s.todos, { id: crypto.randomUUID(), title, done: false }] }));
      },
    };
  }),
  withHooks({
    onInit: (store) => effect(() => localStorage.setItem('todos', JSON.stringify(store.todos()))),
    onDestroy: () => console.log('store destroyed'),
  }),
) {
  static scope = 'root';
}
```

Templates read signals only: `{{ store.remaining() }}`, `{{ store.user.name() }}`, `(click)="store.add(title)"`. Methods are called from event handlers, never from value expressions.

## API

| Export | Purpose |
| --- | --- |
| `signalStore(...features)` | Returns a class. Extend it, or provide it directly. 1 to 8 features. |
| `withState(initial \| () => initial)` | Adds state. Each key is a read-only deep signal. May be used several times (keys must be unique). |
| `withComputed((store) => ({ x: () => ... }))` | Each function becomes a read-only deep signal. |
| `withMethods((store) => ({ ... }))` | Adds methods. The factory runs once at construction, in the injection context. |
| `withHooks({ onInit, onDestroy })` or `withHooks((store) => ({ ... }))` | Lifecycle (below). May be used several times. |
| `patchState(store, ...updaters)` | The only way to write state. Each updater is a partial object or `(state) => partial`; applied in order, committed as one write. |
| `withHotState(import.meta, key, { reset? })` | Keeps state across hot module updates (dev only). See "HMR". |
| `withDevtools(name)` | Shows the store in the Gable devtools Stores tab (dev only): its state, plus a `patch` history entry (changed keys and values) for every `patchState` that changes something. See `docs/devtools.md`. |
| `getState(store)` | The current state as a plain object (a tracked read). |
| `DeepSignal`, `SignalStoreOf`, `StoreFeature`, `StateSignals`, `WritableStateSource` | Types. |

Not in this package yet (separate tasks): `withStorage`, action-level devtools history. Also not provided: `withProps`, `watchState`, `withLinkedState`, a `providedIn` option.

## Scope and DI

`signalStore()` returns a plain class with no constructor, so it follows Gable's service rules:

- Root singleton: `class TodoStore extends signalStore(...) { static scope = 'root' }`, then `inject(TodoStore)` anywhere.
- Component-scoped: put the store class in `meta.providers`. Each component instance gets its own store, destroyed with the component.
- Any injector: list it in `createInjector([...])` / `createChild([...])`.

(NgRx's `providedIn: 'root'` option is replaced by `static scope = 'root'`, the Gable convention. An undecorated store class with no scope and no provider throws `No provider`, as any service does.)

## Lifecycle

`onInit` runs once, after every feature has been applied, in the injection context and untracked. Effects created in it belong to the store's scope. `onDestroy` runs when the scope that was current at construction is disposed: the injector for a root or injector-provided store, the component's own injector for a component-provided one. Hooks run in declaration order. A store created outside any scope never fires `onDestroy`.

## State is read-only

State keys are `computed` signals over one private root signal; there is no `set`/`update` on them. The root signal is reachable only through the `STATE_SOURCE` symbol property, which `patchState` and `getState` use. Updates are shallow merges: replace a nested object (`{ user: { ...s.user, name } }`) rather than mutating it. Per-key computeds use `Object.is`, so a patch that leaves a key's value identical does not wake readers of that key.

Member names must be unique across state, computed and methods; a duplicate throws when the store is constructed (NgRx only warns in dev).

## Design decisions

### Deep signals: a lazy proxy, not generated

`store.user.name()` works because each state or computed signal is wrapped in a `Proxy` over the signal function. On a string property access it peeks (untracked) at the current value; if that is a plain object that has the key, it returns a cached `computed(() => parent()[key])`, itself deep. Otherwise the access falls through to the function (`call`, `length`, ...), so a state key named `name` or `length` wins over the function's own property only while the value is an object with that key.

Why not generate nested signals from the initial value: state shapes change after construction (a nullable becomes an object, a record gains keys), and a generated tree would either go stale or need rebuilding. The proxy follows the live value, costs nothing for keys never read in a template, and the cache keeps `store.user.name === store.user.name` stable. Costs: one Proxy per state or computed signal, and the property check is a runtime decision (a key absent from the value reads as the function's own property, usually `undefined`).

Only plain objects (prototype `Object.prototype` or `null`) are deep. Arrays, class instances, `Date`, `Map`, `Set` stay plain signals. A union like `User | null` is typed as a plain signal; at runtime it is deep while it holds an object, which is only reachable by a cast.

### Typing: a small, additive surface

- A feature is `StoreFeature<In, Out>`, a function type whose phantom parameter carries what earlier features provide (`In`) and whose result carries what it adds (`Out`). `signalStore` has explicit overloads for 1 to 8 features, each feeding the merged result of the previous ones into the next feature's `In`. This is the only inference trick; it is what lets `withMethods((store) => ...)` see the state and computed members declared before it.
- Computed and method members keep the types TypeScript infers from the factory. State keeps the type of the initial value; write `[] as Todo[]` or `'all' as Filter` for anything wider than its literal.
- `DeepSignal<T>` is `ReadonlySignal<T>` plus a mapped type over `T` when `T` is a non-array, non-builtin object. This is deliberately narrower than NgRx (no unwrapping of optional keys, no `Record` special cases).
- There is no variadic overload beyond 8 features. Split a larger store, or group related features, or group related features with `signalStoreFeature`.
- Type tests (`expectTypeOf` and `@ts-expect-error`) live in `packages/store/src/store.test.ts`, and the package is checked with `tsc -p packages/store/tsconfig.json`.

### Class, not object

The returned class uses a field initialiser, not a constructor, so Gable's dev check against constructors passes when the class itself is provided. Members are defined on the instance as non-writable, enumerable properties. The store instance is the object that every factory receives, so factories see members from earlier features only.

## rxMethod

`rxMethod<T>(operator)` builds a method from an RxJS operator chain, in the style of NgRx. `operator` receives an `Observable<T>` of everything fed to the method and returns the pipeline. Create it in a store feature (`withMethods`), a component field or a service; it needs a current scope, or pass `{ scope }`.

```ts
const SearchStore = signalStore(
  withState({ results: [] as Hit[], loading: false }),
  withMethods((store) => {
    const http = inject(Http);
    return {
      search: rxMethod<string>((q$) =>
        q$.pipe(
          debounceTime(300),
          distinctUntilChanged(),
          tap(() => patchState(store, { loading: true })),
          switchMap((q) =>
            http.get<Hit[]>('/api/search', { params: { q } }).pipe(
              tap((results) => patchState(store, { results, loading: false })),
              catchError(() => { patchState(store, { loading: false }); return EMPTY; }),
            ),
          ),
        ),
      ),
    };
  }),
);

store.search('gable');       // a value: one emission
store.search(query);         // a signal: emits now and after each change
store.search(query$);        // an Observable: forwards every emission
```

- Each call returns a `Subscription` that stops only that input (a signal or Observable). Plain values return an already-closed one.
- Signals go through `toObservable`, so they are flush-aligned: several writes in one flush emit once with the settled value.
- The pipeline and every input subscription are torn down when the owning scope is disposed (the store's, or the component's for a component-provided store). Calls after disposal are ignored. `method.destroy()` stops it early.
- An error that reaches the end of the pipeline goes to the `ErrorHandler` as `subscription` and ends the pipeline, as in RxJS. Put `catchError` inside the inner observable of `switchMap` to keep it alive.
- Unlike NgRx there is no injector option and no `Observable`-returning form; the owner is always a scope.

## HMR

`withHotState(import.meta, "TodoStore")` is a feature built on core `hotState`. Put it after the `withState` calls:

```ts
class TodoStore extends signalStore(withState({ todos: [] as Todo[] }), withHotState(import.meta, "TodoStore"), withMethods(...)) {}
```

When the store's module is edited and evaluated again, the new class starts from the state the previous one last had. `patchState` records every write, so nothing is lost between edits. Keys the new store still declares are restored; keys it removed are dropped; keys it added keep their initial value. Rename the key, or pass `{ reset: true }`, to start fresh. Without `import.meta.hot` (production) it does nothing. `key` names the store within its module (state is stored per module URL without query, plus key), so give two stores in one file different keys.

A live instance keeps running its old methods (they are closures made at construction); the new behaviour and the preserved state arrive together when the new class is constructed.

## Language-service rules

`gable-check` and the editor plugin report these store mistakes (severity configurable under `rules`, as for every rule):

| Rule | Reports |
| --- | --- |
| `store-write-outside-patch` | `store[STATE_SOURCE].set(...)` / `.update(...)`. Write with `patchState`. |
| `store-method-in-template` | A store method called in a value expression (`{{ store.add() }}`, `[x]="store.load()"`). Call methods from event handlers; read signals and `withComputed` values. |
| `store-outside-injection-context` | `new Store()` outside Setup (module level, in a method or callback). Use `inject(Store)` or `providers`. |

State keys have no `set`/`update` in their types, so ordinary direct writes are already compile errors; the first rule covers the state-source escape hatch.

## Entities

`withEntities` adds a collection: state `ids` and `entityMap`, and a computed `entities` (in `ids` order). Change it by passing updaters to `patchState`.

```ts
import { addEntity, entityConfig, patchState, removeEntity, signalStore, type, updateEntity, withEntities, withMethods } from "@gable/store";

class TodoStore extends signalStore(
  withEntities<Todo>(),
  withMethods((store) => ({
    add: (todo: Todo) => patchState(store, addEntity(todo)),
    toggle: (id: number) => patchState(store, updateEntity({ id, changes: (t) => ({ done: !t.done }) })),
    remove: (id: number) => patchState(store, removeEntity(id)),
  })),
) {}
```

Updaters: `addEntity/addEntities` (skip existing ids), `setEntity/setEntities` (add or replace), `setAllEntities` (replace the collection), `upsertEntity/upsertEntities` (add or shallow-merge), `updateEntity/updateEntities({ ids | predicate, changes })/updateAllEntities` (`changes` is a partial or `(entity) => partial`; changing the id keeps the position), `removeEntity/removeEntities(ids | predicate)/removeAllEntities`. Missing ids are ignored, and an updater that changes nothing leaves `ids`/`entityMap` untouched, so readers do not re-run.

Each updater takes an optional last argument `{ collection, selectId }`:

- **selectId**: entities read their id from `id` (a string or number). For any other shape pass `selectId` to every updater, or the type check asks for it (a missing id throws at runtime). 
- **Named collections**: `withEntities({ entity: type<Todo>(), collection: "todo" })` adds `todoIds`, `todoEntityMap`, `todoEntities`, so one store can hold several. Pass `{ collection: "todo" }` to the updaters.
- **entityConfig**: `const todo = entityConfig({ entity: type<Todo>(), collection: "todo" })` then `updateEntity({ id, changes }, todo)`. Updaters that do not receive a whole entity (`update*`) learn the entity type from the store through the `patchState` call for the default collection, and from `entityConfig` for a named one, since TypeScript cannot read it back through a computed key name.

Differences from NgRx: updaters are plain functions for `patchState`, with no `prependEntity`; `type<T>()` and `entityConfig` are exported from this package.

## signalStoreFeature

Bundles features into one reusable feature (1 to 5). The result adds what the bundled features add.

```ts
const withSelection = signalStoreFeature(
  { state: type<{ items: Item[] }>(), props: type<{ count: ReadonlySignal<number> }>() },
  withState({ selectedId: null as number | null }),
  withComputed((store) => ({ selected: () => store.items().find((i) => i.id === store.selectedId()) })),
);
```

The optional first argument is the input requirement (`state`, `props`, `methods`, each a `type<T>()`). Bundled features see those members, and `signalStore` refuses to accept the feature unless the features before it provide them with compatible types. Props are typed as signals (`ReadonlySignal<number>`, or `DeepSignal<T>`). The input is a type-level contract only; nothing is checked at runtime. Without an input, the bundled features see an empty store.

An input-carrying feature is a generic function over the store it is added to; this lets an inline `withState({...})` before it keep its inferred type.
