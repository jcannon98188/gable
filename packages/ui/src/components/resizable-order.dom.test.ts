// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { UiResizableHandle, UiResizablePanel, UiResizablePanelGroup } from "./resizable.js";
import { $, $$, key, pointer, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiResizablePanelGroup, UiResizablePanel, UiResizableHandle],
    template: html`<ui-resizable-panel-group id="g" [(layout)]="layout">
      <ui-resizable-panel id="a" [defaultSize]="50">A</ui-resizable-panel>
      @if (showMiddle()) {
        <ui-resizable-handle id="hm"></ui-resizable-handle>
        <ui-resizable-panel id="m" [defaultSize]="20">M</ui-resizable-panel>
      }
      <ui-resizable-handle id="hz"></ui-resizable-handle>
      <ui-resizable-panel id="z" [defaultSize]="30">Z</ui-resizable-panel>
    </ui-resizable-panel-group>`,
  };
  showMiddle = signal(false);
  layout = signal<number[]>([]);
}

const order = () => $$("ui-resizable-panel").map((p) => p.id);
const controls = () => $$("ui-resizable-handle").map((h) => h.getAttribute("aria-controls"));

describe("Resizable panel order", () => {
  it("a panel added in the middle later takes its document position, with handles matched to it", async () => {
    const app = await boot(App);
    expect(app.layout()).toEqual([62.5, 37.5]);
    app.showMiddle.set(true);
    await settle();
    expect(order()).toEqual(["a", "m", "z"]);
    expect(app.layout()).toEqual([50, 20, 30]);
    expect($("#a").getAttribute("style")).toContain("flex: 50 1 0px");
    expect($("#m").getAttribute("style")).toContain("flex: 20 1 0px");
    expect($("#z").getAttribute("style")).toContain("flex: 30 1 0px");
    expect(controls()).toEqual(["a", "m"]);
    app.showMiddle.set(false);
    await settle();
    expect(app.layout()).toEqual([62.5, 37.5]);
    expect(controls()).toEqual(["a"]);
  });
});

class RtlApp {
  static meta = {
    selector: "app-root",
    imports: [UiResizablePanelGroup, UiResizablePanel, UiResizableHandle],
    template: html`<div dir="rtl">
      <ui-resizable-panel-group id="g" [(layout)]="layout">
        <ui-resizable-panel id="a" [defaultSize]="50">A</ui-resizable-panel>
        <ui-resizable-handle id="h"></ui-resizable-handle>
        <ui-resizable-panel id="b" [defaultSize]="50">B</ui-resizable-panel>
      </ui-resizable-panel-group>
    </div>`,
  };
  layout = signal<number[]>([]);
}

describe("Resizable RTL", () => {
  it("mirrors arrow keys and pointer drags in a right-to-left horizontal group", async () => {
    const app = await boot(RtlApp);
    $("#g").getBoundingClientRect = () => ({ width: 1000, height: 500 }) as DOMRect;
    key($("#h"), "ArrowLeft");
    await settle();
    expect(app.layout()).toEqual([60, 40]);
    const h = $("#h");
    pointer(h, "pointerdown", { clientX: 400, clientY: 0, button: 0 });
    pointer(h, "pointermove", { clientX: 300, clientY: 0 });
    pointer(h, "pointerup", { clientX: 300, clientY: 0 });
    await settle();
    expect(app.layout()).toEqual([70, 30]);
  });
});
