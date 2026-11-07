import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { UiButton } from "./button.js";
import { UiButtonGroup, UiButtonGroupText } from "./button-group.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiButton, UiButtonGroup, UiButtonGroupText],
    template: html`<ui-button-group label="Alignment" class="extra"><button uiButton variant="outline">Left</button><button uiButton variant="outline">Right</button></ui-button-group>
      <ui-button-group [orientation]="orientation()"><span uiButtonGroupText>https://</span><button uiButton variant="outline">Go</button></ui-button-group>`,
  };
  orientation = signal<"horizontal" | "vertical">("vertical");
}

describe("ButtonGroup", () => {
  it("is a labelled group with joined child classes and merges the user's class", async () => {
    const f = mount(App);
    await f.settle();
    const [group] = f.queryAll("ui-button-group");
    expect(group!.attrs.role).toBe("group");
    expect(group!.attrs["aria-label"]).toBe("Alignment");
    expect(group!.attrs["data-orientation"]).toBe("horizontal");
    expect(group!.attrs.class).toContain("[&>*:not(:first-child)]:rounded-l-none");
    expect(group!.attrs.class).toContain("extra");
  });

  it("has no aria-label without a label and follows a bound orientation", async () => {
    const f = mount(App);
    await f.settle();
    const group = f.queryAll("ui-button-group")[1]!;
    expect(group.attrs["aria-label"]).toBeUndefined();
    expect(group.attrs["data-orientation"]).toBe("vertical");
    expect(group.attrs.class).toContain("flex-col");
    expect(group.attrs.class).toContain("[&>*:not(:first-child)]:rounded-t-none");
    f.instance.orientation.set("horizontal");
    await f.settle();
    expect(group.attrs.class).not.toContain("flex-col");
    expect(group.attrs["data-orientation"]).toBe("horizontal");
  });

  it("styles a text addon", async () => {
    const f = mount(App);
    await f.settle();
    expect(f.query("[uiButtonGroupText]")!.attrs.class).toContain("bg-muted");
  });
});
