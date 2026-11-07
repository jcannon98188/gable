// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, inject } from "@gable/core";
import { PRESENCE_ENV } from "@gable/ui-primitives";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { $, $$, settle, useDomApp } from "../test-utils.js";
import { ToastService, UiToaster } from "./toast.js";

class Stacked {
  static meta = { selector: "app-root", imports: [UiToaster], template: html`<ui-toaster [limit]="3"></ui-toaster>` };
  toast = inject(ToastService);
}
class Plain {
  static meta = { selector: "app-root", imports: [UiToaster], template: html`<ui-toaster [stack]="false"></ui-toaster>` };
  toast = inject(ToastService);
}

const boot = useDomApp();
const providers = [{ provide: PRESENCE_ENV, useValue: { exitDuration: () => 200 } }];
const region = () => $("section[aria-label=Notifications]");
const items = () => $$("section li");
const states = () => items().map((li) => li.getAttribute("data-stack"));

describe("Toaster stacking (jsdom)", () => {
  it("collapses into a stack with the newest in front and older ones inert behind it", async () => {
    const app = await boot(Stacked, providers);
    app.toast.info("one", { duration: 0 });
    app.toast.info("two", { duration: 0 });
    app.toast.info("three", { duration: 0 });
    await settle();
    expect(states()).toEqual(["back", "back", "front"]);
    expect(items()[2]!.hasAttribute("inert")).toBe(false);
    expect(items()[0]!.hasAttribute("inert")).toBe(true);
    expect(items()[1]!.getAttribute("style")).toContain("scale(0.95)");
    expect(items()[0]!.getAttribute("style")).toContain("scale(0.9)");
    expect(items()[2]!.getAttribute("style")).toContain("scale(1)");
    expect($("[data-toaster-list]").className).toContain("grid");
    await expectNoA11yViolations(document.body);
  });

  it("a single toast is not stacked", async () => {
    const app = await boot(Stacked, providers);
    app.toast.info("only", { duration: 0 });
    await settle();
    expect(states()).toEqual(["open"]);
  });

  it("expands on hover and collapses on leave, pausing timers while open", async () => {
    const app = await boot(Stacked, providers);
    app.toast.info("one", { duration: 300 });
    app.toast.info("two", { duration: 300 });
    await settle();
    region().dispatchEvent(new MouseEvent("mouseenter"));
    await settle();
    expect(states()).toEqual(["open", "open"]);
    expect(region().getAttribute("data-expanded")).toBe("true");
    expect(items().some((li) => li.hasAttribute("inert"))).toBe(false);
    expect($("[data-toaster-list]").className).toContain("flex-col");
    await new Promise((r) => setTimeout(r, 450)); // longer than the durations: still there while paused
    expect(app.toast.toasts()).toHaveLength(2);
    await expectNoA11yViolations(document.body);
    region().dispatchEvent(new MouseEvent("mouseleave"));
    await settle();
    expect(states()).toEqual(["back", "front"]);
    await new Promise((r) => setTimeout(r, 450));
    expect(app.toast.toasts()).toHaveLength(0);
  });

  it("expands when focus enters (keyboard) and collapses when it leaves", async () => {
    const app = await boot(Stacked, providers);
    app.toast.info("one", { duration: 0 });
    app.toast.info("two", { duration: 0 });
    await settle();
    const close = items()[1]!.querySelector<HTMLButtonElement>("button[aria-label='Close notification']")!;
    close.focus();
    region().dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await settle();
    expect(states()).toEqual(["open", "open"]);
    region().dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }));
    await settle();
    expect(states()).toEqual(["back", "front"]);
  });

  it("respects limit and shows how many are queued beyond it", async () => {
    const app = await boot(Stacked, providers);
    for (const n of ["a", "b", "c", "d", "e"]) app.toast.info(n, { duration: 0 });
    await settle();
    expect(items()).toHaveLength(3);
    expect($("[data-toaster-more]").textContent).toBe("+2 more");
    app.toast.dismiss();
    await settle();
    expect(document.querySelector("[data-toaster-more]")).toBeNull();
  });

  it("stack=false keeps the plain list", async () => {
    const app = await boot(Plain, providers);
    app.toast.info("one", { duration: 0 });
    app.toast.info("two", { duration: 0 });
    await settle();
    expect(states()).toEqual(["open", "open"]);
    expect(items().some((li) => li.hasAttribute("style") && li.getAttribute("style")!.includes("scale"))).toBe(false);
  });

  it("announcements are unchanged by stacking", async () => {
    const app = await boot(Stacked, providers);
    app.toast.error("Boom", { duration: 0 });
    app.toast.info("Hi", { duration: 0 });
    await settle();
    expect(app.toast.toasts().map((t) => t.message)).toEqual(["Boom", "Hi"]);
    expect(document.querySelectorAll("section [aria-live]")).toHaveLength(0);
  });
});
