import { describe, expect, expectTypeOf, it } from "vitest";
import { effect, html, inject, type ReadonlySignal } from "@gable/core";
import { createTestInjector, mount } from "@gable/testing";
import { getState, patchState, signalStore, withComputed, withHooks, withHotState, withMethods, withState, type DeepSignal } from "./index.js";

interface Todo {
  id: number;
  done: boolean;
}

class Clock {
  static scope = "root";
  now = () => 42;
}

const TodoStoreBase = signalStore(
  withState({ user: { name: "Ada", address: { city: "London" } }, todos: [] as Todo[], filter: "all" as "all" | "done", selected: null as Todo | null }),
  withComputed((store) => ({
    remaining: () => store.todos().filter((t) => !t.done).length,
    summary: () => ({ count: store.todos().length, label: `${store.user.name()} has ${store.todos().length}` }),
  })),
  withMethods((store) => {
    const clock = inject(Clock);
    return {
      add(id: number) {
        patchState(store, (s) => ({ todos: [...s.todos, { id, done: false }] }));
      },
      rename(name: string) {
        patchState(store, (s) => ({ user: { ...s.user, name } }));
      },
      stamp: () => clock.now(),
    };
  }),
);

class TodoStore extends TodoStoreBase {
  static scope = "root";
}

const newStore = () => createTestInjector().run(() => inject(TodoStore));

describe("types", () => {
  it("infers members", () => {
    const store = newStore();
    expectTypeOf(store.filter).toEqualTypeOf<DeepSignal<"all" | "done">>();
    expectTypeOf(store.filter()).toEqualTypeOf<"all" | "done">();
    expectTypeOf(store.user.name()).toEqualTypeOf<string>();
    expectTypeOf(store.user.address.city()).toEqualTypeOf<string>();
    expectTypeOf(store.todos()).toEqualTypeOf<Todo[]>();
    expectTypeOf(store.selected()).toEqualTypeOf<Todo | null>();
    expectTypeOf(store.remaining()).toEqualTypeOf<number>();
    expectTypeOf(store.summary.count()).toEqualTypeOf<number>();
    expectTypeOf(store.add).parameters.toEqualTypeOf<[id: number]>();
    expectTypeOf(store.stamp).returns.toEqualTypeOf<number>();
    expectTypeOf(getState(store).user.name).toEqualTypeOf<string>();
  });

  it("state signals are read-only", () => {
    const store = newStore();
    expectTypeOf(store.filter).toExtend<ReadonlySignal<string>>();
    // @ts-expect-error no set on state signals
    expect(() => store.filter.set("done")).toThrow();
    // @ts-expect-error computed is read-only too
    expect(() => store.remaining.set(1)).toThrow();
    // @ts-expect-error unknown key
    patchState(store, { nope: 1 });
    // @ts-expect-error wrong value type
    patchState(store, { filter: "other" });
    // @ts-expect-error a plain object is not a store
    expect(() => patchState({ a: 1 }, { a: 2 })).toThrow();
  });

  it("features see the members of earlier features", () => {
    const S = signalStore(
      withState({ n: 1 }),
      withMethods((store) => ({ inc: () => patchState(store, { n: store.n() + 1 }) })),
      withHooks((store) => ({
        onInit() {
          expectTypeOf(store.n()).toEqualTypeOf<number>();
          expectTypeOf(store.inc).toBeFunction();
          // @ts-expect-error not declared yet
          void store.missing;
        },
      })),
    );
    expect(S).toBeTypeOf("function");
  });
});

describe("state and patchState", () => {
  it("reads deep signals and writes only through patchState", () => {
    const store = newStore();
    expect(store.user.name()).toBe("Ada");
    expect(store.user.address.city()).toBe("London");
    expect(store.filter()).toBe("all");
    expect(Object.keys(store)).toEqual(expect.arrayContaining(["user", "todos", "remaining", "add"]));
    expect((store.filter as unknown as { set?: unknown }).set).toBeUndefined();
    patchState(store, { filter: "done" }, { selected: { id: 9, done: true } });
    expect(store.filter()).toBe("done");
    expect(store.selected()?.id).toBe(9);
    expect(getState(store).filter).toBe("done");
  });

  it("applies updater functions in order against the latest state", () => {
    const store = newStore();
    patchState(
      store,
      (s) => ({ todos: [...s.todos, { id: 1, done: false }] }),
      (s) => ({ todos: [...s.todos, { id: s.todos.length + 1, done: true }] }),
    );
    expect(store.todos().map((t) => t.id)).toEqual([1, 2]);
    expect(store.remaining()).toBe(1);
  });

  it("deep signals are cached and track nested changes; unchanged keys do not re-run effects", async () => {
    const store = newStore();
    const city = store.user.address.city;
    expect(store.user.address.city).toBe(city);
    const seen: string[] = [];
    effect(() => void seen.push(city()));
    store.rename("Grace"); // the address object is reused: city is unchanged
    await Promise.resolve();
    expect(store.user.name()).toBe("Grace");
    expect(seen).toEqual(["London"]);
    patchState(store, (s) => ({ user: { ...s.user, address: { city: "Paris" } } }));
    await Promise.resolve();
    expect(store.user.address.city()).toBe("Paris");
    expect(seen).toEqual(["London", "Paris"]);
  });

  it("falls back to the signal's own properties when a key is not in the state", () => {
    const store = newStore();
    expect(typeof store.user.name.call).toBe("function");
    expect((store.todos as unknown as { length: number }).length).toBe(0); // function length: arrays are not deep
    expect((store.filter as unknown as { missing?: unknown }).missing).toBeUndefined();
  });

  it("only plain objects are deep", () => {
    const store = newStore();
    expect(store.selected()).toBeNull();
    expect((store.selected as unknown as { id?: unknown }).id).toBeUndefined();
    patchState(store, { selected: { id: 1, done: false } });
    expect((store.selected as unknown as { id: () => number }).id()).toBe(1); // typed as Todo | null, so only reachable by cast
  });

  it("rejects duplicate member names", () => {
    const Dup = signalStore(withState({ a: 1 }), withMethods(() => ({ a: () => 1 })));
    expect(() => createTestInjector([Dup]).run(() => inject(Dup))).toThrow(/declared twice/);
    const Dup2 = signalStore(withState({ a: 1 }), withState({ a: 2 }));
    expect(() => createTestInjector([Dup2]).run(() => inject(Dup2))).toThrow(/declared twice/);
  });

  it("supports a state factory and several withState calls", () => {
    const S = signalStore(
      withState(() => ({ a: inject(Clock).now() })),
      withState({ b: 2 }),
    );
    const store = createTestInjector([S]).run(() => inject(S));
    expect(store.a()).toBe(42);
    expect(getState(store)).toEqual({ a: 42, b: 2 });
  });
});

describe("injection scopes", () => {
  it("a root-scoped store is a singleton and sees root services", () => {
    const injector = createTestInjector();
    const a = injector.run(() => inject(TodoStore));
    expect(injector.run(() => inject(TodoStore))).toBe(a);
    expect(a.stamp()).toBe(42);
  });

  it("an unscoped store needs a provider, and each provider gets its own instance", () => {
    const S = signalStore(withState({ n: 0 }));
    expect(() => createTestInjector().run(() => inject(S))).toThrow(/No provider/);
    const injector = createTestInjector([S]);
    const child = injector.createChild([S]);
    const a = injector.run(() => inject(S));
    const b = child.run(() => inject(S));
    expect(a).not.toBe(b);
    patchState(a, { n: 1 });
    expect(b.n()).toBe(0);
  });
});

describe("hooks", () => {
  it("runs onInit after all features, and onDestroy when the injector is destroyed", () => {
    const log: string[] = [];
    const S = signalStore(
      withState({ n: 1 }),
      withHooks((store) => {
        log.push("factory");
        return { onInit: () => log.push(`init ${store.n()}`), onDestroy: () => log.push("destroy1") };
      }),
      withMethods((store) => ({ bump: () => patchState(store, { n: store.n() + 1 }) })),
      withHooks({
        onInit: (store) => {
          log.push(`init2 ${typeof store.bump}`);
          store.bump();
        },
        onDestroy: () => log.push("destroy2"),
      }),
    );
    const injector = createTestInjector([S]);
    const store = injector.run(() => inject(S));
    expect(log).toEqual(["factory", "init 1", "init2 function"]);
    expect(store.n()).toBe(2);
    injector.destroy();
    expect(log.slice(3)).toEqual(["destroy1", "destroy2"]); // declaration order
  });

  it("effects created in onInit are owned by the store's scope", async () => {
    const seen: number[] = [];
    const S = signalStore(
      withState({ n: 0 }),
      withHooks({ onInit: (store) => effect(() => void seen.push(store.n())) }),
    );
    const injector = createTestInjector([S]);
    const store = injector.run(() => inject(S));
    patchState(store, { n: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([0, 1]);
    injector.destroy();
    patchState(store, { n: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([0, 1]);
  });
});

describe("components (in-memory renderer)", () => {
  const CounterStore = signalStore(
    withState({ count: 0, user: { name: "Ada" } }),
    withComputed((s) => ({ double: () => s.count() * 2, greeting: () => `Hi ${s.user.name()}` })),
    withMethods((s) => ({
      inc: () => patchState(s, (x) => ({ count: x.count + 1 })),
      rename: (name: string) => patchState(s, (x) => ({ user: { ...x.user, name } })),
    })),
  );

  it("renders signals and computed values, and event handlers call methods", async () => {
    class Counter {
      static meta = {
        selector: "app-counter",
        providers: [CounterStore],
        template: html`<button (click)="store.inc()">+</button><p class="v">{{ store.count() }}/{{ store.double() }}/{{ store.user.name() }}/{{ store.greeting() }}</p>`,
      };
      store = inject(CounterStore);
    }
    const fixture = mount(Counter);
    expect(fixture.text()).toBe("+0/0/Ada/Hi Ada");
    fixture.dispatch(fixture.query("button")!, "click");
    await fixture.flush();
    expect(fixture.text()).toBe("+1/2/Ada/Hi Ada");
    fixture.instance.store.rename("Grace");
    await fixture.flush();
    expect(fixture.text()).toBe("+1/2/Grace/Hi Grace");
  });

  it("a component-provided store is per instance and destroyed with the component", () => {
    const log: string[] = [];
    const Hooked = signalStore(withState({ n: 0 }), withHooks({ onInit: () => log.push("init"), onDestroy: () => log.push("destroy") }));
    class Host {
      static meta = { selector: "app-host", providers: [Hooked], template: html`<i>{{ store.n() }}</i>` };
      store = inject(Hooked);
    }
    const fixture = mount(Host);
    expect(log).toEqual(["init"]);
    fixture.destroy();
    expect(log).toEqual(["init", "destroy"]);
  });

  it("two components share a root store through inject()", async () => {
    class Shared extends CounterStore {
      static scope = "root";
    }
    class Child {
      static meta = { selector: "app-child", template: html`<b>{{ store.count() }}</b>` };
      store = inject(Shared);
    }
    class Parent {
      static meta = { selector: "app-parent", imports: [Child], template: html`<app-child /><span>{{ store.count() }}</span>` };
      store = inject(Shared);
    }
    const fixture = mount(Parent);
    fixture.instance.store.inc();
    await fixture.flush();
    expect(fixture.text()).toBe("11");
  });
});

describe("withHotState", () => {
  const version = (extra: Record<string, unknown> = {}, meta = { url: "file:///src/hot-store.ts?t=1", hot: {} }, options = {}) =>
    class HotStore extends signalStore(
      withState({ count: 0, name: "a", ...extra }),
      withHotState(meta, "HotStore", options),
      withMethods((store) => ({ inc: () => patchState(store, (s) => ({ count: s.count + 1 })) })),
    ) {
      static scope = "root";
    };

  it("a re-evaluated store module starts from the previous state", () => {
    const V1 = version();
    const a = createTestInjector([]).get(V1)!;
    a.inc();
    a.inc();
    const V2 = version({}, { url: "file:///src/hot-store.ts?t=2", hot: {} });
    const b = createTestInjector([]).get(V2)!;
    expect(b.count()).toBe(2);
    b.inc();
    const V3 = version({}, { url: "file:///src/hot-store.ts?t=3", hot: {} });
    expect(createTestInjector([]).get(V3)!.count()).toBe(3);
  });

  it("keeps new keys at their initial value and drops removed ones; reset starts fresh", () => {
    const meta = (t: number) => ({ url: `file:///src/shape.ts?t=${t}`, hot: {} });
    const make = (shape: Record<string, unknown>, t: number, options = {}) =>
      class S extends signalStore(withState(shape), withHotState(meta(t), "S", options)) {
        static scope = "root";
      };
    const a: any = createTestInjector([]).get(make({ x: 1, y: 2 }, 1));
    patchState(a, { x: 10, y: 20 });
    const b: any = createTestInjector([]).get(make({ x: 1, z: 3 }, 2));
    expect(getState(b)).toEqual({ x: 10, z: 3 });
    const c: any = createTestInjector([]).get(make({ x: 1 }, 3, { reset: true }));
    expect(getState(c)).toEqual({ x: 1 });
  });

  it("does nothing without import.meta.hot", () => {
    const meta = { url: "file:///src/prod.ts" };
    const P = (): any => createTestInjector([]).get(version({}, meta as never));
    P().inc();
    expect(P().count()).toBe(0);
  });
});
