// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, html, inject, signal, ErrorHandler } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import { DIALOG, DialogState } from "./dialog.js";
import { UiPortal } from "./portal.js";

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

class App {
  static meta = {
    selector: "app-root",
    providers: [DialogState],
    imports: [UiPortal, ...DIALOG],
    template: html`<div id="clip" style="overflow: hidden">
      <button uiDialogTrigger id="open">Open</button>
      @if (alive()) {
        <ui-portal>
          <div uiDialogBackdrop></div>
          <div uiDialogPositioner>
            <div uiDialogContent><h2 uiDialogTitle>{{ title() }}</h2><button uiDialogClose id="close">x</button><input id="field" /></div>
          </div>
        </ui-portal>
      }
    </div>`,
  };
  alive = signal(true);
  title = signal("Hello");
  open = signal(false);
  dialog = inject(DialogState).bind(() => ({ open: this.open(), onOpenChange: (d) => this.open.set(d.open) }));
}

let host: HTMLElement;
let destroy: () => void = () => {};
const realRaf = globalThis.requestAnimationFrame;
beforeEach(() => {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  Collector.reports.length = 0;
  document.body.replaceChildren();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  destroy();
  destroy = () => {};
  expect(Collector.reports).toEqual([]);
});
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await whenFlushed();
  }
};
const boot = async (options: { overlayRoot?: Element } = {}) => {
  const ref = bootstrap(App as never, { renderer: createDomRenderer(options), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: App; destroy(): void };
  destroy = () => ref.destroy();
  await settle();
  return ref.instance;
};
const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;

describe("ui-portal in jsdom", () => {
  it("moves the dialog parts to document.body, outside the clipping ancestor, and keeps bindings live", async () => {
    const app = await boot();
    expect($("#clip [role=dialog]")).toBeNull();
    expect($("[role=dialog]").closest("ui-portal")!.parentElement).toBe(document.body);
    app.title.set("Changed");
    await settle();
    expect($("[role=dialog] h2").textContent).toBe("Changed");
    expect($("[role=dialog]").getAttribute("aria-labelledby")).toBe($("h2").id);
  });

  it("still opens, focuses into the dialog, closes on Escape and the close button after the move", async () => {
    const app = await boot();
    $("#open").click();
    await settle();
    expect(app.open()).toBe(true);
    expect($("[role=dialog]").hidden).toBe(false);
    expect($("[role=dialog]").contains(document.activeElement)).toBe(true);
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await settle();
    expect(app.open()).toBe(false);
    app.open.set(true);
    await settle();
    $("#close").click();
    await settle();
    expect(app.open()).toBe(false);
  });

  it("removes the moved nodes when the portal's scope is disposed", async () => {
    const app = await boot();
    expect(document.body.querySelectorAll("ui-portal").length).toBe(1);
    app.alive.set(false);
    await settle();
    expect(document.body.querySelectorAll("ui-portal").length).toBe(0);
    app.alive.set(true);
    await settle();
    expect(document.body.querySelectorAll("ui-portal").length).toBe(1);
    destroy();
    destroy = () => {};
    expect(document.body.querySelectorAll("ui-portal").length).toBe(0);
  });

  it("honours a dedicated overlayRoot container", async () => {
    const container = document.createElement("div");
    container.id = "overlays";
    document.body.append(container);
    await boot({ overlayRoot: container });
    expect($("#overlays [role=dialog]")).not.toBeNull();
  });
});
