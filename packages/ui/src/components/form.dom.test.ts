// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { email, form, minLength, required } from "@gable/core/forms";
import { UiButton } from "./button.js";
import { UiField, UiFieldControl, UiForm } from "./form.js";
import { UiInput } from "./input.js";
import { $, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiForm, UiField, UiFieldControl, UiInput, UiButton],
    template: html`
      <ui-form [submit]="form.submit" [action]="save" (submitted)="result.set($event)">
        <ui-field [state]="form.name.state" label="Name" description="Your full name." [messages]="names">
          <input uiInput uiFieldControl [field]="form.name" class="name" />
        </ui-field>
        <ui-field [state]="form.email.state" label="Email">
          <input uiInput uiFieldControl [field]="form.email" class="email" />
        </ui-field>
        <button uiButton type="submit">Save</button>
      </ui-form>
    `,
  };
  model = signal({ name: "", email: "" });
  form = form(this.model, (p) => {
    required(p.name);
    minLength(p.name, 3);
    email(p.email);
  });
  names = { required: "Tell us your name." };
  saved: unknown[] = [];
  result = signal("");
  save = (value: unknown) => {
    this.saved.push(value);
  };
}

const type = async (el: HTMLInputElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
};

describe("Form and Field", () => {
  it("links label, description and control; hides errors until touched", async () => {
    await boot(App);
    const input = $<HTMLInputElement>(".name");
    const label = $<HTMLLabelElement>("label");
    expect(label.getAttribute("for")).toBe(input.id);
    expect(input.getAttribute("aria-describedby")).toBe(document.getElementById(input.id + "-description")!.id);
    expect(document.querySelector("[role=alert]")).toBeNull();
  });

  it("shows custom, built-in and validator messages after blur", async () => {
    await boot(App);
    const name = $<HTMLInputElement>(".name");
    name.dispatchEvent(new Event("blur"));
    await settle();
    expect($("[role=alert]").textContent).toBe("Tell us your name.");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await type(name, "ab");
    expect($("[role=alert]").textContent).toContain("at least 3");
    await type(name, "Ada");
    expect(document.querySelector("[role=alert]")).toBeNull();
    expect(name.hasAttribute("aria-invalid")).toBe(false);
  });

  it("submit touches everything and only runs the action when valid", async () => {
    const app = await boot(App);
    $<HTMLButtonElement>("button[type=submit]").click();
    await settle();
    expect(app.result()).toBe("invalid");
    expect(app.saved).toEqual([]);
    expect(document.querySelectorAll("[role=alert]").length).toBe(1);
    await type($<HTMLInputElement>(".name"), "Ada");
    await type($<HTMLInputElement>(".email"), "ada@example.com");
    $<HTMLButtonElement>("button[type=submit]").click();
    await settle();
    expect(app.result()).toBe("ok");
    expect(app.saved).toEqual([{ name: "Ada", email: "ada@example.com" }]);
  });
});
