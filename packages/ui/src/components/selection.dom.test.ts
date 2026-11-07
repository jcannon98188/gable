// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiAccordion, UiAccordionItem } from "./accordion.js";
import { UiAvatar } from "./avatar.js";
import { UiButton } from "./button.js";
import { CollapsibleTrigger, UiCollapsible } from "./collapsible.js";
import { UiProgress } from "./progress.js";
import { UiRadioGroup } from "./radio-group.js";
import { UiSlider } from "./slider.js";
import { UiToggle } from "./toggle.js";
import { UiToggleGroup } from "./toggle-group.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();
/** A real click focuses the button first (the accordion machine only reacts to clicks while a trigger has focus). */
const press = (el: HTMLElement) => {
  el.focus();
  el.click();
};

class App {
  static meta = {
    selector: "app-root",
    imports: [UiRadioGroup, UiSlider, UiToggle, UiToggleGroup, UiProgress, UiAvatar, UiAccordion, UiAccordionItem, UiCollapsible, CollapsibleTrigger, UiButton],
    template: html`
      <ui-radio-group [items]="plans" [(value)]="plan"></ui-radio-group>
      <ui-slider [(value)]="volume" [min]="0" [max]="10" [step]="2"></ui-slider>
      <button uiToggle [(pressed)]="bold" class="t-bold">B</button>
      <ui-toggle-group [items]="styles" [(value)]="chosen" type="multiple"></ui-toggle-group>
      <ui-progress [value]="percent()"></ui-progress>
      <ui-avatar src="/none.png" alt="Ada" fallback="AL"></ui-avatar>
      <ui-accordion [(value)]="open">
        <ui-accordion-item value="a" label="First">Alpha</ui-accordion-item>
        <ui-accordion-item value="b" label="Second">Beta</ui-accordion-item>
      </ui-accordion>
      <ui-collapsible [(open)]="shown"><button slot="trigger" collapsibleTrigger uiButton>More</button><p class="more">Hidden</p></ui-collapsible>
    `,
  };
  plans = [
    { value: "free", label: "Free" },
    { value: "pro", label: "Pro" },
    { value: "team", label: "Team", disabled: true },
  ];
  styles = [
    { value: "bold", label: "Bold" },
    { value: "italic", label: "Italic" },
  ];
  plan = signal("");
  volume = signal(4);
  bold = signal(false);
  chosen = signal<string[]>([]);
  percent = signal<number | null>(40);
  open = signal<string[]>([]);
  shown = signal(false);
}

describe("RadioGroup", () => {
  it("renders items, picks on click, follows the model and marks disabled", async () => {
    const app = await boot(App);
    const radios = () => $$("[data-scope=radio-group][data-part=item]");
    expect(radios()).toHaveLength(3);
    expect($("[role=radiogroup]")).toBeTruthy();
    radios()[1]!.click();
    await settle();
    expect(app.plan()).toBe("pro");
    expect(radios()[1]!.getAttribute("data-state")).toBe("checked");
    app.plan.set("free");
    await settle();
    expect(radios()[0]!.getAttribute("data-state")).toBe("checked");
    expect(radios()[2]!.hasAttribute("data-disabled")).toBe(true);
  });
});

describe("Slider", () => {
  it("the keyboard moves the thumb by step and clamps; the model moves the range", async () => {
    const app = await boot(App);
    const thumb = $("[data-scope=slider][data-part=thumb]");
    expect(thumb.getAttribute("aria-valuenow")).toBe("4");
    thumb.focus();
    key(thumb, "ArrowRight");
    await settle();
    expect(app.volume()).toBe(6);
    key(thumb, "End");
    await settle();
    expect(app.volume()).toBe(10);
    key(thumb, "ArrowRight");
    await settle();
    expect(app.volume()).toBe(10);
    app.volume.set(2);
    await settle();
    expect(thumb.getAttribute("aria-valuenow")).toBe("2");
  });
});

describe("Toggle and ToggleGroup", () => {
  it("toggles pressed and writes the model", async () => {
    const app = await boot(App);
    const bold = $(".t-bold");
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    bold.click();
    await settle();
    expect(app.bold()).toBe(true);
    expect(bold.getAttribute("aria-pressed")).toBe("true");
    expect(bold.className).toContain("rounded-md");
  });

  it("keeps a list of pressed values", async () => {
    const app = await boot(App);
    const items = () => $$("[data-scope=toggle-group][data-part=item]");
    items()[0]!.click();
    await settle();
    items()[1]!.click();
    await settle();
    expect(app.chosen()).toEqual(["bold", "italic"]);
    items()[0]!.click();
    await settle();
    expect(app.chosen()).toEqual(["italic"]);
    expect(items()[1]!.getAttribute("data-state")).toBe("on");
  });
});

describe("Progress and Avatar", () => {
  it("sets the bar width and aria values, and an indeterminate bar", async () => {
    const app = await boot(App);
    expect($("[role=progressbar]").getAttribute("aria-valuenow")).toBe("40");
    expect($("[data-scope=progress][data-part=range]").style.width).toBe("40%");
    app.percent.set(null);
    await settle();
    expect($("[data-scope=progress][data-part=range]").getAttribute("data-state")).toBe("indeterminate");
  });

  it("shows the fallback until the image loads", async () => {
    await boot(App);
    expect($("[data-scope=avatar][data-part=fallback]").hidden).toBe(false);
    expect($("[data-scope=avatar][data-part=fallback]").textContent).toContain("AL");
    expect($("[data-scope=avatar][data-part=image]").hidden).toBe(true);
    const img = $<HTMLImageElement>("[data-scope=avatar][data-part=image]");
    img.dispatchEvent(new Event("load"));
    await settle();
    expect($("[data-scope=avatar][data-part=fallback]").hidden).toBe(true);
    expect(img.hidden).toBe(false);
  });
});

describe("Accordion and Collapsible", () => {
  it("opens one item at a time and closes it again", async () => {
    const app = await boot(App);
    const triggers = () => $$("[data-scope=accordion][data-part=item-trigger]");
    const contents = () => $$("[data-scope=accordion][data-part=item-content]");
    expect(triggers()).toHaveLength(2);
    expect(contents()[0]!.hidden).toBe(true);
    press(triggers()[0]!);
    await settle();
    expect(app.open()).toEqual(["a"]);
    expect(contents()[0]!.hidden).toBe(false);
    expect(triggers()[0]!.getAttribute("aria-expanded")).toBe("true");
    press(triggers()[1]!);
    await settle();
    expect(app.open()).toEqual(["b"]);
    press(triggers()[1]!);
    await settle();
    expect(app.open()).toEqual([]);
  });

  it("moves between triggers with the arrow keys", async () => {
    await boot(App);
    const triggers = $$("[data-scope=accordion][data-part=item-trigger]");
    triggers[0]!.focus();
    key(triggers[0]!, "ArrowDown");
    await settle();
    expect(document.activeElement).toBe(triggers[1]);
  });

  it("toggles the collapsible from its projected trigger", async () => {
    const app = await boot(App);
    expect($("[data-scope=collapsible][data-part=content]").hasAttribute("hidden")).toBe(true);
    $("[data-scope=collapsible][data-part=trigger]").click();
    await settle();
    expect(app.shown()).toBe(true);
    expect($("[data-scope=collapsible][data-part=content]").hasAttribute("hidden")).toBe(false);
    expect($("[data-scope=collapsible][data-part=trigger]").getAttribute("aria-expanded")).toBe("true");
  });
});
