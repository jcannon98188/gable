import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { update } from "@gable/core/hmr";
import { acceptLine } from "@gable/vite";

describe("a module that failed to re-evaluate", () => {
  it("rolls the whole Vite batch back and reports it as an hmr error", async () => {
    const f = mount(
      class Box {
        static meta = { selector: "app-box", template: html`{{ n() }}` };
        n = signal(1);
      },
    );
    class Box {
      static meta = { selector: "app-box", template: html`edited {{ n() }}` };
      n = signal(1);
    }
    // Vite hands the accept callback `undefined` when re-importing the module failed.
    update("file:///hmr-review-a.ts", undefined);
    update("file:///hmr-review-b.ts", { Box });
    await Promise.resolve();
    await Promise.resolve();
    expect(f.text()).toBe("1");
    const reports = f.claimErrors();
    expect(reports.map((r) => r.context.source)).toContain("hmr");
  });

  it("the Vite accept line forwards an undefined module instead of dropping it", () => {
    expect(acceptLine("a.ts")).not.toMatch(/if \(m\)/);
  });
});

describe("host metadata edits", () => {
  it("take effect after a hot update", async () => {
    const v = (role: string) =>
      class Note {
        static meta = { selector: "app-note", host: { role }, template: html`x` };
      };
    const f = mount(v("note"));
    expect(f.html()).toContain('role="note"');
    f.hotReplace(v("alert"));
    await f.flush();
    expect(f.html()).toContain('role="alert"');
    expect(f.html()).not.toContain('role="note"');
  });
});
