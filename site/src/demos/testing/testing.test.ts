import { describe, expect, it } from "vitest";
import { mount } from "@gable/testing";
import { BrokenCounter, Counter, TestingDemo, expectEqual } from "./testing-demo.js";

describe("TestingDemo", () => {
  it("runs the tests against the real test renderer and passes", async () => {
    const f = mount(TestingDemo);
    await f.settle();
    await new Promise((r) => setTimeout(r, 20));
    await f.settle();
    expect(f.text()).toContain("3 passed");
    expect(f.text()).toContain("counts three clicks");
    expect(f.text()).toContain("<button");
  });

  it("fails the tests when the bug is introduced", async () => {
    const f = mount(TestingDemo);
    await f.settle();
    await new Promise((r) => setTimeout(r, 20));
    const demo = f.instance as TestingDemo;
    demo.toggle();
    await new Promise((r) => setTimeout(r, 20));
    await f.settle();
    expect(demo.results().map((r) => r.ok)).toEqual([true, false, false]);
    expect(f.text()).toContain("2 failed, 1 passed");
    expect(f.text()).toContain('expected "Count: 1", got "Count: 2"');
  });

  it("the subject components behave as described", async () => {
    for (const [C, expected] of [[Counter, "Count: 1"], [BrokenCounter, "Count: 2"]] as const) {
      const f = mount(C);
      f.dispatch(f.query("button")!, "click");
      await f.flush();
      expectEqual(f.text(), expected);
    }
    expect(() => expectEqual(1, 2)).toThrow("expected 2, got 1");
  });
});
