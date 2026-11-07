import { describe, expect, it } from "vitest";
import { signal } from "@gable/core";
import { useCarousel } from "./carousel.js";

// Without a DOM host the handle only tracks state.
const inert = { renderer: {} as never, host: {} };

describe("useCarousel without a DOM", () => {
  it("tracks the index, bounds and loop", () => {
    const loop = signal(false);
    const count = signal(3);
    const c = useCarousel({ count: () => count(), loop: () => loop() }, inert);
    expect(c.index()).toBe(0);
    expect(c.canPrev()).toBe(false);
    c.next();
    c.next();
    c.next();
    expect(c.index()).toBe(2);
    expect(c.canNext()).toBe(false);
    loop.set(true);
    expect(c.canNext()).toBe(true);
    c.next();
    expect(c.index()).toBe(0);
    c.goTo(99);
    expect(c.index()).toBe(2);
    count.set(2);
    expect(c.index()).toBe(1);
  });

  it("follows the autoplay option until the user toggles", () => {
    const delay = signal(0);
    const c = useCarousel({ count: () => 3, autoplay: () => delay() }, inert);
    expect(c.playing()).toBe(false);
    delay.set(1000);
    expect(c.playing()).toBe(true);
    c.toggle();
    expect(c.playing()).toBe(false);
  });
});
