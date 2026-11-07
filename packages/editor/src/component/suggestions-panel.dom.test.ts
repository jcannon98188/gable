// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { suggestionsPlugin } from "../plugins/suggestions.js";
import { defaultPlugins, GableEditorElement } from "./editor-element.js";
import { GableSuggestions } from "./suggestions-panel.js";
import { $, $$, settle, useDomApp } from "../test-utils.js";

const rects = { getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
Object.assign(Range.prototype, rects);
Object.assign(Text.prototype, rects);

class App {
  static meta = {
    selector: "app-root",
    imports: [GableEditorElement, GableSuggestions],
    template: html`
      <gable-editor [(tiptap)]="ed" [plugins]="plugins" value="<p>hello brave world</p>"></gable-editor>
      <gable-suggestions [editor]="ed()"></gable-suggestions>
    `,
  };
  ed = signal<import("@tiptap/core").Editor | null>(null);
  plugins = [...defaultPlugins, suggestionsPlugin({ user: { name: "Ann", color: "#be123c" } })];
}

const boot = useDomApp();

describe("<gable-suggestions>", () => {
  it("toggles suggestion mode and accepts or rejects from the list", async () => {
    await boot(App);
    await settle();
    const ed = (document.querySelector(".ProseMirror") as unknown as { editor: import("@tiptap/core").Editor }).editor;
    expect($("gable-suggestions")!.textContent).toContain("No pending suggestions.");

    const mode = $("gable-suggestions input[type=checkbox]") as HTMLInputElement;
    mode.checked = true;
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    ed.commands.deleteRange({ from: 7, to: 13 });
    await settle();
    expect($$("gable-suggestions article")).toHaveLength(1);
    expect($("gable-suggestions article")!.textContent).toContain("deleted");
    expect($("gable-suggestions article")!.textContent).toContain("brave");
    await expectNoA11yViolations(document.body);

    $$("gable-suggestions article button").find((b) => b.textContent === "Accept")!.click();
    await settle();
    expect(ed.state.doc.textContent).toBe("hello world");
    expect($$("gable-suggestions article")).toHaveLength(0);
  });
});
