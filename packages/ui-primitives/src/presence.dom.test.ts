// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, html, inject, signal, ErrorHandler } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import { DIALOG, DialogState } from "./dialog.js";
import { UiPresence } from "./presence.js";

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

class DialogApp {
  static meta = {
    selector: "app-root",
    providers: [DialogState],
    imports: [...DIALOG],
    template: html`<button uiDialogTrigger id="open">Open</button>
      <div uiDialogBackdrop></div>
      <div uiDialogPositioner>
        <div uiDialogContent><button uiDialogClose id="close">x</button></div>
      </div>`,
  };
  open = signal(false);
  dialog = inject(DialogState).bind(() => ({ open: this.open(), onOpenChange: (d) => this.open.set(d.open) }));
}

class IfApp {
  static meta = {
    selector: "app-root",
    imports: [UiPresence],
    template: html`@if (open()) {
      <div id="box" uiPresence>box</div>
    }`,
  };
  open = signal(true);
}

let host: HTMLElement;
let destroy: () => void = () => {};
let style: HTMLStyleElement;
const realRaf = globalThis.requestAnimationFrame;
beforeEach(() => {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  Collector.reports.length = 0;
  document.body.replaceChildren();
  host = document.createElement("div");
  style = document.createElement("style");
  document.head.append(style);
  document.body.append(host);
});
afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  style.remove();
  destroy();
  destroy = () => {};
  expect(Collector.reports).toEqual([]);
});

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const boot = async <T extends object>(Root: new () => T) => {
  const ref = bootstrap(Root as never, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: T; destroy(): void };
  destroy = () => ref.destroy();
  await settle();
  return ref.instance;
};
const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
const ended = (el: Element, type = "animationend") => el.dispatchEvent(new Event(type, { bubbles: true }));

describe("presence in jsdom (computed style decides whether there is an exit animation)", () => {
  it("no CSS animation: @if removes at once", async () => {
    const app = await boot(IfApp);
    expect($("#box")!.getAttribute("data-state")).toBe("open");
    app.open.set(false);
    await settle();
    expect($("#box")).toBeNull();
  });

  it("CSS exit animation: closed state shows, node leaves on animationend", async () => {
    style.textContent = "[data-state=closed] { animation-name: out; animation-duration: 0.3s; }";
    const app = await boot(IfApp);
    const box = $("#box")!;
    app.open.set(false);
    await settle();
    expect($("#box")).toBe(box);
    expect(box.getAttribute("data-state")).toBe("closed");
    ended(box);
    await settle();
    expect($("#box")).toBeNull();
  });

  it("transition: waits for transitionend", async () => {
    style.textContent = "#box { transition: opacity 0.2s; }";
    const app = await boot(IfApp);
    app.open.set(false);
    await settle();
    expect($("#box")).not.toBeNull();
    ended($("#box")!, "transitionend");
    await settle();
    expect($("#box")).toBeNull();
  });

  it("dialog keeps content visible while it animates out, then hides it", async () => {
    style.textContent = "[data-state=closed] { animation: out 0.3s; }";
    const app = await boot(DialogApp);
    const content = $("[role=dialog]")!;
    expect(content.hidden).toBe(true);
    $("#open")!.click();
    await settle();
    expect(content.hidden).toBe(false);
    $("#close")!.click();
    await settle();
    expect(app.open()).toBe(false);
    expect(content.getAttribute("data-state")).toBe("closed");
    expect(content.hidden).toBe(false);
    ended(content);
    await settle();
    expect(content.hidden).toBe(true);
  });

  it("dialog without CSS animation hides at once", async () => {
    await boot(DialogApp);
    $("#open")!.click();
    await settle();
    $("#close")!.click();
    await settle();
    expect($("[role=dialog]")!.hidden).toBe(true);
  });
});
