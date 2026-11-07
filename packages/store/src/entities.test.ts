import { describe, expect, expectTypeOf, it } from "vitest";
import { inject, type ReadonlySignal } from "@gable/core";
import { createTestInjector } from "@gable/testing";
import {
  addEntities,
  addEntity,
  entityConfig,
  getState,
  patchState,
  removeAllEntities,
  removeEntities,
  removeEntity,
  setAllEntities,
  setEntities,
  setEntity,
  signalStore,
  signalStoreFeature,
  type,
  updateAllEntities,
  updateEntities,
  updateEntity,
  upsertEntities,
  upsertEntity,
  withComputed,
  withEntities,
  withMethods,
  withState,
  type EntityId,
} from "./index.js";

interface Todo {
  id: number;
  title: string;
  done: boolean;
}
interface User {
  key: string;
  name: string;
}
const selectKey = (u: User) => u.key;

const build = <T extends new () => object>(cls: T): InstanceType<T> => createTestInjector().run(() => new cls() as InstanceType<T>);

describe("withEntities (default collection)", () => {
  const Store = signalStore(withState({ query: "" }), withEntities<Todo>());
  const t = (id: number, title = `t${id}`, done = false): Todo => ({ id, title, done });

  it("starts empty and exposes ids, entityMap and entities", () => {
    const s = build(Store);
    expect(s.ids()).toEqual([]);
    expect(s.entityMap()).toEqual({});
    expect(s.entities()).toEqual([]);
    expectTypeOf(s.ids).toEqualTypeOf<ReadonlySignal<EntityId[]>>();
    expectTypeOf(s.entities()).toEqualTypeOf<Todo[]>();
    expectTypeOf(s.query()).toEqualTypeOf<string>();
  });

  it("adds entities in order and ignores duplicates", () => {
    const s = build(Store);
    patchState(s, addEntity(t(1)), addEntities([t(2), t(3), t(1, "dup")]));
    expect(s.ids()).toEqual([1, 2, 3]);
    expect(s.entities().map((e) => e.title)).toEqual(["t1", "t2", "t3"]);
    expect(s.entityMap()[2]).toEqual(t(2));
  });

  it("setEntity/setEntities replace or add; setAllEntities replaces the collection", () => {
    const s = build(Store);
    patchState(s, addEntities([t(1), t(2)]), setEntity(t(1, "new")), setEntities([t(2, "two"), t(3)]));
    expect(s.entities().map((e) => e.title)).toEqual(["new", "two", "t3"]);
    patchState(s, setAllEntities([t(9)]));
    expect(s.ids()).toEqual([9]);
    expect(s.entityMap()).toEqual({ 9: t(9) });
  });

  it("updates by id with an object or function, ignoring missing ids", () => {
    const s = build(Store);
    patchState(s, addEntities([t(1), t(2)]));
    patchState(s, updateEntity({ id: 1, changes: { done: true } }), updateEntity({ id: 2, changes: (e) => ({ title: e.title + "!" }) }), updateEntity({ id: 99, changes: { done: true } }));
    expect(s.entities()).toEqual([t(1, "t1", true), t(2, "t2!")]);
    expect(s.ids()).toEqual([1, 2]);
    // @ts-expect-error wrong change type
    updateEntity<Todo>({ id: 1, changes: { done: "yes" } });
  });

  it("updateEntities by ids or predicate, and updateAllEntities", () => {
    const s = build(Store);
    patchState(s, addEntities([t(1), t(2), t(3)]));
    patchState(s, updateEntities({ ids: [1, 2], changes: { done: true } }));
    patchState(s, updateEntities({ predicate: (e: Todo) => !e.done, changes: { title: "open" } }));
    expect(s.entities().map((e) => [e.title, e.done])).toEqual([["t1", true], ["t2", true], ["open", false]]);
    patchState(s, updateAllEntities({ done: false }));
    expect(s.entities().every((e) => !e.done)).toBe(true);
  });

  it("an update that changes the id keeps the position", () => {
    const s = build(Store);
    patchState(s, addEntities([t(1), t(2), t(3)]), updateEntity({ id: 2, changes: { id: 20 } }));
    expect(s.ids()).toEqual([1, 20, 3]);
    expect(Object.keys(s.entityMap()).sort()).toEqual(["1", "20", "3"]);
  });

  it("upsert adds or shallow-merges", () => {
    const s = build(Store);
    patchState(s, addEntity(t(1)), upsertEntity(t(1, "merged", true)), upsertEntities([t(2), { id: 1, title: "again", done: true }]));
    expect(s.entities()).toEqual([t(1, "again", true), t(2)]);
    expect(s.ids()).toEqual([1, 2]);
  });

  it("removes by id, ids, predicate, and all", () => {
    const s = build(Store);
    patchState(s, addEntities([t(1), t(2, "x", true), t(3), t(4, "y", true)]));
    patchState(s, removeEntity(1));
    expect(s.ids()).toEqual([2, 3, 4]);
    patchState(s, removeEntities((e: Todo) => e.done));
    expect(s.ids()).toEqual([3]);
    patchState(s, addEntities([t(5), t(6)]), removeEntities([5, 77]));
    expect(s.ids()).toEqual([3, 6]);
    expect(s.entityMap()).toEqual({ 3: t(3), 6: t(6) });
    patchState(s, removeAllEntities());
    expect(s.ids()).toEqual([]);
    expect(s.entityMap()).toEqual({});
  });

  it("does not touch other state, and no-op updaters leave readers asleep", () => {
    const s = build(Store);
    patchState(s, addEntity(t(1)), { query: "q" });
    const before = s.entities();
    patchState(s, addEntity(t(1)), removeEntity(42), updateEntity({ id: 42, changes: {} }));
    expect(s.entities()).toBe(before);
    expect(getState(s).query).toBe("q");
  });

  it("works through withMethods on the store", () => {
    class S extends signalStore(
      withEntities<Todo>(),
      withMethods((store) => ({ add: (todo: Todo) => patchState(store, addEntity(todo)) })),
      withComputed((store) => ({ count: () => store.entities().length })),
    ) {}
    const s = build(S);
    s.add(t(1));
    expect(s.count()).toBe(1);
  });

  it("accepts the config form with a type token", () => {
    const s = build(signalStore(withEntities({ entity: type<Todo>() })));
    patchState(s, addEntity(t(1)));
    expect(s.entities()).toEqual([t(1)]);
    expectTypeOf(s.entities()).toEqualTypeOf<Todo[]>();
  });
});

describe("selectId", () => {
  const Store = signalStore(withEntities<User>());
  it("uses selectId for every updater", () => {
    const s = build(Store);
    const u = (key: string, name = key): User => ({ key, name });
    patchState(s, addEntities([u("a"), u("b")], { selectId: selectKey }));
    patchState(s, updateEntity({ id: "a", changes: { name: "Ann" } }, { selectId: selectKey }), upsertEntity(u("c"), { selectId: selectKey }), setEntity(u("b", "Bo"), { selectId: selectKey }));
    expect(s.ids()).toEqual(["a", "b", "c"]);
    expect(s.entities().map((e) => e.name)).toEqual(["Ann", "Bo", "c"]);
    patchState(s, updateEntity({ id: "c", changes: { key: "z" } }, { selectId: selectKey }));
    expect(s.ids()).toEqual(["a", "b", "z"]);
    patchState(s, removeEntity("a"));
    expect(s.ids()).toEqual(["b", "z"]);
  });

  it("requires selectId when the entity has no id", () => {
    // @ts-expect-error User has no `id`; selectId is required
    addEntity({ key: "a", name: "A" });
    // @ts-expect-error selectId missing from config
    addEntity({ key: "a", name: "A" }, { collection: "user" });
    // @ts-expect-error selectId missing
    expect(() => patchState(build(Store), addEntity({ key: "a", name: "A" }))).toThrow(/no id/);
  });
});

describe("named collections", () => {
  const Store = signalStore(
    withEntities({ entity: type<Todo>(), collection: "todo" }),
    withEntities({ entity: type<User>(), collection: "user" }),
  );
  const todo = entityConfig({ entity: type<Todo>(), collection: "todo" });
  const user = entityConfig({ entity: type<User>(), collection: "user", selectId: selectKey });

  it("prefixes members and keeps collections independent", () => {
    const s = build(Store);
    patchState(s, addEntity({ id: 1, title: "a", done: false }, todo), addEntity({ key: "k", name: "K" }, user));
    expect(s.todoIds()).toEqual([1]);
    expect(s.userIds()).toEqual(["k"]);
    expect(s.todoEntityMap()[1]!.title).toBe("a");
    expect(s.userEntities()).toEqual([{ key: "k", name: "K" }]);
    expect("ids" in s).toBe(false);
    expectTypeOf(s.todoEntities()).toEqualTypeOf<Todo[]>();
    expectTypeOf(s.userEntities()).toEqualTypeOf<User[]>();
    expectTypeOf(s.todoIds).toEqualTypeOf<ReadonlySignal<EntityId[]>>();
  });

  it("every updater honours the collection", () => {
    const s = build(Store);
    patchState(
      s,
      addEntities([{ id: 1, title: "a", done: false }, { id: 2, title: "b", done: false }], todo),
      updateEntity({ id: 1, changes: { done: true } }, todo),
      upsertEntity({ id: 3, title: "c", done: false }, todo),
      setEntities([{ id: 2, title: "B", done: true }], todo),
      removeEntity(3, todo),
    );
    expect(s.todoEntities()).toEqual([{ id: 1, title: "a", done: true }, { id: 2, title: "B", done: true }]);
    patchState(s, updateEntities({ ids: [1], changes: { title: "A" } }, todo), updateAllEntities({ done: false }, todo), removeEntities([2], todo));
    expect(s.todoEntities()).toEqual([{ id: 1, title: "A", done: false }]);
    patchState(s, setAllEntities([{ id: 8, title: "z", done: false }], todo), upsertEntities([{ id: 8, title: "Z", done: false }], todo));
    expect(s.todoIds()).toEqual([8]);
    patchState(s, removeAllEntities(todo));
    expect(s.todoIds()).toEqual([]);
    expect(s.userIds()).toEqual([]);
  });

  it("an updater for the wrong collection does not type-check against the store", () => {
    const s = build(Store);
    const wrong = () =>
      // @ts-expect-error store has no default `ids`/`entityMap`
      patchState(s, addEntity({ id: 1, title: "a", done: false }));
    expect(wrong).toBeTypeOf("function");
  });

  it("rejects a duplicate collection name", () => {
    expect(() => build(signalStore(withEntities<Todo>(), withEntities<Todo>()))).toThrow(/declared twice/);
  });
});

describe("signalStoreFeature", () => {
  it("bundles features and exposes only their output", () => {
    const withCounter = signalStoreFeature(
      withState({ count: 0 }),
      withComputed((s) => ({ double: () => s.count() * 2 })),
      withMethods((s) => ({ inc: () => patchState(s, (x) => ({ count: x.count + 1 })) })),
    );
    class S extends signalStore(withCounter) {}
    const s = build(S);
    s.inc();
    s.inc();
    expect(s.count()).toBe(2);
    expect(s.double()).toBe(4);
    expectTypeOf(s.double()).toEqualTypeOf<number>();
    expectTypeOf(s.inc).toEqualTypeOf<() => void>();
  });

  it("typed input requirements: bundled features see the input, the store must provide it", () => {
    const withDouble = signalStoreFeature(
      { state: type<{ count: number }>() },
      withComputed((s) => ({ double: () => s.count() * 2 })),
      withMethods((s) => ({ reset: () => patchState(s, { count: 0 }) })),
    );
    class Ok extends signalStore(withState({ count: 3, other: "x" }), withDouble) {}
    const s = build(Ok);
    expect(s.double()).toBe(6);
    s.reset();
    expect(s.count()).toBe(0);
    expectTypeOf(s.other()).toEqualTypeOf<string>();
    expectTypeOf(s.double()).toEqualTypeOf<number>();

    // @ts-expect-error no `count` state
    signalStore(withState({ other: 1 }), withDouble);
    // @ts-expect-error count has the wrong type
    signalStore(withState({ count: "no" }), withDouble);
    // @ts-expect-error nothing before it
    signalStore(withDouble);
    expect(true).toBe(true);
  });

  it("input can require props and methods, and the result can wrap withEntities", () => {
    const withLog = signalStoreFeature(
      { props: type<{ total: ReadonlySignal<number> }>(), methods: type<{ ping(): string }>() },
      withMethods((s) => ({ log: () => `${s.total()}:${s.ping()}` })),
    );
    class S extends signalStore(
      withState({ n: 5 }),
      withComputed((s) => ({ total: () => s.n() })),
      withMethods(() => ({ ping: () => "pong" })),
      withLog,
    ) {}
    expect(build(S).log()).toBe("5:pong");
    // @ts-expect-error methods missing
    signalStore(withState({ n: 1 }), withComputed((s) => ({ total: () => s.n() })), withLog);

    const withTodos = signalStoreFeature(
      withEntities<Todo>(),
      withComputed((s) => ({ doneCount: () => s.entities().filter((t) => t.done).length })),
    );
    const todos = build(signalStore(withTodos));
    patchState(todos, addEntities<Todo>([{ id: 1, title: "a", done: true }]));
    expect(todos.doneCount()).toBe(1);
    expectTypeOf(todos.entities()).toEqualTypeOf<Todo[]>();
  });

  it("features keep their own injection context", () => {
    class Dep {
      static scope = "root";
      v = 7;
    }
    const withDep = signalStoreFeature(withMethods(() => {
        const dep = inject(Dep);
        return { v: () => dep.v };
      }));
    class S extends signalStore(withDep) {}
    expect(build(S).v()).toBe(7);
  });
});
