import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@gable/testing";
import { SignalsDemo } from "./signals-demo.js";
import { RxjsDemo, StreamHub } from "./rxjs-demo.js";
import { ExpressionsDemo, check } from "./expressions-demo.js";
import { FrameworkDemos } from "./framework-demos.js";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SignalsDemo", () => {
  it("runs each computed once per change and shows the counts", async () => {
    const f = mount(SignalsDemo);
    await f.flush();
    const demo = f.instance as SignalsDemo;
    expect(demo.runs()).toEqual({ sum: 1, product: 1, parity: 1 });
    demo.bump("a", 1);
    await f.flush();
    expect(demo.sum()).toBe(6);
    expect(demo.runs()).toEqual({ sum: 2, product: 2, parity: 2 });
    expect(demo.parity()).toBe("even");
    expect(f.text()).toContain("even");
  });

  it("re-runs the parity computed without changing its value when a moves by 2", async () => {
    const f = mount(SignalsDemo);
    await f.flush();
    const demo = f.instance as SignalsDemo;
    expect(demo.parity()).toBe("odd");
    demo.bump("a", 2);
    await f.flush();
    expect(demo.parity()).toBe("odd");
    expect(demo.runs().parity).toBe(2);
  });
});

describe("RxjsDemo", () => {
  it("shows the bound stream values and drops the subscription count when the component is removed", async () => {
    const f = mount(RxjsDemo);
    await vi.advanceTimersByTimeAsync(10);
    const hub = f.injector.get(StreamHub)!;
    expect(hub.active()).toBe(2);
    expect(f.text()).toContain("tick 0");
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.text()).toContain("tick 2");

    (f.instance as RxjsDemo).toggle();
    await vi.advanceTimersByTimeAsync(10);
    expect(hub.active()).toBe(0);
    expect(f.text()).toContain("unsubscribed from ticker$");

    (f.instance as RxjsDemo).toggle();
    await vi.advanceTimersByTimeAsync(10);
    expect(hub.active()).toBe(2);
  });

  it("debounces typing, switches to the latest query and counts the request it cancelled", async () => {
    const f = mount(RxjsDemo);
    await vi.advanceTimersByTimeAsync(10);
    const input = f.query("input")!;
    f.type(input, "ap");
    await vi.advanceTimersByTimeAsync(300); // debounce passed, request in flight
    f.type(input, "gr");
    await vi.advanceTimersByTimeAsync(300); // second debounce passed: switchMap cancels the first request
    await vi.advanceTimersByTimeAsync(500);
    expect(f.injector.get(StreamHub)!.cancelled()).toBe(1);
    expect(f.text()).toContain("grape");
    expect(f.text()).not.toContain("apricot");
  });
});

describe("ExpressionsDemo", () => {
  it("evaluates an allowed expression through the real runtime and follows the sample's signals", async () => {
    const f = mount(ExpressionsDemo);
    await f.flush();
    const demo = f.instance as ExpressionsDemo;
    f.type(f.query("input")!, "doubled()");
    await f.flush();
    expect(f.text()).toContain("Parsed as call");
    expect(f.text()).toContain("6");
    demo.inc();
    await f.flush();
    expect(f.text()).toContain("8");
  });

  it("reports the parser's own error and a computed alternative for each rejected form", async () => {
    const f = mount(ExpressionsDemo);
    await f.flush();
    const demo = f.instance as ExpressionsDemo;
    const expected: Record<string, string> = {
      'user.admin ? "Admin" : "Guest"': "conditional operator",
      "count() * 2": 'operator "*"',
      "format(count())": "no arguments",
      "count() == 3": "Use \"===\"",
    };
    for (const r of demo.rejected) {
      demo.use(r.source);
      await f.flush();
      expect(f.text(), r.source).toContain(expected[r.source]!);
      expect(f.text(), r.source).toContain(r.fix);
      demo.use(r.fix);
      await f.flush();
      expect(demo.parsed().ok, r.fix).toBe(true);
    }
  });

  it("shows a runtime failure instead of throwing", async () => {
    const f = mount(ExpressionsDemo);
    await f.flush();
    f.type(f.query("input")!, "nope");
    await f.flush();
    await Promise.resolve();
    await f.flush();
    expect(f.text()).toContain("Unknown name");
  });

  it("checks expressions with the shared parser", () => {
    expect(check("count() >= 3 && user.admin")).toEqual({ ok: true, kind: "logical" });
    expect(check("a ? b : c").ok).toBe(false);
    expect(check("").ok).toBe(false);
  });
});

describe("FrameworkDemos", () => {
  it("mounts all three demos", async () => {
    const f = mount(FrameworkDemos);
    await f.flush();
    expect(f.query("signals-demo")).toBeTruthy();
    expect(f.query("rxjs-demo")).toBeTruthy();
    expect(f.query("expressions-demo")).toBeTruthy();
  });
});
