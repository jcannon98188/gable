import { describe, expect, it } from "vitest";
import { compareImages, decodePng, encodePng, type Image } from "./golden-image.js";

const solid = (w: number, h: number, rgba: number[]): Image => ({
  width: w,
  height: h,
  data: Uint8Array.from({ length: w * h * 4 }, (_, i) => rgba[i % 4]!),
});

describe("golden image helpers", () => {
  it("round-trips a PNG", () => {
    const img = solid(5, 3, [1, 2, 3, 255]);
    img.data.set([9, 8, 7, 0], 8);
    const back = decodePng(encodePng(img));
    expect(back.width).toBe(5);
    expect(back.height).toBe(3);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });

  it("rejects non-PNG input", () => {
    expect(() => decodePng(Buffer.from("nope"))).toThrow(/not a PNG/);
  });

  it("passes identical images and tiny channel noise", () => {
    const a = solid(10, 10, [100, 100, 100, 255]);
    const b = solid(10, 10, [110, 95, 100, 255]);
    expect(compareImages(a, a).ok).toBe(true);
    expect(compareImages(a, b).ok).toBe(true); // within the per-channel threshold
  });

  it("fails when more than the allowed fraction of pixels differ, and returns a diff", () => {
    const a = solid(10, 10, [0, 0, 0, 255]);
    const b = solid(10, 10, [0, 0, 0, 255]);
    b.data.set([255, 255, 255, 255], 0); // 1 of 100 pixels = 1%, above 0.2%
    const result = compareImages(a, b);
    expect(result.ok).toBe(false);
    expect(result.differing).toBe(1);
    expect(Array.from(result.diff!.data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it("honours a custom tolerance", () => {
    const a = solid(10, 10, [0, 0, 0, 255]);
    const b = solid(10, 10, [0, 0, 0, 255]);
    b.data.set([255, 255, 255, 255], 0);
    expect(compareImages(a, b, { channel: 16, fraction: 0.05 }).ok).toBe(true);
  });

  it("reports a size mismatch", () => {
    const result = compareImages(solid(2, 2, [0, 0, 0, 0]), solid(3, 2, [0, 0, 0, 0]));
    expect(result.ok).toBe(false);
    expect(result.sizeMismatch).toBe(true);
  });
});
