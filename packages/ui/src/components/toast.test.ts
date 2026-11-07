import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html } from "@gable/core";
import { LiveAnnouncer } from "@gable/core/renderer";
import { mount } from "@gable/testing";
import { provideTestDom } from "@gable/ui-primitives/testing";
import { ToastService, UiToaster } from "./toast.js";

class App {
  static meta = { selector: "app-root", imports: [UiToaster], template: html`<ui-toaster position="top-right" [limit]="3"></ui-toaster>` };
}

const spoken: { message: string; politeness: string }[] = [];
const announcer = { announce: (message: string, politeness = "polite") => void spoken.push({ message, politeness }), clear: () => {} };
beforeEach(() => {
  vi.useFakeTimers();
  spoken.length = 0;
});
afterEach(() => vi.useRealTimers());

const setup = async () => {
  const f = mount(App, { providers: [...provideTestDom(), { provide: LiveAnnouncer, useValue: announcer }], advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) });
  await f.settle();
  const toast = f.injector.get(ToastService);
  const items = () => f.queryAll("li");
  return { f, toast, items };
};

describe("toast", () => {
  it("renders a labelled region in the overlay root and shows typed toasts", async () => {
    const { f, toast, items } = await setup();
    expect(f.query("section")?.attrs["aria-label"]).toBe("Notifications");
    expect(items()).toHaveLength(0);
    toast.success("Saved", { description: "All good" });
    toast.error("Failed");
    await f.settle();
    expect(items()).toHaveLength(2);
    expect(items()[0]!.attrs["data-type"]).toBe("success");
    expect(f.textOf(items()[0]!)).toContain("Saved");
    expect(f.textOf(items()[0]!)).toContain("All good");
    expect(items()[1]!.attrs["data-type"]).toBe("error");
    expect(items()[0]!.attrs["data-state"]).toBe("open");
  });

  it("announces toasts, errors assertively", async () => {
    const { f, toast } = await setup();
    toast.info("FYI", { description: "Details" });
    toast.error("Broken");
        expect(spoken).toEqual([
      { message: "FYI. Details", politeness: "polite" },
      { message: "Broken", politeness: "assertive" },
    ]);
  });

  it("closes itself after the duration and runs onDismiss", async () => {
    const { f, toast, items } = await setup();
    const gone = vi.fn();
    toast.show("Hi", { duration: 1000, onDismiss: gone });
    await f.settle();
    await vi.advanceTimersByTimeAsync(900);
    expect(items()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    await f.settle();
    expect(items()).toHaveLength(0);
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it("pauses while hovered or focused and keeps the remaining time", async () => {
    const { f, toast, items } = await setup();
    toast.show("Hi", { duration: 1000 });
    await f.settle();
    await vi.advanceTimersByTimeAsync(600);
    f.dispatch(f.query("section")!, "mouseenter", {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(items()).toHaveLength(1);
    f.dispatch(f.query("section")!, "mouseleave", {});
    await vi.advanceTimersByTimeAsync(300);
    expect(items()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    await f.settle();
    expect(items()).toHaveLength(0);

    toast.show("Again", { duration: 500 });
    await f.settle();
    f.dispatch(f.query("section")!, "focusin", {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(items()).toHaveLength(1);
    f.dispatch(f.query("section")!, "focusout", {});
    await vi.advanceTimersByTimeAsync(600);
    await f.settle();
    expect(items()).toHaveLength(0);
  });

  it("keeps persistent toasts and dismisses by id or all", async () => {
    const { f, toast, items } = await setup();
    const a = toast.show("A", { duration: 0 });
    toast.show("B", { duration: Infinity });
    await f.settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(items()).toHaveLength(2);
    toast.dismiss(a);
    await f.settle();
    expect(items().map((i) => f.textOf(i))).toEqual([expect.stringContaining("B")]);
    toast.dismiss();
    await f.settle();
    expect(items()).toHaveLength(0);
  });

  it("runs an action then dismisses, and the close button dismisses", async () => {
    const { f, toast, items } = await setup();
    const undo = vi.fn();
    toast.show("Deleted", { action: { label: "Undo", onClick: undo } });
    await f.settle();
    const buttons = f.queryAll("li button");
    expect(buttons.map((b) => f.textOf(b).trim())).toEqual(["Undo", ""]);
    expect(buttons[1]!.attrs["aria-label"]).toBe("Close notification");
    f.dispatch(buttons[0]!, "click", {});
    await f.settle();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(items()).toHaveLength(0);
    toast.show("Two");
    await f.settle();
    f.dispatch(f.queryAll("li button")[0]!, "click", {});
    await f.settle();
    expect(items()).toHaveLength(0);
  });

  it("turns a loading toast into success or error when a promise settles", async () => {
    const { f, toast, items } = await setup();
    let resolve!: (v: number) => void;
    void toast.promise(new Promise<number>((r) => (resolve = r)), { loading: "Saving", success: (n) => `Saved ${n}`, error: "Nope" });
    await f.settle();
    expect(items()[0]!.attrs["data-type"]).toBe("loading");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(items()).toHaveLength(1); // loading does not time out
    resolve(3);
    await f.settle();
    expect(items()).toHaveLength(1);
    expect(items()[0]!.attrs["data-type"]).toBe("success");
    expect(f.textOf(items()[0]!)).toContain("Saved 3");

    const failing = toast.promise(Promise.reject(new Error("x")), { loading: "Again", success: "ok", error: (e) => `Failed: ${(e as Error).message}` });
    await failing.catch(() => {});
    await f.settle();
    expect(items().at(-1)!.attrs["data-type"]).toBe("error");
    expect(f.textOf(items().at(-1)!)).toContain("Failed: x");
  });

  it("updates in place when an id is reused and honours limit", async () => {
    const { f, toast, items } = await setup();
    toast.show("One", { id: "x" });
    toast.show("One again", { id: "x" });
    await f.settle();
    expect(items()).toHaveLength(1);
    expect(f.textOf(items()[0]!)).toContain("One again");
    for (const n of ["a", "b", "c"]) toast.show(n);
    await f.settle();
    expect(items()).toHaveLength(3); // limit
    expect(items().map((i) => f.textOf(i)).join("|")).not.toContain("One");
  });
});
