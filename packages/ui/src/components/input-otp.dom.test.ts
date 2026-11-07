// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { form } from "@gable/core/forms";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { filterOtp, UiInputOtp } from "./input-otp.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiInputOtp],
    template: html`<ui-input-otp [(value)]="code" [length]="6" [groups]="split" [disabled]="off()" (complete)="done.set($event)"></ui-input-otp>`,
  };
  code = signal("");
  split = [3, 3];
  off = signal(false);
  done = signal("");
}

class Plain {
  static meta = {
    selector: "app-root",
    imports: [UiInputOtp],
    template: html`<ui-input-otp [(value)]="code" [length]="4" pattern="alphanumeric" [mask]="true" name="otp" label="Backup code"></ui-input-otp>`,
  };
  code = signal("");
}

class Bound {
  static meta = {
    selector: "app-root",
    imports: [UiInputOtp],
    template: html`<ui-input-otp [field]="f.code" [length]="4"></ui-input-otp>`,
  };
  model = signal({ code: "" });
  f = form(this.model);
}

const slots = () => $$<HTMLInputElement>("input[data-otp-slot]");
const chars = () => slots().map((s) => s.value).join("");
const type = (index: number, text: string) => {
  const el = slots()[index]!;
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const paste = (index: number, text: string) => {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  event.clipboardData = { getData: () => text };
  slots()[index]!.dispatchEvent(event);
  return event;
};

describe("filterOtp", () => {
  it("keeps only allowed characters", () => {
    expect(filterOtp("12-3 4a", "digits")).toBe("1234");
    expect(filterOtp("a-1 B!", "alphanumeric")).toBe("a1B");
  });
});

describe("UiInputOtp", () => {
  it("renders a box per character, groups with a separator, and the autofill hint on the first box", async () => {
    await boot(App);
    expect(slots()).toHaveLength(6);
    expect($$("[role=separator]")).toHaveLength(1);
    expect(slots()[0]!.getAttribute("autocomplete")).toBe("one-time-code");
    expect(slots()[1]!.getAttribute("autocomplete")).toBe("off");
    expect(slots()[0]!.getAttribute("inputmode")).toBe("numeric");
    expect(slots()[2]!.getAttribute("aria-label")).toBe("Character 3 of 6");
    expect($("[role=group]").getAttribute("aria-label")).toBe("Verification code");
  });

  it("typing fills the model, advances focus and emits complete on the last box", async () => {
    const app = await boot(App);
    slots()[0]!.focus();
    type(0, "1");
    await settle();
    expect(app.code()).toBe("1");
    expect(document.activeElement).toBe(slots()[1]);
    for (const [i, c] of [...["2", "3", "4", "5"].entries()]) type(i + 1, c);
    await settle();
    expect(app.done()).toBe("");
    type(5, "6");
    await settle();
    expect(app.code()).toBe("123456");
    expect(app.done()).toBe("123456");
    expect(chars()).toBe("123456");
  });

  it("ignores characters the pattern rejects and restores the box", async () => {
    const app = await boot(App);
    type(0, "x");
    await settle();
    expect(app.code()).toBe("");
    expect(slots()[0]!.value).toBe("");
  });

  it("replaces the character when typing over a filled box", async () => {
    const app = await boot(App);
    app.code.set("12");
    await settle();
    type(1, "27");
    await settle();
    expect(app.code()).toBe("17");
  });

  it("pastes a code across the boxes, dropping separators and extra characters", async () => {
    const app = await boot(App);
    const event = paste(2, "12-34 56 789");
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(app.code()).toBe("123456");
    expect(app.done()).toBe("123456");
    expect(chars()).toBe("123456");
  });

  it("spreads a one-time-code autofill into the first box", async () => {
    const app = await boot(App);
    type(0, "987654");
    await settle();
    expect(app.code()).toBe("987654");
  });

  it("a short paste starts at the box and leaves later characters", async () => {
    const app = await boot(App);
    app.code.set("1234");
    await settle();
    paste(1, "99");
    await settle();
    expect(app.code()).toBe("1994");
  });

  it("Backspace deletes in place, or the previous character from an empty box", async () => {
    const app = await boot(App);
    app.code.set("123");
    await settle();
    key(slots()[1]!, "Backspace");
    await settle();
    expect(app.code()).toBe("13");
    slots()[2]!.focus();
    await settle();
    expect(document.activeElement).toBe(slots()[2]);
    key(slots()[2]!, "Backspace");
    await settle();
    expect(app.code()).toBe("1");
    expect(document.activeElement).toBe(slots()[1]);
  });

  it("arrow keys, Home and End move focus", async () => {
    const app = await boot(App);
    app.code.set("123");
    await settle();
    slots()[1]!.focus();
    key(slots()[1]!, "ArrowRight");
    expect(document.activeElement).toBe(slots()[2]);
    key(slots()[2]!, "ArrowLeft");
    expect(document.activeElement).toBe(slots()[1]);
    key(slots()[1]!, "End");
    expect(document.activeElement).toBe(slots()[3]);
    key(slots()[3]!, "Home");
    expect(document.activeElement).toBe(slots()[0]);
  });

  it("focusing a box past the end of the value moves to the first empty box", async () => {
    const app = await boot(App);
    app.code.set("12");
    await settle();
    slots()[5]!.focus();
    expect(document.activeElement).toBe(slots()[2]);
  });

  it("follows the disabled input and the model", async () => {
    const app = await boot(App);
    app.off.set(true);
    app.code.set("55");
    await settle();
    expect(slots().every((s) => s.disabled)).toBe(true);
    expect(chars()).toBe("55");
  });

  it("supports alphanumeric, masked codes with a hidden form input", async () => {
    const app = await boot(Plain);
    expect(slots()[0]!.type).toBe("password");
    expect(slots()[0]!.getAttribute("inputmode")).toBe("text");
    expect($("[role=group]").getAttribute("aria-label")).toBe("Backup code");
    expect($$("[role=separator]")).toHaveLength(0);
    paste(0, "a1-B2");
    await settle();
    expect(app.code()).toBe("a1B2");
    expect($<HTMLInputElement>("input[type=hidden]").name).toBe("otp");
    expect($<HTMLInputElement>("input[type=hidden]").value).toBe("a1B2");
  });

  it("works with the [field] directive: value, touched and aria-invalid", async () => {
    const app = await boot(Bound);
    paste(0, "4321");
    await settle();
    expect(app.f.code()).toBe("4321");
    expect(app.f.code.state.touched()).toBe(false);
    slots()[0]!.dispatchEvent(new FocusEvent("blur", { relatedTarget: slots()[1] }));
    expect(app.f.code.state.touched()).toBe(false);
    slots()[3]!.dispatchEvent(new FocusEvent("blur"));
    expect(app.f.code.state.touched()).toBe(true);
    app.f.code.set("");
    await settle();
    expect(chars()).toBe("");
  });

  it("has no axe violations", async () => {
    await boot(App);
    await expectNoA11yViolations(document.body);
  });
});
