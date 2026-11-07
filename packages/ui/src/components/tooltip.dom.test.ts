// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiButton } from "./button.js";
import { UiTooltip } from "./tooltip.js";
import { $, key, pointer, settle, useDomApp } from "../test-utils.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiTooltip, UiButton],
    template: html`<button id="save" uiButton uiTooltip="Save changes" [delay]="20">Save</button>`,
  };
}

const boot = useDomApp();

describe("Tooltip in jsdom", () => {
  it("lives in document.body, hidden until hovered", async () => {
    await boot(App);
    expect($("[role=tooltip]").parentElement!.parentElement).toBe(document.body);
    expect($("[role=tooltip]").hidden).toBe(true);
  });

  it("opens after the delay on hover and closes on leave", async () => {
    await boot(App);
    pointer($("#save"), "pointermove");
    await new Promise((r) => setTimeout(r, 60));
    await settle();
    expect($("[role=tooltip]").hidden).toBe(false);
    expect($("[role=tooltip]").getAttribute("data-state")).toBe("open");
    expect($("[role=tooltip]").textContent).toBe("Save changes");
    expect($("#save").getAttribute("aria-describedby")).toBe($("[role=tooltip]").id);
    pointer($("#save"), "pointerleave");
    await new Promise((r) => setTimeout(r, 250));
    await settle();
    expect($("[role=tooltip]").hidden).toBe(true);
  });

  it("closes on Escape", async () => {
    await boot(App);
    pointer($("#save"), "pointermove");
    await new Promise((r) => setTimeout(r, 60));
    await settle();
    expect($("[role=tooltip]").hidden).toBe(false);
    key(document.body, "Escape");
    await settle();
    expect($("[role=tooltip]").getAttribute("data-state")).toBe("closed");
  });
});

class DisabledApp {
  static meta = {
    selector: "app-root",
    imports: [UiTooltip, UiButton],
    template: html`<span id="wrap" uiTooltip="Unavailable on macOS" [focusable]="true" [delay]="20" class="inline-flex [&>*]:pointer-events-none"><button id="inner" uiButton disabled>Install</button></span>`,
  };
}

describe("Tooltip on a disabled control", () => {
  it("makes the wrapper focusable, opens on focus, describes the wrapper and keeps the button disabled", async () => {
    await boot(DisabledApp);
    expect($("#wrap").getAttribute("tabindex")).toBe("0");
    $("#wrap").focus();
    await settle();
    expect($("[role=tooltip]").hidden).toBe(false);
    expect($("[role=tooltip]").textContent).toBe("Unavailable on macOS");
    expect($("#wrap").getAttribute("aria-describedby")).toBe($("[role=tooltip]").id);
    expect($<HTMLButtonElement>("#inner").disabled).toBe(true);
    await expectNoA11yViolations(document.body);
  });

  it("opens on hover of the wrapper", async () => {
    await boot(DisabledApp);
    pointer($("#wrap"), "pointermove");
    await new Promise((r) => setTimeout(r, 60));
    await settle();
    expect($("[role=tooltip]").hidden).toBe(false);
  });

  it("is not focusable by default", async () => {
    await boot(App);
    expect($("#save").hasAttribute("tabindex")).toBe(false);
  });
});
