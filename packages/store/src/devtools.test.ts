import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inject } from "@gable/core";
import { createDevtools, type DevtoolsInstance, type InspectorInfo } from "@gable/core/devtools";
import { createTestInjector } from "@gable/testing";
import { patchState, signalStore, withDevtools, withMethods, withState } from "./index.js";

let dt: DevtoolsInstance;
beforeEach(() => {
  dt = createDevtools(globalThis as never);
});
afterEach(() => dt.dispose());

const inspectors = () => dt.hook.call("inspectors", undefined) as InspectorInfo[];

class CartStore extends signalStore(
  withState({ items: [] as string[], coupon: null as string | null }),
  withMethods((store) => ({
    add: (sku: string) => patchState(store, (s) => ({ items: [...s.items, sku] })),
    same: () => patchState(store, { coupon: null }),
  })),
  withDevtools("Cart"),
) {
  static scope = "root";
}

describe("withDevtools", () => {
  it("registers an inspector with the current state and logs each changing patch", () => {
    const injector = createTestInjector();
    const store = injector.run(() => inject(CartStore));
    expect(inspectors().map((i) => [i.id, i.label])).toEqual([["Cart", "Cart"]]);
    patchState(store, { items: ["a1"] });
    patchState(store, { coupon: null }); // nothing changed: no entry
    patchState(store, { items: ["a1", "b2"] });
    const info = inspectors()[0]!;
    expect(JSON.stringify(info.snapshot)).toContain("b2");
    expect(info.log.map((e) => e.type)).toEqual(["patch", "patch"]);
    expect(JSON.stringify(info.log[0]!.data)).toContain("a1");
    expect(JSON.stringify(info.log[0]!.data)).not.toContain("coupon");
  });

  it("removes the inspector when the store is destroyed", () => {
    const injector = createTestInjector();
    injector.run(() => inject(CartStore));
    expect(inspectors()).toHaveLength(1);
    injector.destroy();
    expect(inspectors()).toHaveLength(0);
  });

  it("does nothing without the devtools hook on the page", () => {
    dt.dispose();
    const injector = createTestInjector();
    const store = injector.run(() => inject(CartStore));
    expect(() => store.add("a1")).not.toThrow();
    expect(store.items()).toEqual(["a1"]);
  });
});

describe("withDevtools actions", () => {
  class Todos extends signalStore(
    withState({ items: [] as string[], busy: false }),
    withMethods((store) => ({
      add: (sku: string, opts: { qty: number }) => {
        patchState(store, { busy: true });
        patchState(store, (s) => ({ items: [...s.items, sku], busy: false }));
        return opts.qty;
      },
      fail: (): void => {
        patchState(store, { busy: true });
        throw new Error("nope");
      },
      noop: () => 1,
    })),
    withDevtools("Todos"),
  ) {}

  it("logs a method call with its args and groups the patches it made", () => {
    const store = createTestInjector().run(() => new Todos());
    expect(store.add("a1", { qty: 2 })).toBe(2);
    store.noop();
    patchState(store, { busy: true });
    const log = inspectors()[0]!.log;
    expect(log.map((e) => e.type)).toEqual(["action", "action", "patch"]);
    const first = JSON.stringify(log[0]!.data);
    expect(first).toContain("add");
    expect(first).toContain("a1");
    expect(first).toContain("qty");
    expect(first.indexOf("busy")).toBeLessThan(first.indexOf("items")); // both patches sit inside the action entry
    expect(JSON.stringify(log[1]!.data)).toContain("noop");
    expect(JSON.stringify(log[2]!.data)).not.toContain("noop");
  });

  it("records a failing call with its error and rethrows", () => {
    const store = createTestInjector().run(() => new Todos());
    expect(() => store.fail()).toThrow("nope");
    const entry = inspectors()[0]!.log[0]!;
    expect(entry.type).toBe("action");
    expect(JSON.stringify(entry.data)).toContain("nope");
  });
});
