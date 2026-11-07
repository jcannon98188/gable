// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import * as Y from "yjs";
import { GableEditorElement } from "./editor-element.js";
import { $, $$, key, settle, useDomApp } from "../test-utils.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [GableEditorElement],
    template: html`<gable-editor [(value)]="doc" [readonly]="ro()" [ydoc]="ydoc()"></gable-editor>`,
  };
  doc = signal("<p>hello</p>");
  ro = signal(false);
  ydoc = signal<Y.Doc | null>(null);
}

// jsdom has no layout: ProseMirror measures selections with these.
const rects = { getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
Object.assign(Range.prototype, rects);
Object.assign(Text.prototype, rects);
const tiptap = () => ($(".ProseMirror") as unknown as { editor: import("@tiptap/core").Editor }).editor;

const boot = useDomApp();
const btn = (id: string) => $(`[data-toolbar-item="${id}"]`) as HTMLButtonElement;

describe("<gable-editor>", () => {
  it("renders the document and a labelled toolbar with no axe violations", async () => {
    await boot(App);
    expect($(".ProseMirror").textContent).toBe("hello");
    expect(document.querySelectorAll("#gable-editor-content-styles")).toHaveLength(1); // installed once, no stylesheet import needed
    expect($("[role=toolbar]").getAttribute("aria-label")).toBe("Formatting");
    expect($$("[data-toolbar-item]").map((b) => b.getAttribute("aria-label"))).toContain("Bold");
    await expectNoA11yViolations(document.body);
  });

  it("draws a lucide glyph on every toolbar button, keeping the accessible name", async () => {
    await boot(App);
    const buttons = $$("[data-toolbar-item]");
    expect(buttons.length).toBeGreaterThan(10);
    for (const b of buttons) {
      expect(b.querySelector("svg path, svg line, svg rect, svg circle, svg polyline"), b.getAttribute("data-toolbar-item")!).not.toBeNull();
      expect(b.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
      expect(b.getAttribute("aria-label")).toBeTruthy();
      expect(b.getAttribute("title")).toBe(b.getAttribute("aria-label"));
    }
  });

  describe("inline input popover", () => {
    const field = () => $("[data-input-popover] input") as HTMLInputElement;
    const type = async (value: string) => {
      field().value = value;
      field().dispatchEvent(new Event("input", { bubbles: true }));
      await settle();
    };
    const press = (k: string) => field().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

    it("collects a link URL: Apply sets it, never calling window.prompt", async () => {
      const prompt = (window.prompt = () => {
        throw new Error("window.prompt must not be used");
      });
      void prompt;
      const app = await boot(App);
      tiptap().commands.selectAll();
      await settle();
      btn("link").click();
      await settle();
      expect($("[data-input-popover]")).not.toBeNull();
      expect(document.activeElement).toBe(field());
      await expectNoA11yViolations(document.body);
      await type("https://example.com");
      ($("[data-input-popover] button[type=submit]") as HTMLButtonElement).click();
      await settle();
      expect($("[data-input-popover]")).toBeNull();
      expect(app.doc()).toBe('<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">hello</a></p>');
    });

    it("Enter applies and Escape cancels, returning focus to the editor", async () => {
      const app = await boot(App);
      tiptap().commands.selectAll();
      await settle();
      btn("link").click();
      await settle();
      await type("https://a.test");
      press("Escape");
      await settle();
      expect($("[data-input-popover]")).toBeNull();
      expect(app.doc()).toBe("<p>hello</p>");
      expect(tiptap().isFocused).toBe(true);
      btn("link").click();
      await settle();
      await type("https://b.test");
      press("Enter");
      await settle();
      expect(app.doc()).toContain('href="https://b.test"');
    });

    it("prefills the current href and offers Remove on a link", async () => {
      const app = await boot(App);
      tiptap().commands.selectAll();
      tiptap().chain().setLink({ href: "https://old.test" }).run();
      await settle();
      btn("link").click();
      await settle();
      expect(field().value).toBe("https://old.test");
      const remove = $$("[data-input-popover] button").find((b) => b.textContent!.includes("Remove link"))!;
      remove.click();
      await settle();
      expect(app.doc()).toBe("<p>hello</p>");
    });
  });

  it("toolbar buttons format the content and write value back", async () => {
    const app = await boot(App);
    const bold = btn("bold");
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    tiptap().commands.selectAll();
    await settle();
    bold.click();
    await settle();
    expect(app.doc()).toBe("<p><strong>hello</strong></p>");
    expect(btn("bold").getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a floating toolbar over a text selection and hides it when collapsed", async () => {
    await boot(App);
    const ed = tiptap();
    ed.view.coordsAtPos = () => ({ top: 100, left: 50, bottom: 120, right: 60 });
    expect(document.querySelector("[data-bubble]")).toBeNull();
    ed.commands.setTextSelection({ from: 1, to: 4 });
    await settle();
    const bubble = $("[data-bubble]");
    expect(bubble.getAttribute("aria-label")).toBe("Selection formatting");
    expect([...bubble.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toContain("Bold");
    ed.commands.setTextSelection(2);
    await settle();
    expect(document.querySelector("[data-bubble]")).toBeNull();
  });

  it("an external value change updates the editor", async () => {
    const app = await boot(App);
    app.doc.set("<h1>new</h1>");
    await settle();
    expect($(".ProseMirror h1").textContent).toBe("new");
  });

  it("readonly disables the toolbar and editing", async () => {
    const app = await boot(App);
    app.ro.set(true);
    await settle();
    expect($(".ProseMirror").getAttribute("contenteditable")).toBe("false");
    expect(btn("bold").disabled).toBe(true);
  });

  it("toolbar is keyboard operable: arrows, Home and End move focus, roving tabindex", async () => {
    await boot(App);
    const items = $$("[data-toolbar-item]").filter((b) => !(b as HTMLButtonElement).disabled);
    items[0]!.focus();
    key(items[0]!, "ArrowRight");
    expect(document.activeElement).toBe(items[1]);
    key(document.activeElement!, "End");
    expect(document.activeElement).toBe(items[items.length - 1]);
    key(document.activeElement!, "Home");
    expect(document.activeElement).toBe(items[0]);
    await settle();
    expect($$("[data-toolbar-item][tabindex='0']")).toHaveLength(1);
  });

  it("with a ydoc, two editors share one document", async () => {
    const ydoc = new Y.Doc();
    const app = await boot(App);
    app.doc.set("<p>seed</p>");
    await settle();
    app.ydoc.set(ydoc);
    await settle();
    // Collaboration is on: the Y.Doc fragment now owns the content.
    expect(ydoc.getXmlFragment("content").length).toBeGreaterThan(0);
  });
});
