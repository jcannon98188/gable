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
    store.add("a1");
    store.same(); // nothing changed: no entry
    store.add("b2");
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
