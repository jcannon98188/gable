// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, html, inject, signal, ErrorHandler } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import { DIALOG, DialogState } from "./dialog.js";
import { TABS, TabsState } from "./tabs.js";

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
        <div uiDialogContent>
          <h2 uiDialogTitle>Title</h2>
          <button uiDialogClose id="close">x</button>
          <input id="field" />
        </div>
      </div>`,
  };
  open = signal(false);
  dialog = inject(DialogState).bind(() => ({ open: this.open(), onOpenChange: (d) => this.open.set(d.open) }));
}

class TabsApp {
  static meta = {
    selector: "app-root",
    providers: [TabsState],
    imports: [...TABS],
    template: html`<div uiTabsRoot>
      <div uiTabsList>
        <button uiTabTrigger="a">A</button>
        <button uiTabTrigger="b">B</button>
        <button uiTabTrigger="c" [disabled]="true">C</button>
        <button uiTabTrigger="d">D</button>
      </div>
      <div uiTabContent="a">pa</div>
      <div uiTabContent="b">pb</div>
      <div uiTabContent="d">pd</div>
    </div>`,
  };
  tab = signal<string | null>("a");
  tabs = inject(TabsState).bind(() => ({ value: this.tab(), onValueChange: (d) => this.tab.set(d.value) }));
}

let host: HTMLElement;
let destroy: () => void = () => {};
// jsdom runs all requestAnimationFrame callbacks of a frame in one loop, with no microtask checkpoint between them
// (a browser has one). Zag chains two frames (focus the next tab, then select the focused one), so give each its own task.
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
const boot = async <T extends object>(Root: new () => T) => {
  const ref = bootstrap(Root as never, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: T; destroy(): void };
  destroy = () => ref.destroy();
  await settle();
  return ref.instance;
};
const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

describe("dialog in jsdom", () => {
  it("opens, shows the content and closes with the close button", async () => {
    const app = await boot(DialogApp);
    expect($("[role=dialog]").hidden).toBe(true);
    expect($("#open").getAttribute("aria-expanded")).toBe("false");
    $("#open").click();
    await settle();
    expect(app.open()).toBe(true);
    expect($("[role=dialog]").hidden).toBe(false);
    expect($("[role=dialog]").getAttribute("data-state")).toBe("open");
    expect($("#open").getAttribute("aria-expanded")).toBe("true");
    $("#close").click();
    await settle();
    expect(app.open()).toBe(false);
    expect($("[role=dialog]").hidden).toBe(true);
  });

  it("moves focus into the dialog and closes on Escape", async () => {
    const app = await boot(DialogApp);
    app.open.set(true);
    await settle();
    expect($("[role=dialog]").contains(document.activeElement)).toBe(true);
    key(document.activeElement ?? document.body, "Escape");
    await settle();
    expect(app.open()).toBe(false);
    expect($("[role=dialog]").hidden).toBe(true);
  });

  it("stops listening when the component is destroyed", async () => {
    const app = await boot(DialogApp);
    const trigger = $("#open");
    destroy();
    destroy = () => {};
    trigger.click();
    await settle();
    expect(app.open()).toBe(false);
  });
});

describe("tabs in jsdom", () => {
  it("renders roles and selection", async () => {
    await boot(TabsApp);
    expect($("[role=tablist]").getAttribute("aria-orientation")).toBe("horizontal");
    expect($("[data-value=a]").getAttribute("aria-selected")).toBe("true");
    expect($("[data-value=b]").getAttribute("aria-selected")).toBe("false");
    expect($("[role=tabpanel]:not([hidden])").textContent).toBe("pa");
  });

  it("selects on click", async () => {
    const app = await boot(TabsApp);
    $("[data-value=b]").click();
    await settle();
    expect(app.tab()).toBe("b");
    expect($("[role=tabpanel]:not([hidden])").textContent).toBe("pb");
  });

  it("moves focus and selection with the arrow keys, skipping disabled tabs", async () => {
    const app = await boot(TabsApp);
    $("[data-value=a]").focus();
    await settle();
    key($("[data-value=a]"), "ArrowRight");
    await settle();
    expect(document.activeElement).toBe($("[data-value=b]"));
    expect(app.tab()).toBe("b");
    key($("[data-value=b]"), "ArrowRight");
    await settle();
    expect(document.activeElement).toBe($("[data-value=d]"));
    expect(app.tab()).toBe("d");
    key($("[data-value=d]"), "ArrowRight");
    await settle();
    expect(app.tab()).toBe("a");
    key($("[data-value=a]"), "End");
    await settle();
    expect(app.tab()).toBe("d");
    key($("[data-value=d]"), "Home");
    await settle();
    expect(app.tab()).toBe("a");
    expect($("[data-value=a]").getAttribute("tabindex")).toBe("0");
    expect($("[data-value=b]").getAttribute("tabindex")).toBe("-1");
  });
});
