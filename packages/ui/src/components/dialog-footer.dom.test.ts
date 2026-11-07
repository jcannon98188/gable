// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { html, inject, signal } from "@gable/core";
import { PRESENCE_ENV } from "@gable/ui-primitives";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiButton } from "./button.js";
import { UiDialog } from "./dialog.js";
import { ToastService, UiToaster } from "./toast.js";
import { $, $$, settle, useDomApp } from "../test-utils.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [UiDialog, UiButton, UiToaster],
    template: html`<ui-dialog [(open)]="open" heading="Discard changes" description="This cannot be undone.">
        <div slot="footer">
          <button id="cancel" uiButton variant="outline" (click)="open.set(false)">Cancel</button>
          <button id="discard" uiButton variant="destructive" (click)="open.set(false)">Discard</button>
        </div>
      </ui-dialog>
      <ui-toaster></ui-toaster>`,
  };
  open = signal(true);
  toast = inject(ToastService);
}

const boot = useDomApp();
const providers = [{ provide: PRESENCE_ENV, useValue: { exitDuration: () => 0 } }];

describe("Dialog footer", () => {
  it("is a footer region that stacks on narrow widths and aligns to the end from sm", async () => {
    await boot(App, providers);
    const footer = $("[data-slot=dialog-footer]");
    expect(footer.className).toContain("flex-col-reverse");
    expect(footer.className).toContain("sm:flex-row");
    expect(footer.className).toContain("sm:justify-end");
    expect([...footer.querySelectorAll("button")].map((b) => b.textContent!.trim())).toEqual(["Cancel", "Discard"]);
    await expectNoA11yViolations(document.body);
  });
});

describe("Toast with a description and an action", () => {
  it("renders the description and an action button that runs the callback and dismisses the toast", async () => {
    const app = await boot(App, providers);
    const undo = vi.fn();
    app.toast.show("Saved tailwind.css", { description: "src/app.css:42", duration: 0, action: { label: "Undo", onClick: undo } });
    await settle();
    const li = $("section li");
    expect(li.textContent).toContain("Saved tailwind.css");
    expect(li.textContent).toContain("src/app.css:42");
    const buttons = $$<HTMLButtonElement>("section li button");
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(["Undo", ""]);
    await expectNoA11yViolations(document.body);
    buttons[0]!.click();
    await settle();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(app.toast.toasts()).toHaveLength(0);
  });
});
