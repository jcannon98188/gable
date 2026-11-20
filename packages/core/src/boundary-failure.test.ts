// A component that fails while it is being set up must not leak (canvas/105 review, item 18): a boundary renderer factory that
// throws disposes the instance scope, and a hot update whose Setup throws leaves the running app and the next update intact.
import { describe, expect, it } from "vitest";
import { html, onCleanup } from "@gable/core";
import { mount } from "@gable/testing";

describe("boundary renderer creation failure", () => {
  it("disposes the instance scope (Setup cleanups run) and surfaces the error", () => {
    let cleaned = 0;
    class Scene {
      static meta = {
        selector: "x-scene",
        template: html`<p>hi</p>`,
        renderer: (): never => {
          throw new Error("no webgl");
        },
      };
      cleanup = onCleanup(() => void cleaned++);
    }
    expect(() => mount(Scene)).toThrow("no webgl");
    expect(cleaned).toBe(1);
  });
});
