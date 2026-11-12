import { describe, expect, it } from "vitest";
import { createScope, runInScope } from "@gable/core/internal";
import { Frame, MAX_FRAME_DT } from "./frame.js";

describe("Frame service", () => {
  it("runs onFrame hooks with the frame's dt in seconds", () => {
    const frame = new Frame();
    const seen: number[] = [];
    frame.onFrame((dt) => seen.push(dt));
    frame.advance(0.016);
    frame.advance(0.02);
    expect(seen).toEqual([0.016, 0.02]);
  });

  it("returns an unsubscribe function", () => {
    const frame = new Frame();
    let n = 0;
    const off = frame.onFrame(() => n++);
    frame.advance(0.01);
    off();
    frame.advance(0.01);
    expect(n).toBe(1);
  });

  it("removes a hook with the scope it was registered in", () => {
    const frame = new Frame();
    let n = 0;
    const scope = createScope(null);
    runInScope(scope, () => frame.onFrame(() => n++));
    frame.advance(0.01);
    scope.dispose();
    frame.advance(0.01);
    expect(n).toBe(1);
  });

  it("clamps dt to the maximum", () => {
    const frame = new Frame();
    const seen: number[] = [];
    frame.onFrame((dt) => seen.push(dt));
    frame.advance(2);
    expect(seen).toEqual([MAX_FRAME_DT]);
    expect(MAX_FRAME_DT).toBeCloseTo(0.05);
  });

  it("a hook added during a frame first runs next frame; one removed during a frame does not run", () => {
    const frame = new Frame();
    const log: string[] = [];
    let offB = () => {};
    frame.onFrame(() => {
      log.push("a");
      frame.onFrame(() => log.push("late"));
      offB();
    });
    offB = frame.onFrame(() => log.push("b"));
    frame.advance(0.01);
    expect(log).toEqual(["a"]);
    frame.advance(0.01);
    expect(log).toEqual(["a", "a", "late"]);
  });

  describe("onFixedStep", () => {
    it("runs 0..n steps per frame from an accumulator", () => {
      const frame = new Frame();
      let steps = 0;
      frame.onFixedStep(60, () => steps++);
      frame.advance(0.005);
      expect(steps).toBe(0);
      frame.advance(0.005);
      frame.advance(0.005);
      expect(steps).toBe(0); // 15 ms < 16.7 ms
      frame.advance(0.002);
      expect(steps).toBe(1);
    });

    it("100 ms of frames yields six 60 Hz steps, each with dt 1/60", () => {
      const frame = new Frame();
      const dts: number[] = [];
      frame.onFixedStep(60, (dt) => dts.push(dt));
      frame.advance(0.05);
      frame.advance(0.05);
      expect(dts).toHaveLength(6);
      expect(dts.every((d) => d === 1 / 60)).toBe(true);
    });

    it("six 16.67 ms frames also yield six steps", () => {
      const frame = new Frame();
      let steps = 0;
      frame.onFixedStep(60, () => steps++);
      for (let i = 0; i < 6; i++) frame.advance(1 / 60);
      expect(steps).toBe(6);
    });

    it("passes the interpolation alpha, the unspent fraction of a step", () => {
      const frame = new Frame();
      const alphas: number[] = [];
      frame.onFixedStep(40, (_dt, alpha) => alphas.push(alpha)); // a step is 25 ms
      frame.advance(0.0375); // one step, 12.5 ms left: half a step
      expect(alphas).toHaveLength(1);
      expect(alphas[0]).toBeCloseTo(0.5);
    });

    it("keeps the accumulator when its hooks are removed and registered again (a rebuild)", () => {
      const frame = new Frame();
      let steps = 0;
      let off = frame.onFixedStep(10, () => steps++);
      frame.advance(0.04);
      off();
      off = frame.onFixedStep(10, () => steps++);
      frame.advance(0.04);
      expect(steps).toBe(0);
      frame.advance(0.03);
      expect(steps).toBe(1);
    });

    it("is removed with its scope", () => {
      const frame = new Frame();
      let steps = 0;
      const scope = createScope(null);
      runInScope(scope, () => frame.onFixedStep(60, () => steps++));
      scope.dispose();
      frame.advance(0.05);
      expect(steps).toBe(0);
    });

    it("rejects a non-positive rate", () => {
      expect(() => new Frame().onFixedStep(0, () => {})).toThrow(/hz/);
    });
  });
});
