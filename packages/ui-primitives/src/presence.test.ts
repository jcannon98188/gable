import { describe, expect, it, vi } from "vitest";
import { html, inject, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { UiPresence, PRESENCE_ENV } from "./presence.js";
import { DIALOG, DialogState } from "./dialog.js";
import { domEvent, provideTestDom } from "./test-dom.js";

const envFor = (animated: boolean) => ({ provide: PRESENCE_ENV, useValue: { exitDuration: () => (animated ? 200 : null) } });

class App {
  static meta = {
    selector: "app-root",
    imports: [UiPresence],
    template: html`
      <div id="always" uiPresence [present]="open()">a</div>
      @if (open()) {
        <div id="shown" uiPresence>s</div>
      }
    `,
  };
  open = signal(true);
}

type Fixture = ReturnType<typeof mount<App>>;
const end = (f: Fixture, node: NonNullable<ReturnType<Fixture["query"]>>, type = "animationend") => f.dispatch(node, type, { type });
const start = async (animated: boolean) => {
  const f = mount(App, { providers: [envFor(animated)] });
  await f.settle();
  return f;
};

describe("ui-presence (in-memory renderer)", () => {
  it("enter: data-state is open, and flips to closed on exit", async () => {
    const f = await start(false);
    expect(f.query("#always")!.attrs["data-state"]).toBe("open");
    expect(f.query("#shown")!.attrs["data-state"]).toBe("open");
    f.instance.open.set(false);
    await f.settle();
    expect(f.query("#always")!.attrs["data-state"]).toBe("closed");
  });

  it("exit without an animation: @if unmounts at once", async () => {
    const f = await start(false);
    f.instance.open.set(false);
    await f.settle();
    expect(f.query("#shown")).toBeNull();
  });

  it("exit with an animation: the node stays, closed, until transitionend", async () => {
    const f = await start(true);
    const node = f.query("#shown")!;
    f.instance.open.set(false);
    await f.settle();
    expect(f.query("#shown")).toBe(node);
    expect(node.attrs["data-state"]).toBe("closed");
    end(f, node, "transitionend");
    await f.settle();
    expect(f.query("#shown")).toBeNull();
  });

  it("ignores an animationend that bubbles from a child", async () => {
    const f = await start(true);
    const node = f.query("#shown")!;
    f.instance.open.set(false);
    await f.settle();
    f.dispatch(node, "animationend", { type: "animationend", target: {} });
    await f.settle();
    expect(f.query("#shown")).toBe(node);
    end(f, node);
    await f.settle();
    expect(f.query("#shown")).toBeNull();
  });

  it("falls back to a timer when no end event arrives", async () => {
    vi.useFakeTimers();
    try {
      const f = await start(true);
      f.instance.open.set(false);
      await f.flush();
      expect(f.query("#shown")).not.toBeNull();
      await vi.advanceTimersByTimeAsync(400);
      await f.flush();
      expect(f.query("#shown")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-opening during an exit cancels it and drops the listeners", async () => {
    const f = await start(true);
    const node = f.query("#always")!;
    f.instance.open.set(false);
    await f.settle();
    expect(node.listeners.animationend).toHaveLength(1);
    f.instance.open.set(true);
    await f.settle();
    expect(node.attrs["data-state"]).toBe("open");
    expect(node.listeners.animationend ?? []).toHaveLength(0);
  });

  it("disposal during an exit: held nodes are released after the animation", async () => {
    const f = await start(true);
    const node = f.query("#shown")!;
    f.instance.open.set(false);
    await f.settle();
    expect(node.listeners.animationend).toHaveLength(1);
    f.destroy(); // the app goes while the held exit still runs: the end event still releases it and cleans up
    end(f as never, node);
    await Promise.resolve();
    expect(node.listeners.animationend ?? []).toHaveLength(0);
  });
});

class DialogApp {
  static meta = {
    selector: "app-root",
    providers: [DialogState],
    imports: [...DIALOG],
    template: html`<button uiDialogTrigger>Open</button>
      <div uiDialogBackdrop></div>
      <div uiDialogPositioner><div uiDialogContent><button uiDialogClose>x</button></div></div>`,
  };
  open = signal(false);
  dialog = inject(DialogState).bind(() => ({ open: this.open(), onOpenChange: (d) => this.open.set(d.open) }));
}

describe("dialog exit animation (in-memory renderer)", () => {
  it("delays hidden until the animation ends, and shows again on re-open", async () => {
    const f = mount(DialogApp, { providers: [...provideTestDom(), envFor(true)] });
    await f.settle();
    const content = () => f.query("[role=dialog]")!;
    expect(content().attrs.hidden).toBe("");
    f.instance.open.set(true);
    await f.settle();
    expect(content().attrs.hidden).toBeUndefined();
    const close = f.query("[data-part=close-trigger]")!;
    f.dispatch(close, "click", domEvent(close, "click"));
    await f.settle();
    expect(content().attrs["data-state"]).toBe("closed");
    expect(content().attrs.hidden).toBeUndefined();
    f.dispatch(content(), "animationend", { type: "animationend" });
    await f.settle();
    expect(content().attrs.hidden).toBe("");
    f.instance.open.set(true);
    await f.settle();
    expect(content().attrs.hidden).toBeUndefined();
  });

  it("hides at once without an animation", async () => {
    const f = mount(DialogApp, { providers: [...provideTestDom(), envFor(false)] });
    f.instance.open.set(true);
    await f.settle();
    f.instance.open.set(false);
    await f.settle();
    expect(f.query("[role=dialog]")!.attrs.hidden).toBe("");
  });
});
