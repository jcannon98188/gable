import { describe, expect, it } from "vitest";
import { html, inject, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { domEvent, provideTestDom } from "./test-dom.js";
import { DIALOG, DialogState } from "./dialog.js";

class App {
  static meta = {
    selector: "app-root",
    providers: [DialogState],
    imports: [...DIALOG],
    template: html`<button uiDialogTrigger>Open</button>
      <div uiDialogBackdrop></div>
      <div uiDialogPositioner>
        <div uiDialogContent>
          <h2 uiDialogTitle>Title</h2>
          <p uiDialogDescription>About</p>
          <button uiDialogClose>x</button>
        </div>
      </div>`,
  };
  open = signal(false);
  changes: boolean[] = [];
  dialog = inject(DialogState).bind(() => ({
    open: this.open(),
    onOpenChange: (d) => {
      this.changes.push(d.open);
      this.open.set(d.open);
    },
  }));
}

const mountDialog = () => {
  const f = mount(App, { providers: provideTestDom() });
  const click = (selector: string) => {
    const node = f.query(selector)!;
    f.dispatch(node, "click", domEvent(node, "click"));
    return f.settle();
  };
  return { f, click, content: () => f.query("[role=dialog]")!, trigger: () => f.query("[data-part=trigger]")! };
};

describe("dialog in the in-memory renderer", () => {
  it("applies the prop getters: roles, labels and a hidden closed state", async () => {
    const { f, content, trigger } = mountDialog();
    await f.settle();
    expect(content().attrs).toMatchObject({ role: "dialog", "aria-modal": "true", hidden: "", "data-state": "closed" });
    expect(content().attrs["aria-labelledby"]).toBe(f.query("[data-part=title]")!.attrs.id);
    expect(content().attrs["aria-describedby"]).toBe(f.query("[data-part=description]")!.attrs.id);
    expect(trigger().attrs).toMatchObject({ "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": content().attrs.id });
    expect(f.query("[data-part=backdrop]")!.attrs.hidden).toBe("");
  });

  it("opens from the trigger and closes from the close button, reporting each change", async () => {
    const { f, click, content, trigger } = mountDialog();
    await f.settle();
    await click("[data-part=trigger]");
    expect(f.instance.changes).toEqual([true]);
    expect(content().attrs.hidden).toBeUndefined();
    expect(content().attrs["data-state"]).toBe("open");
    expect(trigger().attrs["aria-expanded"]).toBe("true");
    await click("[data-part=close-trigger]");
    expect(f.instance.changes).toEqual([true, false]);
    expect(content().attrs.hidden).toBe("");
    expect(trigger().attrs["aria-expanded"]).toBe("false");
  });

  it("follows a controlled open signal", async () => {
    const { f, content } = mountDialog();
    await f.settle();
    f.instance.open.set(true);
    await f.settle();
    expect(content().attrs["data-state"]).toBe("open");
    f.instance.open.set(false);
    await f.settle();
    expect(content().attrs["data-state"]).toBe("closed");
  });

  it("owns its machine: destroying the component stops it and removes the listeners", async () => {
    const { f, trigger } = mountDialog();
    await f.settle();
    const node = trigger();
    const { service } = f.instance.dialog.binding;
    expect(node.listeners.click?.length).toBe(1);
    f.destroy();
    expect(node.listeners.click?.length ?? 0).toBe(0);
    expect(service.getStatus()).not.toBe("started");
  });
});
