import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { provideTestDom } from "@gable/ui-primitives/testing";
import { UiButton } from "./button.js";
import { UiTooltip } from "./tooltip.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiTooltip, UiButton],
    template: html`<button uiButton uiTooltip="Save changes" placement="bottom" [delay]="200">Save</button>
      @if (second()) {
        <button uiButton uiTooltip="Second">Second</button>
      }`,
  };
  second = signal(false);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = async () => {
  const f = mount(App, { providers: provideTestDom(), advanceTimers: async (ms) => void (await vi.advanceTimersByTimeAsync(ms)) });
  await f.settle();
  return { f, trigger: () => f.queryAll("button")[0]!, tip: () => f.query("[role=tooltip]")! };
};

// Hover, delay and Escape are Zag effects, which stay off in the in-memory renderer: see tooltip.dom.test.ts.
describe("Tooltip", () => {
  it("creates a hidden tooltip in the overlay root with the text and the placement classes", async () => {
    const { f, tip } = await setup();
    expect(f.query("gable-overlay [role=tooltip]")).not.toBeNull();
    expect(tip().attrs).toMatchObject({ hidden: "", "data-state": "closed" });
    expect(f.textOf(tip())).toBe("Save changes");
    expect(tip().attrs.class).toContain("bg-primary");
    expect(f.query("button")!.attrs["aria-describedby"]).toBeUndefined();
  });

  it("removes its panel from the overlay root when the trigger is destroyed", async () => {
    const { f } = await setup();
    f.instance.second.set(true);
    await f.settle();
    expect(f.queryAll("[role=tooltip]")).toHaveLength(2);
    f.instance.second.set(false);
    await f.settle();
    expect(f.queryAll("[role=tooltip]")).toHaveLength(1);
  });
});
