// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { GableEditor, collabPlugin, commentsPlugin, corePlugin, getComments, linkPeers } from "../index.js";

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
        collabPlugin({ ydoc: p.ydoc, whenSynced: p.synced, captureTimeout: 0 }),
        commentsPlugin({ ydoc: p.ydoc, user: { name, color: "#000" }, now: () => (t += 10) }),
      ],
      element: document.createElement("div"),
      content,
    });
  return { link, pa, pb, mk };
}

describe("comments plugin", () => {
  it("starts a thread on a selection, syncs it, and highlights it on both peers", async () => {
    const { link, pa, pb, mk } = setup();
    const a = mk(pa, "Ann", "<p>hello brave world</p>");
    await tick();
    const b = mk(pb, "Bob");
    await tick();

    a.editor.commands.setTextSelection({ from: 7, to: 12 });
    const id = getComments(a.editor)!.start("Is this the right word?");
    expect(id).toBeTruthy();
    await tick();

    const onB = getComments(b.editor)!.threads();
    expect(onB).toHaveLength(1);
    expect(onB[0]!.quote).toBe("brave");
    expect(onB[0]!.messages[0]).toMatchObject({ text: "Is this the right word?", author: { name: "Ann" } });
    expect(b.editor.view.dom.querySelector(".gable-comment")!.textContent).toBe("brave");

    // empty selection or empty text starts nothing
    a.editor.commands.setTextSelection(2);
    expect(getComments(a.editor)!.start("x")).toBeNull();
    a.destroy();
    b.destroy();
    link.destroy();
  });

  it("keeps the anchor on the same text through concurrent edits", async () => {
    const { link, pa, pb, mk } = setup();
    const a = mk(pa, "Ann", "<p>hello brave world</p>");
    await tick();
    const b = mk(pb, "Bob");
    await tick();
    a.editor.commands.setTextSelection({ from: 7, to: 12 });
    getComments(a.editor)!.start("check");
    await tick();

    b.editor.commands.insertContentAt(1, "Well, ");
    a.editor.commands.insertContentAt(a.editor.state.doc.content.size - 1, " again");
    await tick();
    const ids = [a, b].map((e) => {
      const t = getComments(e.editor)!.threads()[0]!;
      return e.editor.state.doc.textBetween(t.range!.from, t.range!.to);
    });
    expect(ids).toEqual(["brave", "brave"]);

    // deleting the anchored text orphans the thread but keeps its quote
    const r = getComments(b.editor)!.threads()[0]!.range!;
    b.editor.commands.deleteRange(r);
    await tick();
    const orphan = getComments(a.editor)!.threads()[0]!;
    expect(orphan.range).toBeNull();
    expect(orphan.quote).toBe("brave");
    expect(a.editor.view.dom.querySelector(".gable-comment")).toBeNull();
    a.destroy();
    b.destroy();
    link.destroy();
  });

  it("replies, resolves and reopens with author and timestamp, across peers", async () => {
    const { link, pa, pb, mk } = setup();
    const a = mk(pa, "Ann", "<p>hello brave world</p>");
    await tick();
    const b = mk(pb, "Bob");
    await tick();
    a.editor.commands.setTextSelection({ from: 1, to: 6 });
    const id = getComments(a.editor)!.start("greeting ok?")!;
    await tick();

    expect(getComments(b.editor)!.reply(id, "  Yes.  ")).toBe(true);
    expect(getComments(b.editor)!.reply(id, "   ")).toBe(false);
    expect(getComments(b.editor)!.reply("nope", "x")).toBe(false);
    await tick();
    const t = getComments(a.editor)!.threads()[0]!;
    expect(t.messages.map((m) => [m.author.name, m.text])).toEqual([["Ann", "greeting ok?"], ["Bob", "Yes."]]);
    expect(t.messages[1]!.at).toBeGreaterThan(t.messages[0]!.at);

    getComments(a.editor)!.resolve(id);
    await tick();
    const resolved = getComments(b.editor)!.threads()[0]!;
    expect(resolved.resolved).toBe(true);
    expect(resolved.resolvedBy?.name).toBe("Ann");
    expect(b.editor.view.dom.querySelector(".gable-comment")).toBeNull(); // resolved threads are not highlighted

    getComments(b.editor)!.reopen(id);
    await tick();
    expect(getComments(a.editor)!.threads()[0]!.resolved).toBe(false);
    expect(a.editor.view.dom.querySelector(".gable-comment")).not.toBeNull();

    getComments(a.editor)!.remove(id);
    await tick();
    expect(getComments(b.editor)!.threads()).toHaveLength(0);
    a.destroy();
    b.destroy();
    link.destroy();
  });

  it("tracks the active thread by click and notifies subscribers", async () => {
    const { link, pa, mk } = setup();
    const a = mk(pa, "Ann", "<p>hello brave world</p>");
    await tick();
    const api = getComments(a.editor)!;
    let calls = 0;
    const stop = api.subscribe(() => calls++);
    a.editor.commands.setTextSelection({ from: 1, to: 6 });
    const id = api.start("x")!;
    await tick();
    expect(api.activeId).toBe(id);
    expect(a.editor.view.dom.querySelector(".gable-comment-active")).not.toBeNull();
    expect(calls).toBeGreaterThan(0);

    api.setActive(null);
    expect(a.editor.view.dom.querySelector(".gable-comment-active")).toBeNull();
    stop();
    a.destroy();
    link.destroy();
  });
});
