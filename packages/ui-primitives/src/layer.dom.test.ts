// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, html, signal, ErrorHandler } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { createDomRenderer } from "@gable/renderer-dom";
import { UiLayer } from "./layer.js";
import { DIALOG, DialogState } from "./dialog.js";
import { inject } from "@gable/core";

class Collector extends ErrorHandler {
  static reports: unknown[] = [];
  override handleError(error: unknown): void {
    Collector.reports.push(error);
  }
}

class App {
  static meta = {
    selector: "app-root",
    imports: [UiLayer],
    template: html`<button id="outside">outside</button>
      <section id="sibling">sibling</section>
      <div id="a" uiLayer [open]="a()" (dismiss)="a.set(false)"><button id="a1">a1</button><button id="a2">a2</button></div>
      <div id="b" uiLayer [open]="b()" (dismiss)="b.set(false)"><button id="b1">b1</button></div>
      <div id="p" uiLayer [modal]="false" [open]="p()" (dismiss)="p.set(false)"><button id="p1">p1</button></div>`,
  };
  a = signal(false);
  b = signal(false);
  p = signal(false);
}

class MixedApp {
  static meta = {
    selector: "app-root",
    providers: [DialogState],
    imports: [UiLayer, ...DIALOG],
    template: html`<div uiDialogPositioner><div uiDialogContent><button id="d1">d</button></div></div>
      <div id="pop" uiLayer [modal]="false" [open]="pop()" (dismiss)="pop.set(false)"><button id="pop1">p</button></div>`,
  };
  open = signal(false);
  pop = signal(false);
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
  document.body.removeAttribute("style");
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
const boot = async (Root: new () => object = App): Promise<any> => {
  const ref = bootstrap(Root as never, { renderer: createDomRenderer(), target: host, providers: [{ provide: ErrorHandler, useClass: Collector }] }) as unknown as { instance: App; destroy(): void };
  destroy = () => ref.destroy();
  await settle();
  return ref.instance;
};
const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const press = (el: Element) => {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
};

describe("layer stack in jsdom", () => {
  it("Escape dismisses only the topmost layer, then the next", async () => {
    const app = await boot();
    app.a.set(true);
    await settle();
    app.b.set(true);
    await settle();
    key($("#b1"), "Escape");
    await settle();
    expect([app.a(), app.b()]).toEqual([true, false]);
    key($("#a1"), "Escape");
    await settle();
    expect([app.a(), app.b()]).toEqual([false, false]);
  });

  it("an outside press dismisses only the topmost layer; a press inside a nested layer is not outside for its parent", async () => {
    const app = await boot();
    app.a.set(true);
    await settle();
    app.b.set(true);
    await settle();
    press($("#b1")); // inside b, which is nested above a
    await settle();
    expect([app.a(), app.b()]).toEqual([true, true]);
    press($("#outside"));
    await settle();
    expect([app.a(), app.b()]).toEqual([true, false]);
    press($("#outside"));
    await settle();
    expect(app.a()).toBe(false);
  });

  it("nested non-modal layers stack with modal ones", async () => {
    const app = await boot();
    app.a.set(true);
    await settle();
    app.p.set(true);
    await settle();
    key($("#p1"), "Escape");
    await settle();
    expect([app.a(), app.p()]).toEqual([true, false]);
  });

  it("traps focus inside the layer and restores it on close", async () => {
    const app = await boot();
    $("#outside").focus();
    app.a.set(true);
    await settle();
    expect($("#a").contains(document.activeElement)).toBe(true);
    $("#outside").focus(); // focus-trap pulls focus back inside
    await settle();
    expect($("#a").contains(document.activeElement)).toBe(true);
    app.a.set(false);
    await settle();
    expect(document.activeElement).toBe($("#outside"));
  });

  it("locks scroll and hides the outside from assistive technology while a modal layer is open, with nesting", async () => {
    const app = await boot();
    expect(document.body.style.overflow).not.toBe("hidden");
    app.a.set(true);
    await settle();
    expect(document.body.style.overflow).toBe("hidden");
    expect($("#sibling").getAttribute("aria-hidden")).toBe("true");
    expect($("#a").getAttribute("aria-hidden")).toBeNull();
    app.b.set(true);
    await settle();
    expect($("#a").getAttribute("aria-hidden")).toBe("true"); // outside the active (topmost) layer
    expect($("#b").getAttribute("aria-hidden")).toBeNull();
    app.b.set(false);
    await settle();
    expect(document.body.style.overflow).toBe("hidden"); // a is still open
    expect($("#a").getAttribute("aria-hidden")).toBeNull();
    app.a.set(false);
    await settle();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect($("#sibling").getAttribute("aria-hidden")).toBeNull();
  });

  it("a non-modal layer neither locks scroll nor hides the outside", async () => {
    const app = await boot();
    app.p.set(true);
    await settle();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect($("#sibling").getAttribute("aria-hidden")).toBeNull();
    press($("#outside"));
    await settle();
    expect(app.p()).toBe(false);
  });

  it("removes everything when the component is destroyed while a layer is open", async () => {
    const app = await boot();
    app.a.set(true);
    await settle();
    destroy();
    destroy = () => {};
    await settle();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(document.querySelectorAll("[aria-hidden]").length).toBe(0);
  });

  it("shares the stack with Zag machines: a popover layer above a Zag dialog closes first", async () => {
    const app = await boot(MixedApp);
    app.open.set(true);
    await settle();
    app.pop.set(true);
    await settle();
    key($("#pop1"), "Escape");
    await settle();
    expect([app.open(), app.pop()]).toEqual([true, false]);
    key($("#d1"), "Escape");
    await settle();
    expect(app.open()).toBe(false);
  });
});
