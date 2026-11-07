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
    heading: { group: "block", content: "inline*", attrs: { level: { default: 1 } } },
    blockquote: { group: "block", content: "block+" },
    bulletList: { group: "block", content: "listItem+" },
    listItem: { content: "paragraph block*" },
    hardBreak: { group: "inline", inline: true, selectable: false },
    text: { group: "inline" },
  },
  marks: {
    bold: {},
    link: { attrs: { href: { default: "" } } },
  },
});

class Peer {
  state: EditorState;
  readonly ydoc: Y.Doc;
  readonly binding: YProseMirrorBinding;
  constructor(name: string, initial?: string) {
    this.ydoc = new Y.Doc();
    this.ydoc.clientID = name.charCodeAt(0);
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [{ type: "paragraph", content: initial ? [{ type: "text", text: initial }] : [] }],
    });
    this.state = EditorState.create({ doc });
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
    const self = this;
    // Peers without initial content wait for a remote sync instead of seeding Yjs (avoids duplicate seeds).
    this.binding.init({ seed: !!initial });
  }
  edit(fn: (tr: Transaction) => void): void {
    const tr = this.state.tr;
    fn(tr);
    this.state = this.state.apply(tr);
    this.binding.pmChanged();
  }
  get json(): unknown {
    return this.state.doc.toJSON();
  }
}

/** Two-way sync of docs; `online` toggles delivery so tests can simulate offline edits. */
function link(a: Peer, b: Peer) {
  const forward = (from: Peer, to: Peer) =>
    from.ydoc.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin !== "remote") Y.applyUpdate(to.ydoc, u, "remote");
    });
  forward(a, b);
  forward(b, a);
}
function sync(a: Peer, b: Peer) {
  Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc), "remote");
  Y.applyUpdate(a.ydoc, Y.encodeStateAsUpdate(b.ydoc), "remote");
}

describe("local -> yjs -> remote", () => {
  it("round-trips every node, mark and attr", () => {
    const a = new Peer("a");
    const content = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "plain " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "hardBreak" },
            { type: "text", text: "link", marks: [{ type: "bold" }, { type: "link", attrs: { href: "x" } }] },
          ],
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "q" }] }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "i1" }] }] },
            { type: "listItem", content: [{ type: "paragraph" }, { type: "blockquote", content: [{ type: "paragraph" }] }] },
          ],
        },
      ],
    };
    a.edit((tr) => tr.replaceWith(0, tr.doc.content.size, schema.nodeFromJSON(content).content));
    const b = new Peer("b");
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc), "remote");
    expect(b.json).toEqual(a.json);
    expect(yToDoc(b.ydoc.getXmlFragment("content"), schema).toJSON()).toEqual(content);
  });

  it("applies fine-grained text edits and mark changes", () => {
    const a = new Peer("a", "hello world");
    const b = new Peer("b");
    link(a, b);
    sync(a, b);
    a.edit((tr) => tr.insertText("big ", 7));
    a.edit((tr) => tr.addMark(1, 6, schema.marks.bold!.create()));
    expect(b.state.doc.textContent).toBe("hello big world");
    expect(b.json).toEqual(a.json);
    a.edit((tr) => tr.removeMark(1, 6, schema.marks.bold));
    expect(b.json).toEqual(a.json);
  });

  it("keeps concurrent edits in the same paragraph", () => {
    const a = new Peer("a", "abc");
    const b = new Peer("b");
    sync(a, b);
    // offline (not linked): each types in the same paragraph
    const off = (p: Peer, fn: () => void) => fn();
    off(a, () => a.edit((tr) => tr.insertText("X", 1)));
    off(b, () => b.edit((tr) => tr.insertText("Y", 4)));
    sync(a, b);
    expect(a.json).toEqual(b.json);
    expect(a.state.doc.textContent).toBe("XabcY");
  });
});

describe("selection", () => {
  it("keeps the local cursor on its character when a remote edit lands before it", () => {
    const a = new Peer("a", "hello");
    const b = new Peer("b");
    link(a, b);
    sync(a, b);
    b.edit((tr) => tr.setSelection(TextSelection.create(tr.doc, 4)));
    a.edit((tr) => tr.insertText("123", 1));
    expect(b.state.doc.textContent).toBe("123hello");
    expect(b.state.selection.anchor).toBe(7);
  });

  it("converts positions to relative positions and back across edits", () => {
    const a = new Peer("a", "hello");
    const rel = a.binding.toRelativePosition(3);
    a.edit((tr) => tr.insertText("ZZ", 1));
    expect(a.binding.fromRelativePosition(rel)).toBe(5);
  });
});

describe("undo", () => {
  it("undoes only the local user's changes", () => {
    const a = new Peer("a", "one");
    const b = new Peer("b");
    link(a, b);
    sync(a, b);
    a.edit((tr) => tr.insertText("A", 1));
    b.edit((tr) => tr.insertText("B", b.state.doc.content.size - 1));
    expect(a.state.doc.textContent).toBe("AoneB");
    a.binding.undo();
    expect(a.state.doc.textContent).toBe("oneB");
    expect(b.state.doc.textContent).toBe("oneB");
    a.binding.redo();
    expect(a.state.doc.textContent).toBe("AoneB");
  });

  it("remote changes are not undoable", () => {
    const a = new Peer("a", "x");
    const b = new Peer("b");
    link(a, b);
    sync(a, b);
    b.edit((tr) => tr.insertText("B", 2));
    a.binding.undoManager.clear();
    expect(a.binding.canUndo()).toBe(false);
  });
});

describe("convergence (randomized)", () => {
  function rng(seed: number) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  }
  function randomEdit(p: Peer, r: () => number) {
    const doc = p.state.doc;
    const max = doc.content.size;
    const pick = r();
    p.edit((tr) => {
      const pos = Math.floor(r() * (max + 1));
      const $pos = tr.doc.resolve(pos);
      if (pick < 0.45) {
        if ($pos.parent.inlineContent) tr.insertText("abcdefgh"[Math.floor(r() * 8)]!.repeat(1 + Math.floor(r() * 3)), pos);
      } else if (pick < 0.65) {
        const to = Math.min(max, pos + 1 + Math.floor(r() * 3));
        if ($pos.parent.inlineContent && tr.doc.resolve(to).parent === $pos.parent) tr.delete(pos, to);
      } else if (pick < 0.8) {
        const to = Math.min(max, pos + 1 + Math.floor(r() * 4));
        if ($pos.parent.inlineContent && tr.doc.resolve(to).parent === $pos.parent) {
          tr.addMark(pos, to, r() < 0.5 ? schema.marks.bold!.create() : schema.marks.link!.create({ href: "h" + Math.floor(r() * 3) }));
        }
      } else if (pick < 0.88) {
        const to = Math.min(max, pos + 1 + Math.floor(r() * 4));
        if ($pos.parent.inlineContent && tr.doc.resolve(to).parent === $pos.parent) tr.removeMark(pos, to, null);
      } else if (pick < 0.95) {
        if ($pos.depth >= 1) {
          try {
            tr.split(pos);
          } catch {
            /* invalid split position */
          }
        }
      } else {
        const $p = tr.doc.resolve(pos);
        if ($p.parent.type.name === "paragraph" && $p.depth === 1) tr.setNodeMarkup($p.before(), schema.nodes.heading, { level: 1 + Math.floor(r() * 3) });
      }
    });
  }

  for (const seed of Array.from({ length: 25 }, (_, i) => i + 1)) {
    it(`three peers converge with offline phases (seed ${seed})`, () => {
      const r = rng(seed);
      const peers = [new Peer("a", "the quick brown fox"), new Peer("b"), new Peer("c")];
      sync(peers[0]!, peers[1]!);
      sync(peers[0]!, peers[2]!);
      for (let round = 0; round < 12; round++) {
        // Each round, peers edit independently (offline), then everyone exchanges state.
        for (const p of peers) for (let i = 0; i < 4; i++) randomEdit(p, r);
        for (let i = 0; i < peers.length; i++) for (let j = 0; j < peers.length; j++) if (i !== j) sync(peers[i]!, peers[j]!);
        const first = peers[0]!.json;
        for (const p of peers) {
          expect(p.json).toEqual(first);
          // Editor state must equal the Yjs document it is bound to.
          expect(yToDoc(p.ydoc.getXmlFragment("content"), schema).toJSON()).toEqual(p.json);
          p.state.doc.check();
        }
      }
    });
  }
});
