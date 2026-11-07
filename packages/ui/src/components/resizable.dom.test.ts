// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html, signal } from "@gable/core";
import { UiResizableHandle, UiResizablePanel, UiResizablePanelGroup } from "./resizable.js";
import { $, $$, key, pointer, settle, useDomApp } from "../test-utils.js";

const boot = useDomApp();

class App {
  static meta = {
    selector: "app-root",
    imports: [UiResizablePanelGroup, UiResizablePanel, UiResizableHandle],
    template: html`<ui-resizable-panel-group id="g" label="Workspace" [direction]="direction()" [autoSaveId]="saveId()" [(layout)]="layout">
      <ui-resizable-panel id="a" [defaultSize]="30" [minSize]="20" [collapsible]="true">Sidebar</ui-resizable-panel>
      <ui-resizable-handle id="h1" [withHandle]="true" label="Resize sidebar"></ui-resizable-handle>
      <ui-resizable-panel id="b" [minSize]="20">Main</ui-resizable-panel>
      <ui-resizable-handle id="h2"></ui-resizable-handle>
      <ui-resizable-panel id="c" [defaultSize]="20">Aside</ui-resizable-panel>
    </ui-resizable-panel-group>`,
  };
  direction = signal<"horizontal" | "vertical">("horizontal");
  saveId = signal("");
  layout = signal<number[]>([]);
}

const flexOf = (id: string) => $(id).getAttribute("style")!;
const handle = (id: string) => $(id);
/** jsdom has no layout: the group is 1000px wide and 500px high. */
function fakeLayout() {
  $("#g").getBoundingClientRect = () => ({ width: 1000, height: 500 }) as DOMRect;
}
const fire = (el: Element, type: string, x: number, y = 0) => pointer(el, type, { clientX: x, clientY: y });

let store: Record<string, string>;
beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Resizable semantics", () => {
  it("lays panels out by percentage and makes handles window splitters", async () => {
    const app = await boot(App);
    expect(flexOf("#a")).toContain("flex: 30 1 0px");
    expect(flexOf("#b")).toContain("flex: 50 1 0px");
    expect(flexOf("#c")).toContain("flex: 20 1 0px");
    expect(app.layout()).toEqual([30, 50, 20]);
    const h = handle("#h1");
    expect(h.getAttribute("role")).toBe("separator");
    expect(h.getAttribute("tabindex")).toBe("0");
    expect(h.getAttribute("aria-orientation")).toBe("vertical");
    expect(h.getAttribute("aria-valuenow")).toBe("30");
    expect(h.getAttribute("aria-valuemin")).toBe("0");
    expect(h.getAttribute("aria-valuemax")).toBe("60");
    expect(h.getAttribute("aria-controls")).toBe($("#a").id);
    expect(h.getAttribute("aria-label")).toBe("Resize sidebar");
    expect(handle("#h2").getAttribute("aria-controls")).toBe($("#b").id);
    expect($("#g").getAttribute("role")).toBe("group");
    expect(h.querySelector("svg")).not.toBeNull();
    expect(handle("#h2").querySelector("svg")).toBeNull();
  });

  it("a vertical group has horizontal separators", async () => {
    const app = await boot(App);
    app.direction.set("vertical");
    await settle();
    expect(handle("#h1").getAttribute("aria-orientation")).toBe("horizontal");
    expect($("#g").getAttribute("data-direction")).toBe("vertical");
  });
});

describe("Resizable pointer", () => {
  it("dragging a handle moves the two panels beside it", async () => {
    const app = await boot(App);
    fakeLayout();
    const h = handle("#h1");
    fire(h, "pointerdown", 300);
    await settle();
    expect(h.hasAttribute("data-dragging")).toBe(true);
    fire(h, "pointermove", 400);
    await settle();
    expect(app.layout()).toEqual([40, 40, 20]);
    expect(flexOf("#a")).toContain("flex: 40 1 0px");
    expect(h.getAttribute("aria-valuenow")).toBe("40");
    fire(h, "pointerup", 400);
    await settle();
    expect(h.hasAttribute("data-dragging")).toBe(false);
    fire(h, "pointermove", 900);
    expect(app.layout()).toEqual([40, 40, 20]);
  });

  it("measures a vertical group by its height", async () => {
    const app = await boot(App);
    app.direction.set("vertical");
    await settle();
    fakeLayout();
    const h = handle("#h2");
    fire(h, "pointerdown", 0, 100);
    fire(h, "pointermove", 0, 150);
    fire(h, "pointerup", 0, 150);
    await settle();
    expect(app.layout()).toEqual([30, 60, 10]);
  });

  it("respects minimum sizes and collapses a collapsible panel", async () => {
    const app = await boot(App);
    fakeLayout();
    const h = handle("#h1");
    fire(h, "pointerdown", 300);
    fire(h, "pointermove", 210);
    await settle();
    expect(app.layout()[0]).toBe(21);
    fire(h, "pointermove", 160);
    await settle();
    expect(app.layout()[0]).toBe(20);
    fire(h, "pointermove", 50);
    await settle();
    expect(app.layout()).toEqual([0, 80, 20]);
    expect($("#a").getAttribute("data-state")).toBe("collapsed");
    fire(h, "pointercancel", 50);
  });
});

describe("Resizable keyboard", () => {
  it("arrows, Home, End and Enter operate the splitter and are consumed", async () => {
    const app = await boot(App);
    const h = handle("#h1");
    expect(key(h, "ArrowRight")).toBe(false);
    await settle();
    expect(app.layout()).toEqual([40, 40, 20]);
    key(h, "ArrowLeft");
    key(h, "ArrowLeft");
    await settle();
    expect(app.layout()[0]).toBe(20);
    key(h, "End");
    await settle();
    expect(app.layout()).toEqual([60, 20, 20]);
    key(h, "Home");
    await settle();
    expect(app.layout()[0]).toBe(20);
    key(h, "Enter");
    await settle();
    expect(app.layout()).toEqual([0, 80, 20]);
    expect(h.getAttribute("aria-valuenow")).toBe("0");
    key(h, "Enter");
    await settle();
    expect(app.layout()).toEqual([20, 60, 20]);
    expect(key(h, "a")).toBe(true);
    expect(key(h, "ArrowDown")).toBe(true);
  });

  it("a vertical group answers Up and Down", async () => {
    const app = await boot(App);
    app.direction.set("vertical");
    await settle();
    key(handle("#h2"), "ArrowUp");
    await settle();
    expect(app.layout()).toEqual([30, 40, 30]);
    key(handle("#h2"), "ArrowLeft");
    await settle();
    expect(app.layout()).toEqual([30, 40, 30]);
  });
});

describe("Resizable persistence", () => {
  it("binds the layout both ways", async () => {
    const app = await boot(App);
    app.layout.set([25, 25, 50]);
    await settle();
    expect(flexOf("#c")).toContain("flex: 50 1 0px");
    app.layout.set([1, 2, 3]);
    await settle();
    expect(flexOf("#c")).toContain("flex: 50 1 0px");
  });

  it("autoSaveId saves to localStorage and restores on the next boot", async () => {
    const app = await boot(App);
    app.saveId.set("ws");
    await settle();
    key(handle("#h1"), "ArrowRight");
    await settle();
    expect(JSON.parse(store["gable-ui:resizable:ws"]!)).toEqual([40, 40, 20]);
  });

  it("restores a saved layout, and ignores a broken one", async () => {
    class Saved extends App {}
    store["gable-ui:resizable:ws"] = JSON.stringify([10, 70, 20]);
    Saved.meta = { ...App.meta, template: html`<ui-resizable-panel-group id="g" autoSaveId="ws"><ui-resizable-panel id="a" [defaultSize]="30">A</ui-resizable-panel><ui-resizable-handle></ui-resizable-handle><ui-resizable-panel id="b">B</ui-resizable-panel><ui-resizable-handle></ui-resizable-handle><ui-resizable-panel id="c">C</ui-resizable-panel></ui-resizable-panel-group>` };
    await boot(Saved);
    expect(flexOf("#a")).toContain("flex: 10 1 0px");
    expect(flexOf("#b")).toContain("flex: 70 1 0px");
  });

  it("survives storage that throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    });
    const app = await boot(App);
    app.saveId.set("ws");
    await settle();
    key(handle("#h1"), "ArrowRight");
    await settle();
    expect(app.layout()).toEqual([40, 40, 20]);
  });
});

describe("Resizable accessibility", () => {
  it("has no axe violations, horizontal and vertical", async () => {
    const { expectNoA11yViolations } = await import("@gable/testing/a11y");
    const app = await boot(App);
    await expectNoA11yViolations(document.body);
    app.direction.set("vertical");
    await settle();
    await expectNoA11yViolations(document.body);
    expect($$("[role=separator]")).toHaveLength(2);
  });
});
