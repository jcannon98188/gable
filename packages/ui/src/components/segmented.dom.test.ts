// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiButton } from "./button.js";
import { UiButtonGroup } from "./button-group.js";
import { UiToggleGroup, type ToggleGroupItem } from "./toggle-group.js";
import { UiBadge } from "./badge.js";
import { UiIcon } from "../lib/icon.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiToggleGroup, UiButtonGroup, UiButton, UiIcon, UiBadge],
    template: html`
      <ui-toggle-group class="modes" [items]="modes" [(value)]="mode" [segmented]="true" size="sm"></ui-toggle-group>
      <ui-button-group class="devices" label="Device" [segmented]="true" size="sm">
        <button uiButton variant="ghost" [attr.aria-pressed]="phoneOn()" (click)="device.set('phone')">Phone</button>
        <button uiButton variant="ghost" [attr.aria-pressed]="tabletOn()" (click)="device.set('tablet')">Tablet</button>
        <button uiButton variant="ghost" aria-label="Close"><svg uiIcon="x"></svg></button>
      </ui-button-group>
      <span uiBadge variant="error" class="sev">error</span>
    `,
  };
  modes: ToggleGroupItem[] = [
    { value: "design", label: "Design" },
    { value: "code", label: "Code" },
    { value: "clear", label: "Clear", icon: "x", iconOnly: true },
  ];
  mode = signal<string[]>(["design"]);
  device = signal("phone");
  phoneOn = () => (this.device() === "phone" ? "true" : "false");
  tabletOn = () => (this.device() === "tablet" ? "true" : "false");
}

describe("segmented toggle group", () => {
  it("is a connected track with a compact size and a selected segment", async () => {
    const app = await boot(App);
    const track = $(".modes");
    expect(track.className).toContain("border");
    const items = $$(".modes [data-part=item]");
    expect(items).toHaveLength(3);
    expect(items[0]!.className).toContain("h-6.5");
    expect(items[0]!.getAttribute("data-state")).toBe("on");
    items[1]!.click();
    await settle();
    expect(app.mode()).toEqual(["code"]);
    expect(items[0]!.getAttribute("data-state")).toBe("off");
  });

  it("keeps the toggle group's keyboard roving and aria", async () => {
    await boot(App);
    const items = $$(".modes [data-part=item]");
    expect($(".modes").getAttribute("role")).toBe("radiogroup");
    expect($(".modes").getAttribute("tabindex")).toBe("0");
    items[0]!.focus();
    key(items[0]!, "ArrowRight");
    await settle();
    expect(document.activeElement).toBe(items[1]);
  });

  it("names an icon-only segment from its label", async () => {
    await boot(App);
    const icon = $$(".modes [data-part=item]")[2]!;
    expect(icon.querySelector("svg")).not.toBeNull();
    expect(icon.querySelector(".sr-only")!.textContent).toBe("Clear");
    expect(icon.getAttribute("title")).toBe("Clear");
  });
});

describe("segmented button group", () => {
  it("renders the track, the small size and a selected state", async () => {
    const app = await boot(App);
    const group = $(".devices");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("data-size")).toBe("sm");
    expect(group.hasAttribute("data-segmented")).toBe(true);
    expect(group.className).toContain("[&>[aria-pressed=true]]:bg-background");
    expect(group.className).toContain("[&>*]:h-6.5");
    const [phone, tablet] = $$(".devices button");
    expect(phone!.getAttribute("aria-pressed")).toBe("true");
    tablet!.click();
    await settle();
    expect(app.device()).toBe("tablet");
    expect(tablet!.getAttribute("aria-pressed")).toBe("true");
    expect(phone!.getAttribute("aria-pressed")).toBe("false");
  });

  it("has no axe violations (the icon-only segments are named)", async () => {
    await boot(App);
    await expectNoA11yViolations(document.body);
  });
});

describe("severity badge", () => {
  it("has a variant per severity", async () => {
    await boot(App);
    expect($(".sev").className).toContain("text-destructive");
  });
});
