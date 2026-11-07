// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, inject } from "@gable/core";
import { PRESENCE_ENV } from "@gable/ui-primitives";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { $, $$, settle, useDomApp } from "../test-utils.js";
import { ToastService, UiToaster } from "./toast.js";

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
