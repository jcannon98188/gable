import { describe, expect, it } from "vitest";
import { computed, effect, signal } from "@gable/core";
import { toSignal } from "@gable/core/rxjs";
import { Subject } from "rxjs";
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

  // Guard for the toSignal fan-in benchmark scenario (TASK-19): many toSignals feeding one
  // computed must cost one effect run per flush, however many sources emitted.
  it("runs one effect once per flush for a 1,000-toSignal fan-in", async () => {
    const subjects = Array.from({ length: 1000 }, () => new Subject<number>());
    const scope = createScope(null);
    let runs = 0;
    let total = -1;
    runInScope(scope, () => {
      const sigs = subjects.map((s) => toSignal(s, { initialValue: 0 }));
      const sum = computed(() => sigs.reduce((t, s) => t + s(), 0));
      effect(() => ((total = sum()), runs++));
    });
    expect(runs).toBe(1);
    for (const round of [1, 2, 3]) {
      for (const s of subjects) s.next(round);
      await whenFlushed();
      expect(total).toBe(1000 * round);
      expect(runs).toBe(1 + round);
    }
    scope.dispose();
  });
});
