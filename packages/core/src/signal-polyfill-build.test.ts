import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { Signal } from "signal-polyfill";

// signal-polyfill 0.2.2 was published without a build target, so `#brand in x` was lowered to __privateIn and every
// construction paid a __privateAdd (a WeakSet insert). 0.2.3 builds for ES2022 and keeps the checks native. This guards
// against a downgrade or a dependency that pulls the slow build back in.
describe("installed signal-polyfill build", () => {
  it("keeps the public brand checks and basic graph behaviour", () => {
    const s = new Signal.State(1);
    const c = new Signal.Computed(() => s.get() * 2);
    const w = new Signal.subtle.Watcher(() => {});
    expect([Signal.isState(s), Signal.isState(c), Signal.isComputed(c), Signal.isComputed(s), Signal.isWatcher(w), Signal.isWatcher(s)]).toEqual([true, false, true, false, true, false]);
    expect(c.get()).toBe(2);
    s.set(4);
    expect(c.get()).toBe(8);
    expect(() => Signal.State.prototype.get.call({})).toThrow(TypeError);
  });

  it("ships native private brand checks, no __privateIn/__privateAdd helpers", () => {
    const entry = createRequire(import.meta.url).resolve("signal-polyfill");
    const js = readFileSync(entry, "utf8");
    expect(js).toMatch(/#brand in /);
    expect(js).not.toMatch(/__privateIn|__privateAdd|__privateGet|__privateSet|__accessCheck/);
  });
});
