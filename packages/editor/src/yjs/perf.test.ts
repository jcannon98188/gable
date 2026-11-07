import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YProseMirrorBinding } from "./binding.js";
import { yToDoc } from "./convert.js";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: { bold: {} },
});

class Peer {
  state: EditorState;
  readonly ydoc = new Y.Doc();
  readonly binding: YProseMirrorBinding;
  constructor(paragraphs?: number) {
    const self = this;
    const content = Array.from({ length: paragraphs ?? 1 }, (_, i) => ({ type: "paragraph", content: [{ type: "text", text: `Paragraph number ${i} with some words in it.` }] }));
    this.state = EditorState.create({ doc: schema.nodeFromJSON({ type: "doc", content }) });
    this.binding = new YProseMirrorBinding({
      ydoc: this.ydoc,
      host: {
        get state() {
          return self.state;
        },
        dispatch: (tr: Transaction) => {
          this.state = this.state.apply(tr);
          this.binding.pmChanged();
        },
      },
      captureTimeout: 0,
    });
    this.binding.init({ seed: paragraphs != null });
  }
  edit(fn: (tr: Transaction) => void): void {
    const tr = this.state.tr;
    fn(tr);
    this.state = this.state.apply(tr);
    this.binding.pmChanged();
  }
}

const N = 10000;

describe("large documents", () => {
  it(`stays fast per change in a ${N}-paragraph document`, () => {
    const a = new Peer(N);
    const b = new Peer();
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    expect(b.state.doc.childCount).toBe(N);

    // Typing in the middle: local -> Yjs
    const mid = Math.floor(a.state.doc.content.size / 2);
    const t0 = performance.now();
    const TYPED = 40;
    for (let i = 0; i < TYPED; i++) a.edit((tr) => tr.insertText("x", mid + i, mid + i));
    const local = (performance.now() - t0) / TYPED;

    // Relay a's updates to b: Yjs -> local
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    a.ydoc.on("update", (u: Uint8Array, origin: unknown) => origin !== "relay" && Y.applyUpdate(b.ydoc, u, "relay"));
    const t1 = performance.now();
    for (let i = 0; i < TYPED; i++) a.edit((tr) => tr.insertText("y", mid + i, mid + i));
    const both = (performance.now() - t1) / TYPED;
    const remote = both - local;

    // Selection mapping through a relative position (cursor and comment anchors)
    const t2 = performance.now();
    for (let i = 0; i < TYPED; i++) b.binding.fromRelativePosition(a.binding.toRelativePosition(mid + i));
    const pos = (performance.now() - t2) / TYPED;

    console.log(`N=${N}: local->yjs ${local.toFixed(2)}ms, local+remote-apply ${both.toFixed(2)}ms (remote part ~${remote.toFixed(2)}ms), relative positions ${pos.toFixed(2)}ms`);
    expect(b.state.doc.eq(yToDoc(b.binding.fragment, schema))).toBe(true);
    expect(b.state.doc.eq(a.state.doc)).toBe(true);
    // Reference: ~3ms local / ~8ms remote at 10k paragraphs. The old whole-document reconcile took ~40ms; the bound is loose for slow CI.
    expect(local).toBeLessThan(25);
    expect(remote).toBeLessThan(60);
  }, 120000);
});
