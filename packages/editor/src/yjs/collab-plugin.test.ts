// @vitest-environment jsdom
import { Mark } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { GableEditor, corePlugin, definePlugin } from "../index.js";
import { collabPlugin } from "./collab-plugin.js";

const bold = definePlugin({
  name: "bold",
  requires: ["core"],
  extensions: [Mark.create({ name: "bold", parseHTML: () => [{ tag: "strong" }], renderHTML: () => ["strong", 0] })],
});

const tick = () => new Promise((r) => setTimeout(r, 0));

function make(ydoc: Y.Doc, content?: string) {
  return new GableEditor({
    plugins: [corePlugin, bold, collabPlugin({ ydoc, captureTimeout: 0 })],
    element: document.createElement("div"),
    content,
  });
}

describe("collabPlugin", () => {
  it("syncs two real TipTap editors through Y.Doc updates and undoes per user", async () => {
    const d1 = new Y.Doc();
    const d2 = new Y.Doc();
    d1.on("update", (u: Uint8Array, o: unknown) => o !== "r" && Y.applyUpdate(d2, u, "r"));
    d2.on("update", (u: Uint8Array, o: unknown) => o !== "r" && Y.applyUpdate(d1, u, "r"));
    const a = make(d1, "<p>hello</p>");
    await tick();
    const b = make(d2);
    await tick();
    expect(b.editor.getHTML()).toBe("<p>hello</p>");

    a.editor.commands.setTextSelection({ from: 1, to: 6 });
    a.editor.commands.toggleMark("bold");
    expect(b.editor.getHTML()).toBe("<p><strong>hello</strong></p>");

    b.editor.commands.insertContentAt(b.editor.state.doc.content.size - 1, "!");
    expect(a.editor.getHTML()).toBe("<p><strong>hello!</strong></p>");

    // a undoes its own bold. "!" was typed inside a's bold span and relied on its format markers, so it unbolds too (same as y-prosemirror)
    expect(a.editor.commands.undo()).toBe(true);
    expect(a.editor.getHTML()).toBe("<p>hello!</p>");
    expect(b.editor.getHTML()).toBe("<p>hello!</p>");
    a.destroy();
    b.destroy();
  });
});
