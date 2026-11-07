// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { linkPeers } from "../yjs/provider.js";
import { GableEditorElement } from "./editor-element.js";
import { $$, settle, useDomApp } from "../test-utils.js";

const rects = { getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
Object.assign(Range.prototype, rects);
Object.assign(Text.prototype, rects);

const link = linkPeers(2);
const [pa, pb] = link.peers as [(typeof link.peers)[number], (typeof link.peers)[number]];

class App {
  static meta = {
    selector: "app-root",
    imports: [GableEditorElement],
    template: html`
      <gable-editor id="ann" [ydoc]="a.ydoc" [awareness]="a.awareness" [whenSynced]="a.synced" [user]="annUser" value="<p>shared text</p>"></gable-editor>
      <gable-editor id="bob" [ydoc]="b.ydoc" [awareness]="b.awareness" [whenSynced]="b.synced" [user]="bobUser"></gable-editor>
    `,
  };
  a = pa;
  b = pb;
  annUser = { name: "Ann", color: "#be123c" };
  bobUser = { name: "Bob", color: "#1d4ed8" };
}

const boot = useDomApp();
const tiptap = (host: string) => (document.querySelector(`#${host} .ProseMirror`) as unknown as { editor: import("@tiptap/core").Editor }).editor;

describe("<gable-editor> collaboration", () => {
  it("two components share a document, show presence and each other's cursors", async () => {
    await boot(App);
    await settle();
    expect(tiptap("bob").getHTML()).toBe("<p>shared text</p>");

    // Presence: each toolbar lists both people, with the local one first
    const names = (host: string) => $$(`#${host} gable-presence li[title]`).map((li) => li.getAttribute("title"));
    expect(names("ann")).toEqual(["Ann (you)", "Bob"]);
    expect(names("bob")).toEqual(["Bob (you)", "Ann"]);

    tiptap("ann").commands.setTextSelection({ from: 1, to: 7 });
    await settle();
    const caret = document.querySelector("#bob .gable-remote-caret")!;
    expect(caret.getAttribute("data-user")).toBe("Ann");
    expect(document.querySelector("#bob .gable-remote-selection")!.textContent).toBe("shared");

    tiptap("bob").commands.insertContentAt(tiptap("bob").state.doc.content.size - 1, "!");
    await settle();
    expect(tiptap("ann").getHTML()).toBe("<p>shared text!</p>");
    await expectNoA11yViolations(document.body);
  });
});
