import { describe, expect, it } from "vitest";
import { placeBubble } from "./bubble-position.js";

const container = { top: 100, left: 50, bottom: 600, right: 650 };
const size = { width: 200, height: 36 };
const sel = (top: number, left: number, right = left + 40) => ({ top, left, bottom: top + 20, right });

describe("placeBubble", () => {
  it("sits above the selection", () => {
    expect(placeBubble(sel(300, 150), container, size)).toEqual({ top: 300 - 100 - 36 - 6, left: 100 });
  });
  it("flips below when there is no room above", () => {
    expect(placeBubble(sel(110, 150), container, size)).toEqual({ top: 110 + 20 - 100 + 6, left: 100 });
  });
  it("clamps to the right edge and the left edge", () => {
    expect(placeBubble(sel(300, 640), container, size).left).toBe(400);
    expect(placeBubble(sel(300, 10), container, size).left).toBe(0);
  });
  it("pins to the left when the container is narrower than the bubble", () => {
    expect(placeBubble(sel(300, 100), { top: 0, left: 50, bottom: 9, right: 100 }, size).left).toBe(0);
  });
});
