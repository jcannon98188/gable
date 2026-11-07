// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { form, required } from "@gable/core/forms";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiField, UiFieldControl } from "./form.js";
import { UiInput } from "./input.js";
import { UiSelect } from "./select.js";
import { $, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiField, UiFieldControl, UiInput, UiSelect],
    template: html`
      <ui-field class="stacked" [state]="f.name.state" label="Name" hint="Your full name.">
        <input uiInput uiFieldControl [field]="f.name" />
      </ui-field>
      <ui-field class="horizontal" layout="horizontal" density="compact" [state]="f.role.state" label="Role" hint="Pick one.">
        <ui-select [field]="f.role" [items]="roles" density="compact" placeholder="Choose..."></ui-select>
      </ui-field>
      <ui-field class="manual" label="Notes" error="Too long.">
        <textarea uiFieldControl></textarea>
      </ui-field>
      <ui-field class="nolabel" layout="horizontal" hint="No label here.">
        <input uiInput uiFieldControl aria-label="Bare" />
      </ui-field>
    `,
  };
  roles = [
    { value: "admin", label: "Admin" },
    { value: "viewer", label: "Viewer" },
  ];
  model = signal({ name: "", role: "" });
  f = form(this.model, (p) => {
    required(p.name);
    required(p.role);
  });
}

const field = (cls: string) => $(`ui-field.${cls}`);

describe("ui-field", () => {
  it("wires a native input: label for, hint, aria-describedby", async () => {
    await boot(App);
    const input = field("stacked").querySelector("input")!;
    const label = field("stacked").querySelector("label")!;
    expect(label.getAttribute("for")).toBe(input.id);
    expect(input.getAttribute("aria-describedby")).toBe(document.getElementById(input.id + "-description")!.id);
    expect(document.getElementById(input.id + "-description")!.textContent).toBe("Your full name.");
    expect(field("stacked").className).not.toContain("grid-cols");
  });

  it("lays the label beside the control in the horizontal layout", async () => {
    await boot(App);
    const host = field("horizontal");
    expect(host.className).toContain("grid-cols-[var(--ui-field-label-width,8rem)_minmax(0,1fr)]");
    expect(host.querySelector("label")!.className).toContain("text-xs");
    expect(host.querySelector("p")!.className).toContain("col-start-2");
    expect(field("nolabel").querySelector("p")!.className).toContain("col-span-2");
  });

  it("names the ui-select trigger by the label and links hint and error", async () => {
    await boot(App);
    const host = field("horizontal");
    const label = host.querySelector("label")!;
    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    expect(trigger.getAttribute("aria-labelledby")).toBe(label.id);
    expect(label.getAttribute("for")).toBe(trigger.id);
    const hint = host.querySelector("p")!;
    expect(trigger.getAttribute("aria-describedby")).toBe(hint.id);
    // [field] sets invalid as soon as the field has errors (the forms convention); the message waits for touched
    expect(host.querySelector("[role=alert]")).toBeNull();
    // touching (blur) shows the required error and marks the trigger invalid
    trigger.dispatchEvent(new FocusEvent("blur"));
    await settle();
    const alert = host.querySelector("[role=alert]")!;
    expect(alert.textContent).toBe("This field is required.");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    expect(trigger.getAttribute("aria-describedby")).toBe(`${hint.id} ${alert.id}`);
  });

  it("shows a manual error without a state and marks the control", async () => {
    await boot(App);
    const host = field("manual");
    expect(host.querySelector("[role=alert]")!.textContent).toBe("Too long.");
    const area = host.querySelector("textarea")!;
    expect(area.getAttribute("aria-invalid")).toBe("true");
    expect(area.getAttribute("aria-describedby")).toBe(host.querySelector("[role=alert]")!.id);
  });

  it("has no axe violations", async () => {
    await boot(App);
    await expectNoA11yViolations(document.body);
  });
});
