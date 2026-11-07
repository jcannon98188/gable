// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { basicStylesPlugin, GableEditor, collabPlugin, commentsPlugin, corePlugin, getComments, getSuggestions, linkPeers, suggestionsPlugin } from "../index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));
const rects = { getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
Object.assign(Range.prototype, rects);
Object.assign(Text.prototype, rects);

function setup() {
  const link = linkPeers(2);
  const [pa, pb] = link.peers as [(typeof link.peers)[number], (typeof link.peers)[number]];
  let t = 1000;
  const mk = (p: typeof pa, name: string, content?: string) =>
    new GableEditor({
      plugins: [
        corePlugin,
        basicStylesPlugin,
        collabPlugin({ ydoc: p.ydoc, whenSynced: p.synced, captureTimeout: 0 }),
        commentsPlugin({ ydoc: p.ydoc, user: { name, color: "#000" } }),
        suggestionsPlugin({ user: { name, color: name === "Ann" ? "#be123c" : "#1d4ed8" }, now: () => (t += 10) }),
      ],
      element: document.createElement("div"),
      content,
    });
  const ann = mk(pa, "Ann", "<p>hello brave world</p>");
  return { link, pa, pb, mk, ann };
}

const text = (e: GableEditor) => e.editor.state.doc.textContent;

describe("suggestion mode", () => {
  it("records insertions, deletions and format changes with author and time", async () => {
    const { link, mk, pb, ann } = setup();
    await tick();
    const bob = mk(pb, "Bob");
    await tick();
    const api = getSuggestions(bob.editor)!;
    expect(api.mode()).toBe(false);
    api.setMode(true);

    // delete "brave " (7..13): text stays, marked as deleted
    bob.editor.commands.deleteRange({ from: 7, to: 13 });
    // insert "big " before "world"
    bob.editor.commands.insertContentAt(13, "big ");
    // bold "hello"
    bob.editor.commands.setTextSelection({ from: 1, to: 6 });
    bob.editor.commands.toggleBold();
    await tick();

    expect(text(bob)).toBe("hello brave big world");
    const list = api.list();
    expect(list.map((s) => [s.kind, s.text, s.author.name])).toEqual([
      ["format", "hello", "Bob"],
      ["delete", "brave ", "Bob"],
      ["insert", "big ", "Bob"],
    ]);
    expect(list[0]!.description).toBe("bold added");
    expect(list[1]!.at).toBeGreaterThan(1000);
    // the format change has not been applied yet
    expect(bob.editor.getHTML()).not.toContain("<strong>");

    // syncs to the other peer, which sees the same suggestions
    expect(getSuggestions(ann.editor)!.list().map((s) => s.kind)).toEqual(["format", "delete", "insert"]);
    bob.destroy();
    ann.destroy();
    link.destroy();
  });

  it("accepts and rejects individual suggestions, syncing across peers", async () => {
    const { link, mk, pb, ann } = setup();
    await tick();
    const bob = mk(pb, "Bob");
    await tick();
    getSuggestions(bob.editor)!.setMode(true);
    bob.editor.commands.deleteRange({ from: 7, to: 13 });
    bob.editor.commands.insertContentAt(13, "big ");
    bob.editor.commands.setTextSelection({ from: 1, to: 6 });
    bob.editor.commands.toggleBold();
    await tick();

    const a = getSuggestions(ann.editor)!;
    const [format, del, ins] = a.list() as [ReturnType<typeof a.list>[number], ReturnType<typeof a.list>[number], ReturnType<typeof a.list>[number]];
    expect(a.accept(del.id)).toBe(true); // Ann accepts Bob's deletion
    expect(a.reject(ins.id)).toBe(true); // and rejects his insertion
    await tick();
    expect(text(ann)).toBe("hello world");
    expect(text(bob)).toBe("hello world");

    expect(a.accept(format.id)).toBe(true);
    await tick();
    expect(ann.editor.getHTML()).toBe("<p><strong>hello</strong> world</p>");
    expect(bob.editor.getHTML()).toBe("<p><strong>hello</strong> world</p>");
    expect(a.list()).toEqual([]);
    expect(a.accept("missing")).toBe(false);
    bob.destroy();
    ann.destroy();
    link.destroy();
  });

  it("accepts all and rejects all", async () => {
    const { link, ann } = setup();
    await tick();
    const api = getSuggestions(ann.editor)!;
    api.setMode(true);
    ann.editor.commands.deleteRange({ from: 1, to: 7 }); // "hello "
    ann.editor.commands.insertContentAt(ann.editor.state.doc.content.size - 1, "!!");
    await tick();
    expect(text(ann)).toBe("hello brave world!!");
    expect(api.rejectAll()).toBe(2);
    expect(text(ann)).toBe("hello brave world");
    expect(api.list()).toEqual([]);

    ann.editor.commands.deleteRange({ from: 1, to: 7 });
    ann.editor.commands.insertContentAt(ann.editor.state.doc.content.size - 1, "!!");
    expect(api.acceptAll()).toBe(2);
    expect(text(ann)).toBe("brave world!!");
    expect(ann.editor.getHTML()).not.toContain("<ins");
    ann.destroy();
    link.destroy();
  });

  it("merges consecutive typing into one suggestion and lets you retract your own insertion for real", async () => {
    const { link, ann } = setup();
    await tick();
    const api = getSuggestions(ann.editor)!;
    api.setMode(true);
    const end = () => ann.editor.state.doc.content.size - 1;
    ann.editor.commands.insertContentAt(end(), "a");
    ann.editor.commands.insertContentAt(end(), "b");
    ann.editor.commands.insertContentAt(end(), "c");
    expect(api.list()).toHaveLength(1);
    expect(api.list()[0]!.text).toBe("abc");
    ann.editor.commands.deleteRange({ from: end() - 1, to: end() }); // delete "c", which only this author suggested
    expect(text(ann)).toBe("hello brave worldab");
    expect(api.list()[0]!.text).toBe("ab");
    expect(api.list().every((s) => s.kind === "insert")).toBe(true);
    ann.destroy();
    link.destroy();
  });

  it("does not record edits when off, and never records remote changes", async () => {
    const { link, mk, pb, ann } = setup();
    await tick();
    const bob = mk(pb, "Bob");
    await tick();
    getSuggestions(ann.editor)!.setMode(true);
    bob.editor.commands.insertContentAt(1, "plain ");
    await tick();
    expect(text(ann)).toBe("plain hello brave world");
    expect(getSuggestions(ann.editor)!.list()).toEqual([]);
    expect(getSuggestions(bob.editor)!.list()).toEqual([]);
    bob.destroy();
    ann.destroy();
    link.destroy();
  });

  it("refuses deletions that join blocks", async () => {
    const link = linkPeers(1);
    const p = link.peers[0]!;
    const ed = new GableEditor({
      plugins: [corePlugin, collabPlugin({ ydoc: p.ydoc, whenSynced: p.synced }), suggestionsPlugin({ user: { name: "Ann", color: "#000" } })],
      element: document.createElement("div"),
      content: "<p>one</p><p>two</p>",
    });
    await tick();
    getSuggestions(ed.editor)!.setMode(true);
    ed.editor.commands.deleteRange({ from: 3, to: 7 }); // across the paragraph boundary
    expect(ed.editor.getHTML()).toBe("<p>one</p><p>two</p>");
    ed.destroy();
    link.destroy();
  });

  it("works with comments and undo", async () => {
    const { link, ann } = setup();
    await tick();
    ann.editor.commands.setTextSelection({ from: 7, to: 12 });
    getComments(ann.editor)!.start("is it brave?");
    await tick();

    const api = getSuggestions(ann.editor)!;
    api.setMode(true);
    ann.editor.commands.deleteRange({ from: 7, to: 12 });
    await tick();
    // the commented text is still there, so the thread keeps its anchor while the deletion is pending
    const t = getComments(ann.editor)!.threads()[0]!;
    expect(ann.editor.state.doc.textBetween(t.range!.from, t.range!.to)).toBe("brave");
    expect(api.list()).toHaveLength(1);

    // undo reverts the suggestion
    ann.editor.commands.undo();
    await tick();
    expect(api.list()).toEqual([]);
    expect(text(ann)).toBe("hello brave world");

    // accepting a deletion removes the text and orphans the thread
    ann.editor.commands.redo();
    await tick();
    api.acceptAll();
    await tick();
    expect(text(ann)).toBe("hello  world");
    expect(getComments(ann.editor)!.threads()[0]!.range).toBeNull();
    ann.destroy();
    link.destroy();
  });
});
