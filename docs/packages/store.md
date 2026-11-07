# @gable/store

A signal-based state container in the style of NgRx SignalStore, built on core signals, `computed`, `inject()` and scopes. It adds nothing to `@gable/core` beyond a few functions: a store is a plain class made from features.

## Install

```
npm install @gable/store @gable/core
```

## A store

State, derived values and methods are separate features, passed to `signalStore` in the order they build on each other. A later feature sees everything an earlier one added.

```ts
import { patchState, signalStore, withComputed, withMethods, withState } from "@gable/store";

export class TodoStore extends signalStore(
  withState({ todos: [] as Todo[], filter: "all" as Filter }),
  withComputed((store) => ({
    remaining: () => store.todos().filter((t) => !t.done).length,
  })),
  withMethods((store) => ({
    add(title: string) {
      patchState(store, (s) => ({ todos: [...s.todos, { id: crypto.randomUUID(), title, done: false }] }));
    },
  })),
) {
  static scope = "root";
}
```

Each state key is a read-only signal, `withComputed` values are signals too, and `patchState` is the only way to write. Plain object state is also readable as deep signals, so `store.user.name()` works. Templates read signals and call methods from event handlers: `{{ store.remaining() }}` and `(click)="store.add(title)"`.

## Providing and injecting

A store class has no constructor, so it follows the normal service rules. Give it `static scope = "root"` and `inject(TodoStore)` anywhere, or list it in a component's `providers` to get one store per component instance, destroyed with it.

## Try it

This cart is a real store with state, chained computed values, methods and `withStorage`. The JSON next to it is `getState(store)` read live.

```demo store
Add products, toggle the coupon, then reload the page: the cart comes back from sessionStorage.
```

## Features, in the order you will need them

- `withState(initial)` adds state. Use `[] as Todo[]` for anything wider than its literal type.
- `withComputed` and `withMethods` add derived values and methods. Their factories run in the injection context, so `inject()` works inside them.
- `withHooks({ onInit, onDestroy })` runs setup and teardown. Effects created in `onInit` belong to the store's scope.
- `withEntities<T>()` adds a keyed collection, changed with updaters such as `addEntity`, `updateEntity` and `removeEntity` passed to `patchState`.
- `rxMethod(operator)` turns an RxJS pipeline into a method, for debounced search and similar flows. Plain values, signals and Observables are all accepted as input.
- `withStorage(key, options)` persists chosen state keys and restores them at construction, with versioning and migration.
- `withHotState(import.meta, key)` keeps state across hot module updates. `withDevtools(name)` shows the store in the devtools.
- `signalStoreFeature(...)` bundles features into a reusable one.

Updates are shallow merges, so replace nested objects rather than mutating them. A patch that leaves a key's value identical does not wake readers of that key.

## Go deeper

The [store guide](../store.md) is the full reference: lifecycle details, `rxMethod` error handling, persistence options, entity updaters, hot reload, the language-service rules that catch store mistakes, and the design decisions behind deep signals and typing. For checking a store in a test, provide it with `createTestInjector` from [@gable/testing](./testing.md).

Every exported symbol is documented in the API reference, linked below.
