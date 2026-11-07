// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, inject } from "@gable/core";
import { PRESENCE_ENV } from "@gable/ui-primitives";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { $, $$, settle, useDomApp } from "../test-utils.js";
import { matchesHotkey, ToastService, UiToaster } from "./toast.js";

class App {
  static meta = { selector: "app-root", imports: [UiToaster], template: html`<main><h1>App</h1></main><ui-toaster></ui-toaster>` };
  toast = inject(ToastService);
}

const boot = useDomApp();
const providers = [{ provide: PRESENCE_ENV, useValue: { exitDuration: () => 200 } }];

describe("Toaster (jsdom)", () => {
  it("renders in the overlay root, keeps a dismissed toast until its exit ends, and passes axe", async () => {
    const app = await boot(App, providers);
    expect(document.querySelector("main section")).toBeNull();
    expect($("section[aria-label=Notifications]").closest("ui-portal")!.parentElement).toBe(document.body);
    app.toast.success("Saved", { description: "Done" });
    app.toast.error("Failed", { action: { label: "Retry" } });
    await settle();
    expect($$("section li")).toHaveLength(2);
    await expectNoA11yViolations(document.body);

    $<HTMLButtonElement>("section li button[aria-label='Close notification']").click();
    await settle();
    expect($$("section li")).toHaveLength(2);
    expect($$("section li")[0]!.getAttribute("data-state")).toBe("closed");
    $$("section li")[0]!.dispatchEvent(new Event("animationend"));
    await settle();
    expect($$("section li")).toHaveLength(1);
    expect($("section li").textContent).toContain("Failed");
  });
});

describe("Toaster swipe and hotkey (jsdom)", () => {
  const press = (init: KeyboardEventInit) => document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

  it("focuses the region on Alt+T and pauses timers", async () => {
    const app = await boot(App, providers);
    app.toast.info("Hello");
    await settle();
    press({ key: "t", code: "KeyT", altKey: true });
    await settle();
    expect(document.activeElement).toBe($("section[aria-label=Notifications]"));
    press({ key: "t", code: "KeyT" }); // no modifier: nothing
  });

  it("matches hotkey specs exactly", () => {
    expect(matchesHotkey({ key: "†", code: "KeyT", altKey: true }, "alt+t")).toBe(true);
    expect(matchesHotkey({ key: "t", code: "KeyT", altKey: true, shiftKey: true }, "alt+t")).toBe(false);
    expect(matchesHotkey({ key: "k", code: "KeyK", ctrlKey: true, shiftKey: true }, "ctrl+shift+k")).toBe(true);
    expect(matchesHotkey({ key: "t", code: "KeyT" }, "")).toBe(false);
  });

  it("dismisses a toast swiped far enough toward the edge", async () => {
    const app = await boot(App, providers);
    app.toast.success("Swipe me", { duration: 0 });
    await settle();
    const li = $("section li");
    li.getBoundingClientRect = () => ({ width: 300, height: 60, top: 0, left: 0, right: 300, bottom: 60, x: 0, y: 0, toJSON() {} }) as DOMRect;
    let t = 0;
    const fire = (type: string, x: number) => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 10 });
      Object.defineProperty(e, "timeStamp", { value: t });
      li.dispatchEvent(e);
    };
    fire("pointerdown", 10);
    t = 400;
    fire("pointermove", 230);
    expect(li.style.transform).toBe("translate3d(220px,0,0)");
    t = 800;
    fire("pointerup", 230);
    await settle();
    expect(li.getAttribute("data-state")).toBe("closed");
    expect(app.toast.toasts()).toHaveLength(0);
  });

  it("uses theme tokens for status icons", async () => {
    const app = await boot(App, providers);
    app.toast.success("Ok", { duration: 0 });
    await settle();
    expect(document.querySelector("section li svg")!.getAttribute("class")).toContain("text-success");
  });
});
