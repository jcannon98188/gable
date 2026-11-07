import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "@gable/core";
import { createTestInjector } from "@gable/testing";
import { getState, patchState, signalStore, withHotState, withMethods, withState, withStorage, type StorageLike } from "./index.js";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function make(storage: StorageLike, options: Record<string, unknown> = {}) {
  class Prefs extends signalStore(
    withState({ theme: "light", draft: "", count: 0 }),
    withMethods((store) => ({ setTheme: (theme: string) => patchState(store, { theme }), setDraft: (draft: string) => patchState(store, { draft }), bump: () => patchState(store, (s) => ({ count: s.count + 1 })) })),
    withStorage("prefs", { storage, keys: ["theme", "count"], ...options }),
  ) {}
  const injector = createTestInjector();
  const store = injector.run(() => new Prefs());
  return { store, injector };
}

const saved = (s: MemoryStorage) => JSON.parse(s.data.get("prefs")!);

describe("withStorage", () => {
  it("hydrates the chosen keys on init and ignores the rest", () => {
    const s = new MemoryStorage();
    s.setItem("prefs", JSON.stringify({ v: 0, state: { theme: "dark", draft: "x", count: 3 } }));
    const { store } = make(s);
    expect(store.theme()).toBe("dark");
    expect(store.count()).toBe(3);
    expect(store.draft()).toBe("");
  });

  it("writes only chosen keys, debounced", () => {
    const s = new MemoryStorage();
    const { store } = make(s, { debounce: 50 });
    store.setTheme("dark");
    store.bump();
    expect(s.data.size).toBe(0);
    vi.advanceTimersByTime(50);
    expect(saved(s)).toEqual({ v: 0, state: { theme: "dark", count: 1 } });
    const spy = vi.spyOn(s, "setItem");
    store.setDraft("not persisted");
    vi.advanceTimersByTime(100);
    expect(spy).not.toHaveBeenCalled();
  });

  it("writes synchronously with debounce 0 and flushes on destroy", () => {
    const s = new MemoryStorage();
    const a = make(s, { debounce: 0 });
    a.store.setTheme("dark");
    expect(saved(s).state.theme).toBe("dark");
    const s2 = new MemoryStorage();
    const b = make(s2);
    b.store.setTheme("dark");
    b.injector.destroy();
    expect(saved(s2).state.theme).toBe("dark");
  });

  it("migrates data saved under another version, or discards it without migrate", () => {
    const s = new MemoryStorage();
    s.setItem("prefs", JSON.stringify({ v: 1, state: { colour: "dark", count: 2 } }));
    const migrated = make(s, { version: 2, migrate: (old: Record<string, unknown>, v: number) => (v === 1 ? { theme: old.colour, count: old.count } : old) });
    expect(migrated.store.theme()).toBe("dark");
    expect(migrated.store.count()).toBe(2);
    const discarded = make(s, { version: 3 });
    expect(discarded.store.theme()).toBe("light");
  });

  it("survives corrupt data, a throwing migrate and failing storage", () => {
    const s = new MemoryStorage();
    s.setItem("prefs", "{nope");
    expect(make(s).store.theme()).toBe("light");
    s.setItem("prefs", JSON.stringify({ v: 0, state: { theme: "dark" } }));
    expect(make(s, { version: 1, migrate: () => { throw new Error("bad"); } }).store.theme()).toBe("light");
    const broken: StorageLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    const { store } = make(broken, { debounce: 0 });
    expect(() => store.setTheme("dark")).not.toThrow();
    expect(store.theme()).toBe("dark");
  });

  it("does nothing when storage is unavailable (SSR)", () => {
    const { store } = make(undefined as never, { storage: () => undefined });
    store.setTheme("dark");
    expect(store.theme()).toBe("dark");
    vi.stubGlobal("localStorage", undefined);
    class P extends signalStore(withState({ a: 1 }), withStorage("k")) {}
    expect(() => createTestInjector().run(() => new P())).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("uses globalThis.localStorage by default and applies other tabs' changes with sync", () => {
    const s = new MemoryStorage();
    const listeners = new Map<string, (e: unknown) => void>();
    vi.stubGlobal("localStorage", s);
    vi.stubGlobal("addEventListener", (t: string, fn: (e: unknown) => void) => listeners.set(t, fn));
    vi.stubGlobal("removeEventListener", (t: string) => listeners.delete(t));
    class P extends signalStore(withState({ theme: "light" }), withStorage("prefs", { sync: true, debounce: 0 })) {}
    const injector = createTestInjector();
    const store = injector.run(() => new P());
    const spy = vi.spyOn(s, "setItem");
    listeners.get("storage")!({ key: "prefs", storageArea: s, newValue: JSON.stringify({ v: 0, state: { theme: "dark" } }) });
    expect(store.theme()).toBe("dark");
    expect(spy).not.toHaveBeenCalled(); // no echo back to storage
    listeners.get("storage")!({ key: "other", storageArea: s, newValue: JSON.stringify({ v: 0, state: { theme: "x" } }) });
    expect(store.theme()).toBe("dark");
    injector.destroy();
    expect(listeners.has("storage")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("lets withHotState win when it comes after", () => {
    const s = new MemoryStorage();
    s.setItem("prefs", JSON.stringify({ v: 0, state: { theme: "dark" } }));
    class P extends signalStore(withState({ theme: "light" }), withStorage("prefs", { storage: s }), withHotState({ url: "x", hot: undefined }, "P")) {}
    expect(getState(createTestInjector().run(() => new P()))).toEqual({ theme: "dark" });
  });
});
