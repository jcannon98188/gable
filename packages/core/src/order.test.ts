import { describe, expect, it } from "vitest";
import { effect, signal } from "@gable/core";
import { createScope, runInScope, whenFlushed } from "@gable/core/internal";

describe("scheduler", () => {
  it("flushes parents before children regardless of creation order", async () => {
    const s = signal(0);
    const order: string[] = [];
    const parent = createScope(null);
    const child = createScope(parent);
    runInScope(child, () => effect(() => (s(), order.push("child"))));
    runInScope(parent, () => effect(() => (s(), order.push("parent"))));
    order.length = 0;
    s.set(1);
    s.set(2);
    await whenFlushed();
    expect(order).toEqual(["parent", "child"]);
  });

  it("disposing a scope stops its effects", async () => {
    const s = signal(0);
    let runs = 0;
    const scope = createScope(null);
    runInScope(scope, () => effect(() => (s(), runs++)));
    scope.dispose();
    s.set(1);
    await whenFlushed();
    expect(runs).toBe(1);
  });
});
