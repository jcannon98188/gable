// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { GableEditor, adaptProvider, awarenessPlugin, collabPlugin, corePlugin, linkPeers, readPresence, watchPresence } from "../index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));
const rects = { getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
Object.assign(Range.prototype, rects);
Object.assign(Text.prototype, rects);

function client(p: ReturnType<typeof linkPeers>["peers"][number], name: string, color: string, content?: string) {
  return new GableEditor({
    plugins: [
      corePlugin,
      collabPlugin({ ydoc: p.ydoc, whenSynced: p.synced, captureTimeout: 0 }),
      awarenessPlugin({ awareness: p.awareness, user: { name, color } }),
    ],
    element: document.createElement("div"),
    content,
  });
}

describe("presence and remote cursors", () => {
  it("shows the other user's caret and selection, and keeps them on the same text under edits", async () => {
    const link = linkPeers(2);
    const [pa, pb] = link.peers as [(typeof link.peers)[number], (typeof link.peers)[number]];
    const a = client(pa, "Ann", "#e11d48", "<p>hello world</p>");
    await tick();
    const b = client(pb, "Bob", "#2563eb");
    await tick();
    expect(b.editor.getHTML()).toBe("<p>hello world</p>");

    a.editor.commands.setTextSelection({ from: 1, to: 6 });
    await tick();
    const dom = b.editor.view.dom;
    expect(dom.querySelector(".gable-remote-caret")!.getAttribute("data-user")).toBe("Ann");
    expect(dom.querySelector(".gable-remote-caret-label")!.textContent).toBe("Ann");
    expect(dom.querySelector(".gable-remote-selection")!.textContent).toBe("hello");
    // a never draws its own caret
    expect(a.editor.view.dom.querySelector(".gable-remote-caret[data-user=Ann]")).toBeNull();

    // Bob types before Ann's selection: the selection still covers "hello"
    b.editor.commands.setTextSelection(1);
    b.editor.commands.insertContent("XX");
    await tick();
    expect(dom.querySelector(".gable-remote-selection")!.textContent).toBe("hello");

    // collapsing removes the selection tint but keeps the caret
    a.editor.commands.setTextSelection(4);
    await tick();
    expect(dom.querySelector(".gable-remote-selection")).toBeNull();
    expect(dom.querySelectorAll(".gable-remote-caret")).toHaveLength(1);

    // leaving clears the remote caret
    a.destroy();
    pa.awareness.destroy();
    await tick();
    expect(dom.querySelector(".gable-remote-caret")).toBeNull();
    b.destroy();
    link.destroy();
  });

  it("lists present users, local first, and updates on join and leave", () => {
    const link = linkPeers(2);
    const [pa, pb] = link.peers as [(typeof link.peers)[number], (typeof link.peers)[number]];
    pa.awareness.setLocalStateField("user", { name: "Ann", color: "red" });
    pb.awareness.setLocalStateField("user", { name: "Bob", color: "blue" });
    const seen: string[][] = [];
    const stop = watchPresence(pa.awareness, (u) => seen.push(u.map((x) => `${x.name}${x.isLocal ? "*" : ""}`)));
    expect(readPresence(pa.awareness).map((u) => u.name)).toEqual(["Ann", "Bob"]);
    expect(seen[0]).toEqual(["Ann*", "Bob"]);
    pb.awareness.setLocalState(null);
    expect(seen.at(-1)).toEqual(["Ann*"]);
    stop();
    link.destroy();
  });
});

describe("providers", () => {
  it("waits for the first sync before seeding so peers do not duplicate the document", async () => {
    const link = linkPeers(2);
    const [pa, pb] = link.peers as [(typeof link.peers)[number], (typeof link.peers)[number]];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const mk = (p: typeof pa, content: string) =>
      new GableEditor({
        plugins: [corePlugin, collabPlugin({ ydoc: p.ydoc, whenSynced: gate, captureTimeout: 0 })],
        element: document.createElement("div"),
        content,
      });
    const a = mk(pa, "<p>same</p>");
    const b = mk(pb, "<p>same</p>");
    await tick();
    expect(pa.ydoc.getXmlFragment("content").length).toBe(0); // nothing pushed before sync
    release();
    await tick();
    // The first to initialise seeds; the second adopts it instead of adding its own copy.
    expect(a.editor.getHTML()).toBe("<p>same</p>");
    expect(b.editor.getHTML()).toBe("<p>same</p>");
    a.destroy();
    b.destroy();
    link.destroy();
  });

  it("adapts a y-websocket-shaped provider and resolves `synced` on its sync event", async () => {
    const ydoc = new Y.Doc();
    const handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
    const fake = {
      doc: ydoc,
      awareness: new Awareness(ydoc),
      synced: false,
      on: (e: string, cb: (...a: unknown[]) => void) => (handlers[e] ??= []).push(cb),
    };
    const p = adaptProvider(fake);
    let resolved = false;
    void p.synced.then(() => (resolved = true));
    await tick();
    expect(resolved).toBe(false);
    handlers.sync!.forEach((h) => h(false)); // connecting, not synced yet
    await tick();
    expect(resolved).toBe(false);
    handlers.sync!.forEach((h) => h(true));
    await tick();
    expect(resolved).toBe(true);
    expect(p.ydoc).toBe(ydoc);
    expect(() => adaptProvider({ awareness: fake.awareness, on() {} })).toThrow(/Y.Doc/);
  });

  it("linked peers exchange offline edits on reconnect", async () => {
    const link = linkPeers(2);
    const [pa, pb] = link.peers as [(typeof link.peers)[number], (typeof link.peers)[number]];
    pa.ydoc.getText("t").insert(0, "a");
    expect(pb.ydoc.getText("t").toString()).toBe("a");
    link.disconnect();
    pa.ydoc.getText("t").insert(1, "1");
    pb.ydoc.getText("t").insert(0, "2");
    expect(pa.ydoc.getText("t").toString()).toBe("a1");
    link.reconnect();
    expect(pa.ydoc.getText("t").toString()).toBe(pb.ydoc.getText("t").toString());
    link.destroy();
  });
});
