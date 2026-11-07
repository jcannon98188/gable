import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { domEvent, provideTestDom } from "@gable/ui-primitives/testing";
import { UiButton } from "./button.js";
import { PopoverTrigger, UiPopover } from "./popover.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiPopover, PopoverTrigger, UiButton],
    template: html`<ui-popover [(open)]="open" placement="bottom-start" contentClass="w-80">
      <button slot="trigger" popoverTrigger uiButton variant="outline">Dimensions</button>
      <p class="body">Set the dimensions</p>
    </ui-popover>`,
  };
  open = signal(false);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = async () => {
  const f = mount(App, { providers: provideTestDom(), advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
  await f.settle();
  const click = async (node: ReturnType<typeof f.query>) => {
    f.dispatch(node!, "click", domEvent(node!, "click"));
    await f.settle();
  };
  return { f, click, content: () => f.query("[role=dialog]")!, trigger: () => f.queryAll("button")[0]! };
};

describe("Popover", () => {
  it("renders a hidden panel in the overlay root, linked to its trigger", async () => {
    const { f, content, trigger } = await setup();
    expect(f.query("gable-overlay [role=dialog]")).not.toBeNull();
    expect(content().attrs).toMatchObject({ hidden: "", "data-state": "closed" });
    expect(content().attrs.class).toContain("w-80");
    expect(content().attrs.class).not.toContain("w-72");
    expect(trigger().attrs).toMatchObject({ "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": content().attrs.id });
  });

  it("toggles on trigger clicks and reports through the model", async () => {
    const { f, click, content, trigger } = await setup();
    await click(trigger());
    expect(f.instance.open()).toBe(true);
    expect(content().attrs["data-state"]).toBe("open");
    expect(content().attrs.hidden).toBeUndefined();
    expect(f.text()).toContain("Set the dimensions");
    expect(trigger().attrs["aria-expanded"]).toBe("true");
    await click(trigger());
    expect(f.instance.open()).toBe(false);
    expect(content().attrs.hidden).toBe("");
  });

  it("follows the bound open signal", async () => {
    const { f, content } = await setup();
    f.instance.open.set(true);
    await f.settle();
    expect(content().attrs["data-state"]).toBe("open");
  });
});
