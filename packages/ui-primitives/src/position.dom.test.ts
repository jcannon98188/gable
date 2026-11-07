// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap, html, signal, ErrorHandler } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import { UiPosition } from "./position.js";

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

class App {
  static meta = {
    selector: "app-root",
    imports: [UiPosition],
    template: html`<div id="scroller" style="overflow: auto"><button id="anchor">anchor</button></div>
      @if (alive()) {
        <div id="pop" uiPosition="anchor" [placement]="placement()" [offset]="offset()" [open]="open()">content</div>
      }`,
  };
  alive = signal(true);
  open = signal(true);
  placement = signal<"bottom" | "top">("bottom");
  offset = signal(0);
}

let host: HTMLElement;
let destroy: () => void = () => {};
beforeEach(() => {
  Collector.reports.length = 0;
  document.body.replaceChildren();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  destroy();
  destroy = () => {};
  vi.restoreAllMocks();
  expect(Collector.reports).toEqual([]);
});
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const boot = async () => {
  const ref = bootstrap(App as never, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: App; destroy(): void };
  destroy = () => ref.destroy();
  await settle();
  return ref.instance;
};
const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;

// jsdom has no layout: give the anchor and the floating element rects.
let anchorTop = 100;
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} }) as DOMRect;
function fakeLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.id === "anchor" ? rect(50, anchorTop, 80, 20) : this.id === "pop" ? rect(0, 0, 100, 40) : rect(0, 0, 0, 0);
  });
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(1000);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.id === "pop" ? 100 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.id === "pop" ? 40 : 0;
  });
}
const px = (el: HTMLElement, p: "left" | "top") => parseFloat(el.style[p]);

describe("positioning in jsdom", () => {
  beforeEach(() => {
    anchorTop = 100;
    fakeLayout();
  });

  it("places the element against the anchor (by id) and exposes the placement", async () => {
    await boot();
    const pop = $("#pop");
    expect(pop.style.position).toBe("absolute");
    expect(px(pop, "top")).toBe(120); // below the anchor (top 100 + height 20)
    expect(px(pop, "left")).toBe(50 + 40 - 50); // centred: anchor center 90, popup width 100
    expect(pop.getAttribute("data-placement")).toBe("bottom");
  });

  it("re-positions when inputs change", async () => {
    const app = await boot();
    app.placement.set("top");
    app.offset.set(10);
    await settle();
    expect(px($("#pop"), "top")).toBe(100 - 40 - 10);
    expect($("#pop").getAttribute("data-placement")).toBe("top");
  });

  it("updates on window resize and on scroll of an ancestor", async () => {
    await boot();
    anchorTop = 200;
    window.dispatchEvent(new Event("resize"));
    await settle();
    expect(px($("#pop"), "top")).toBe(220);
    anchorTop = 300;
    $("#scroller").dispatchEvent(new Event("scroll"));
    await settle();
    expect(px($("#pop"), "top")).toBe(320);
  });

  it("stops updating when closed and resumes when reopened", async () => {
    const app = await boot();
    app.open.set(false);
    await settle();
    anchorTop = 200;
    window.dispatchEvent(new Event("resize"));
    await settle();
    expect(px($("#pop"), "top")).toBe(120);
    app.open.set(true);
    await settle();
    expect(px($("#pop"), "top")).toBe(220);
  });

  it("removes its listeners when the scope is disposed (the element is removed)", async () => {
    const app = await boot();
    const remove = vi.spyOn(window, "removeEventListener");
    app.alive.set(false);
    await settle();
    expect(remove.mock.calls.some(([type]) => type === "resize")).toBe(true);
    anchorTop = 500;
    window.dispatchEvent(new Event("resize"));
    await settle();
    expect(document.querySelector("#pop")).toBeNull();
  });

  it("removes its listeners when the whole app is destroyed", async () => {
    await boot();
    const remove = vi.spyOn(window, "removeEventListener");
    destroy();
    destroy = () => {};
    await settle();
    expect(remove.mock.calls.filter(([type]) => type === "resize").length).toBeGreaterThan(0);
  });
});
