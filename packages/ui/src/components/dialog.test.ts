import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { domEvent, provideTestDom } from "@gable/ui-primitives/testing";
import { UiButton } from "./button.js";
import { DialogTrigger, UiDialog } from "./dialog.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiDialog, DialogTrigger, UiButton],
    template: html`<ui-dialog [(open)]="open" heading="Edit profile" description="Make changes." contentClass="sm:max-w-sm">
      <button slot="trigger" dialogTrigger uiButton variant="outline">Edit</button>
      <p class="body">Body text</p>
      <div slot="footer"><button class="save" uiButton (click)="open.set(false)">Save</button></div>
    </ui-dialog>`,
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
  return { f, click, content: () => f.query("[role=dialog]")!, trigger: () => f.query("[dialogtrigger]") ?? f.queryAll("button")[0]! };
};

describe("Dialog", () => {
  it("renders closed, in the overlay root, with a labelled panel", async () => {
    const { f, content } = await setup();
    expect(content().attrs.hidden).toBe("");
    expect(content().attrs["data-state"]).toBe("closed");
    expect(content().attrs.class).toContain("sm:max-w-sm");
    expect(content().attrs.class).not.toContain("sm:max-w-lg");
    expect(f.text()).toContain("Edit profile");
    expect(content().attrs["aria-labelledby"]).toBe(f.query("[data-part=title]")!.attrs.id);
    // the panel lives in the portal, not next to the trigger
    expect(f.query("gable-overlay [role=dialog]")).not.toBeNull();
  });

  it("opens from the projected trigger and closes from the close button", async () => {
    const { f, click, content, trigger } = await setup();
    expect(trigger().attrs["aria-haspopup"]).toBe("dialog");
    await click(trigger());
    expect(f.instance.open()).toBe(true);
    expect(content().attrs.hidden).toBeUndefined();
    expect(content().attrs["data-state"]).toBe("open");
    expect(trigger().attrs["aria-expanded"]).toBe("true");
    expect(f.query("[data-part=backdrop]")!.attrs["data-state"]).toBe("open");
    await click(f.query("[data-part=close-trigger]"));
    expect(f.instance.open()).toBe(false);
    expect(content().attrs["data-state"]).toBe("closed");
    expect(content().attrs.hidden).toBe("");
  });

  it("projects body and footer, and the footer can close it through the parent's own state", async () => {
    const { f, click, content, trigger } = await setup();
    await click(trigger());
    expect(content().children.some((c) => f.textOf(c).includes("Body text"))).toBe(true);
    await click(f.query(".save"));
    expect(f.instance.open()).toBe(false);
  });

  it("follows the bound open signal", async () => {
    const { f, content } = await setup();
    f.instance.open.set(true);
    await f.settle();
    expect(content().attrs["data-state"]).toBe("open");
  });
});
