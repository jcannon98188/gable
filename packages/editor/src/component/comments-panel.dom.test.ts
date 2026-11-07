// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { linkPeers } from "../yjs/provider.js";
import { commentsPlugin } from "../plugins/comments.js";
import { defaultPlugins, GableEditorElement } from "./editor-element.js";
import { GableComments } from "./comments-panel.js";
import { $, $$, settle, useDomApp } from "../test-utils.js";

const rects = { getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
Object.assign(Range.prototype, rects);
Object.assign(Text.prototype, rects);

const link = linkPeers(1);
const p = link.peers[0]!;
const plugins = [...defaultPlugins.filter((x) => x.name !== "history"), commentsPlugin({ ydoc: p.ydoc, user: { name: "Ann", color: "#be123c" } })];

class App {
  static meta = {
    selector: "app-root",
    imports: [GableEditorElement, GableComments],
    template: html`
      <gable-editor [(tiptap)]="ed" [plugins]="plugins" [ydoc]="ydoc" [whenSynced]="synced" value="<p>hello brave world</p>"></gable-editor>
      <gable-comments [editor]="ed()"></gable-comments>
    `,
  };
  ed = signal<import("@tiptap/core").Editor | null>(null);
  plugins = plugins;
  ydoc = p.ydoc;
  synced = p.synced;
}

const boot = useDomApp();

describe("<gable-comments>", () => {
  it("starts, replies to, resolves and reopens a thread from the sidebar", async () => {
    await boot(App);
    await settle();
    const ed = (document.querySelector(".ProseMirror") as unknown as { editor: import("@tiptap/core").Editor }).editor;
    expect($("gable-comments")!.textContent).toContain("No comments yet.");

    ed.commands.setTextSelection({ from: 7, to: 12 });
    await settle();
    const box = $("#gable-new-comment") as HTMLTextAreaElement;
    box.value = "Is this right?";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    ($("gable-comments form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    expect($("gable-comments article")!.textContent).toContain("Is this right?");
    expect($("gable-comments article")!.textContent).toContain("brave");
    expect($("gable-comments article")!.getAttribute("aria-current")).toBe("true");

    const reply = $("gable-comments article input") as HTMLInputElement;
    reply.value = "Yes";
    reply.dispatchEvent(new Event("input", { bubbles: true }));
    ($("gable-comments article form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    expect($$("gable-comments article li")).toHaveLength(2);
    await expectNoA11yViolations(document.body);

    const toggle = () => $$("gable-comments article button").find((b) => /Resolve|Reopen/.test(b.textContent!))!;
    toggle().click();
    await settle();
    expect($("gable-comments article")).toBeNull(); // resolved threads are hidden by default
  });
});
