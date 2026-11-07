import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catchError, debounceTime, distinctUntilChanged, EMPTY, filter, Observable, of, Subject, switchMap, tap, delay } from "rxjs";
import { inject, signal } from "@gable/core";
import { flushSync } from "@gable/core/internal";
import { createTestInjector } from "@gable/testing";
import { patchState, rxMethod, signalStore, withMethods, withState } from "./index.js";

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("rxMethod", () => {
  it("accepts plain values and runs the operator chain", () => {
    const injector = createTestInjector();
    const seen: number[] = [];
    const log = injector.run(() => rxMethod<number>(tap((n) => seen.push(n))));
    log(1);
    log(2);
    expect(seen).toEqual([1, 2]);
  });

  it("debounces a search fed by a signal", () => {
    const injector = createTestInjector();
    const query = signal("");
    const calls: string[] = [];
    injector.run(() => {
      const search = rxMethod<string>((q$) =>
        q$.pipe(debounceTime(300), distinctUntilChanged(), filter((q) => q.length > 0), tap((q) => calls.push(q))),
      );
      search(query);
    });
    flushSync();
    query.set("g");
    flushSync();
    query.set("ga");
    flushSync();
    query.set("gab");
    flushSync();
    vi.advanceTimersByTime(299);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["gab"]);
    injector.destroy();
  });

  it("forwards every Observable emission", () => {
    const injector = createTestInjector();
    const seen: string[] = [];
    const src = new Subject<string>();
    const sub = injector.run(() => {
      const m = rxMethod<string>(tap((s) => seen.push(s)));
      return m(src);
    });
    src.next("a");
    src.next("b");
    sub.unsubscribe();
    src.next("c");
    expect(seen).toEqual(["a", "b"]);
    expect(src.observed).toBe(false);
  });

  const Store = signalStore(
    withState({ items: [] as string[], loading: false, error: null as string | null }),
    withMethods((store) => {
      const fetchItems = (q: string) => of([`${q}-1`, `${q}-2`]).pipe(delay(50));
      return {
        load: rxMethod<string>((q$) =>
          q$.pipe(
            tap(() => patchState(store, { loading: true, error: null })),
            switchMap((q) =>
              (q === "bad" ? new Observable<string[]>((s) => s.error(new Error("boom"))) : fetchItems(q)).pipe(
                tap((items) => patchState(store, { items, loading: false })),
                catchError((e: Error) => {
                  patchState(store, { loading: false, error: e.message });
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),
      };
    }),
  );

  it("loads like an http call, switching to the latest request and handling errors", () => {
    const injector = createTestInjector();
    const store = injector.run(() => inject(class extends Store { static scope = "root"; }));
    store.load("a");
    expect(store.loading()).toBe(true);
    store.load("b");
    vi.advanceTimersByTime(50);
    expect(store.items()).toEqual(["b-1", "b-2"]);
    expect(store.loading()).toBe(false);
    store.load("bad");
    expect(store.error()).toBe("boom");
    store.load("c");
    vi.advanceTimersByTime(50);
    expect(store.items()).toEqual(["c-1", "c-2"]);
    injector.destroy();
  });

  it("unsubscribes everything when the owning scope is disposed", () => {
    const injector = createTestInjector();
    let teardowns = 0;
    const src = new Subject<number>();
    const count = signal(0);
    const seen: number[] = [];
    const m = injector.run(() =>
      rxMethod<number>((n$) =>
        n$.pipe(
          switchMap((n) => new Observable<number>((s) => { s.next(n); return () => void teardowns++; })),
          tap((n) => seen.push(n)),
        ),
      ),
    );
    m(src);
    m(count);
    flushSync();
    src.next(10);
    expect(seen).toEqual([0, 10]);
    injector.destroy();
    expect(teardowns).toBe(2); // 0 was switched out by 10; 10 torn down by disposal
    expect(src.observed).toBe(false);
    count.set(5);
    flushSync();
    src.next(11);
    m(12);
    expect(seen).toEqual([0, 10]);
  });

  it("throws outside a scope unless one is passed", () => {
    expect(() => rxMethod<number>(tap(() => {}))).toThrow(/setup/);
  });
});
