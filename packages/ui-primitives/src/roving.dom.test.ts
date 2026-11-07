// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, html, signal, ErrorHandler } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import { UiRoving, UiRovingItem } from "./roving.js";

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

class App {
  static meta = {
    selector: "app-root",
    imports: [UiRoving, UiRovingItem],
    template: html`<div id="bar" uiRoving orientation="vertical" [loop]="false">
      @for (item of items(); track item.id) {
        <button uiRovingItem [id]="item.id" [disabled]="item.disabled">{{ item.id }}</button>
      }
    </div>`,
  };
  items = signal([
    { id: "a", disabled: false },
    { id: "b", disabled: true },
    { id: "c", disabled: false },
  ]);
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
  expect(Collector.reports).toEqual([]);
});
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 5));
    await whenFlushed();
  }
};
const boot = async () => {
  const ref = bootstrap(App as never, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: App; destroy(): void };
  destroy = () => ref.destroy();
  await settle();
  return ref.instance;
};
const $ = (id: string) => document.getElementById(id)!;
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const stops = () => [...document.querySelectorAll("button")].map((b) => b.getAttribute("tabindex"));

describe("roving tabindex in jsdom (uiRoving)", () => {
  it("applies the tab stop to items created after setup", async () => {
    await boot();
    expect(stops()).toEqual(["0", "-1", "-1"]);
  });

  it("moves with the vertical arrows, skipping the disabled item, without looping; real focus follows", async () => {
    await boot();
    $("a").focus();
    key($("a"), "ArrowRight"); // horizontal keys are ignored in a vertical group
    expect(document.activeElement).toBe($("a"));
    key($("a"), "ArrowDown");
    expect(document.activeElement).toBe($("c"));
    expect(stops()).toEqual(["-1", "-1", "0"]);
    key($("c"), "ArrowDown"); // end of a non-looping group
    expect(document.activeElement).toBe($("c"));
    key($("c"), "Home");
    expect(document.activeElement).toBe($("a"));
  });

  it("focusing an item with the pointer moves the tab stop, and new items are picked up", async () => {
    const app = await boot();
    $("c").focus();
    await settle();
    expect(stops()).toEqual(["-1", "-1", "0"]);
    app.items.update((l) => [...l, { id: "d", disabled: false }]);
    await settle();
    expect(stops()).toEqual(["-1", "-1", "0", "-1"]);
  });
});
