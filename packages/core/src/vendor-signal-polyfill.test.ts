import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// signal-polyfill is vendored (src/vendor/signal-polyfill) and compiled by core's own build so that `#brand in x`
// stays native. The published npm dist lowers it to __privateIn / __privateAdd (a WeakSet insert per construction).
describe("vendored signal-polyfill build", () => {
  it("keeps the public brand checks and basic graph behaviour", async () => {
    const { Signal } = await import("./vendor/signal-polyfill/index.js");
    const s = new Signal.State(1);
    const c = new Signal.Computed(() => s.get() * 2);
    const w = new Signal.subtle.Watcher(() => {});
    expect([Signal.isState(s), Signal.isState(c), Signal.isComputed(c), Signal.isComputed(s), Signal.isWatcher(w), Signal.isWatcher(s)]).toEqual([true, false, true, false, true, false]);
    expect(c.get()).toBe(2);
    s.set(4);
    expect(c.get()).toBe(8);
    expect(() => Signal.State.prototype.get.call({})).toThrow(TypeError);
  });

  it("emits native private brand checks, no __privateIn/__privateAdd helpers", () => {
    const pkg = fileURLToPath(new URL("..", import.meta.url));
    const out = mkdtempSync(join(tmpdir(), "gable-polyfill-"));
    const tsc = fileURLToPath(new URL("../../../node_modules/typescript/bin/tsc", import.meta.url));
    execFileSync(process.execPath, [tsc, "-p", join(pkg, "tsconfig.build.json"), "--outDir", out, "--tsBuildInfoFile", join(out, "x.tsbuildinfo")]);

    const dir = join(out, "vendor", "signal-polyfill");
    const js = readdirSync(dir).filter((f) => f.endsWith(".js"));
    expect(js).toContain("wrapper.js");
    const all = js.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    expect(all).toMatch(/#brand in /);
    expect(all).not.toMatch(/__privateIn|__privateAdd|__privateGet|__privateSet|__accessCheck/);

    // core itself must not import the npm package any more
    const signals = readFileSync(join(out, "signals.js"), "utf8");
    expect(signals).toContain("./vendor/signal-polyfill/index.js");
    expect(signals).not.toMatch(/from "signal-polyfill"/);
  }, 60_000);
});
