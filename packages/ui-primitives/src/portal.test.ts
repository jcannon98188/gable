import { describe, expect, it } from "vitest";
import { html, inject, signal } from "@gable/core";
import { mount, type TestNode } from "@gable/testing";
import { createTestRenderer, serialize } from "@gable/testing/renderer";
import { domEvent, provideTestDom } from "./test-dom.js";
import { DIALOG, DialogState } from "./dialog.js";
import { UiPortal } from "./portal.js";

class Counter {
  count = signal(0);
}

class App {
  static meta = {
    selector: "app-root",
    imports: [UiPortal],
    template: html`<section id="home">
      @if (show()) {
        <ui-portal><button id="inc" (click)="bump()">{{ label() }}</button></ui-portal>
      }
    </section>`,
  };
  show = signal(true);
  n = signal(0);
  label = () => `clicks: ${this.n()}`;
  bump = () => this.n.update((v) => v + 1);
}


describe("ui-portal in the in-memory renderer", () => {
  it("moves projected content to the overlay root while bindings and events keep working", async () => {
    const renderer = createTestRenderer();
    const f = mount(App, { renderer });
    await f.settle();
    const overlay = renderer.overlayRoot!() as TestNode;
    expect(f.query("#home #inc")).toBeNull();
    expect(overlay.children.length).toBe(1);
    expect(f.query("gable-overlay #inc")).not.toBeNull();
    expect(f.query("#inc")!.children[0]!.text).toBe("clicks: 0");
    f.dispatch(f.query("#inc")!, "click", {});
    await f.settle();
    expect(f.query("#inc")!.children[0]!.text).toBe("clicks: 1");
  });

  it("removes the content from the overlay root when its scope is disposed", async () => {
    const renderer = createTestRenderer();
    const f = mount(App, { renderer });
    await f.settle();
    const overlay = renderer.overlayRoot!() as TestNode;
    f.instance.show.set(false);
    await f.settle();
    expect(overlay.children).toEqual([]);
    expect(f.query("#inc")).toBeNull();
    f.instance.show.set(true);
    await f.settle();
    expect(overlay.children.length).toBe(1);
    f.destroy();
    expect(overlay.children).toEqual([]);
  });

  it("fails with an error naming a renderer that has no overlayRoot", () => {
    const base = createTestRenderer();
    const { overlayRoot: _drop, ...rest } = base as unknown as Record<string, unknown>;
    const bare = { ...rest, name: "bare" } as unknown as typeof base;
    const f = mount(App, { renderer: bare });
    const [report] = f.errors.expect("setup");
    expect(String(report!.error)).toMatch(/"bare" renderer does not provide one/);
  });

  it("keeps the declaring component's injector: a dialog built inside a portal still binds to its DialogState", async () => {
    class DialogApp {
      static meta = {
        selector: "app-root",
        providers: [DialogState],
        imports: [UiPortal, ...DIALOG],
        template: html`<div id="clip"><button uiDialogTrigger>Open</button>
          <ui-portal>
            <div uiDialogBackdrop></div>
            <div uiDialogPositioner><div uiDialogContent><h2 uiDialogTitle>T</h2><button uiDialogClose>x</button></div></div>
          </ui-portal></div>`,
      };
      open = signal(false);
      dialog = inject(DialogState).bind(() => ({ open: this.open(), onOpenChange: (d) => this.open.set(d.open) }));
    }
    const renderer = createTestRenderer();
    const f = mount(DialogApp, { renderer, providers: provideTestDom() });
    await f.settle();
    expect(f.query("#clip [role=dialog]")).toBeNull();
    const content = f.query("gable-overlay [role=dialog]")!;
    expect(content.attrs["aria-labelledby"]).toBe(f.query("[data-part=title]")!.attrs.id);
    const trigger = f.query("[data-part=trigger]")!;
    f.dispatch(trigger, "click", domEvent(trigger, "click"));
    await f.settle();
    expect(content.attrs["data-state"]).toBe("open");
    const close = f.query("[data-part=close-trigger]")!;
    f.dispatch(close, "click", domEvent(close, "click"));
    await f.settle();
    expect(content.attrs["data-state"]).toBe("closed");
    expect(serialize(f.root)).toContain("gable-overlay");
  });
});
