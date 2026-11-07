import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { pressKey, provideTestDom } from "@gable/ui-primitives/testing";
import { UiResizableHandle, UiResizablePanel, UiResizablePanelGroup } from "./resizable.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiResizablePanelGroup, UiResizablePanel, UiResizableHandle],
    template: html`<ui-resizable-panel-group [(layout)]="layout">
      <ui-resizable-panel [defaultSize]="25" [minSize]="10">One</ui-resizable-panel>
      <ui-resizable-handle></ui-resizable-handle>
      <ui-resizable-panel>Two</ui-resizable-panel>
    </ui-resizable-panel-group>`,
  };
  layout = signal<number[]>([]);
}

describe("Resizable (in-memory)", () => {
  it("renders panel shares and a splitter, and resizes by keyboard", async () => {
    const f = mount(App, { providers: provideTestDom() });
    await f.settle();
    const panels = f.queryAll("ui-resizable-panel");
    expect(panels.map((p) => p.attrs.style)).toEqual(["flex: 25 1 0px", "flex: 75 1 0px"]);
    expect(f.instance.layout()).toEqual([25, 75]);
    const handle = f.query("[role=separator]")!;
    expect(handle.attrs).toMatchObject({ "aria-orientation": "vertical", "aria-valuenow": "25", "aria-valuemin": "10", "aria-valuemax": "100", "aria-controls": panels[0]!.attrs.id });
    pressKey(f, handle, "ArrowRight");
    await f.settle();
    expect(f.instance.layout()).toEqual([35, 65]);
    expect(f.query("[role=separator]")!.attrs["aria-valuenow"]).toBe("35");
    pressKey(f, handle, "Home");
    await f.settle();
    expect(f.instance.layout()).toEqual([10, 90]);
  });
});
