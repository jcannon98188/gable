// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { GableEditor, basicStylesPlugin, collabPlugin, corePlugin, getSuggestions, linkPeers, suggestionsPlugin } from "../index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));
const rects = { getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
Object.assign(Range.prototype, rects);
Object.assign(Text.prototype, rects);

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe("suggestions fuzz", () => {
  for (let seed = 1; seed <= 12; seed++) {
    it(`two peers converge with mixed suggestion and plain edits (seed ${seed})`, async () => {
      const r = rng(seed);
      const link = linkPeers(2);
      const peers = link.peers;
      const mk = (i: number, content?: string) =>
        new GableEditor({
          plugins: [corePlugin, basicStylesPlugin, collabPlugin({ ydoc: peers[i]!.ydoc, whenSynced: peers[i]!.synced, captureTimeout: 0 }), suggestionsPlugin({ user: { name: `U${i}`, color: "#000" } })],
          element: document.createElement("div"),
          content,
        });
      const a = mk(0, "<p>the quick brown fox jumps over the lazy dog</p>");
      await tick();
      const b = mk(1);
      await tick();
      const eds = [a, b];
      for (const e of eds) getSuggestions(e.editor)!.setMode(r() < 0.5);
      for (let step = 0; step < 40; step++) {
        const e = eds[Math.floor(r() * 2)]!.editor;
        const size = e.state.doc.content.size - 2;
        const pos = 1 + Math.floor(r() * Math.max(1, size));
        const op = r();
        if (op < 0.4) e.commands.insertContentAt(pos, "xy");
        else if (op < 0.7) e.commands.deleteRange({ from: pos, to: Math.min(pos + 1 + Math.floor(r() * 3), size + 1) });
        else if (op < 0.85) {
          e.commands.setTextSelection({ from: pos, to: Math.min(pos + 3, size + 1) });
          e.commands.toggleBold();
        } else {
          const api = getSuggestions(e)!;
          const list = api.list();
          if (list.length) (r() < 0.5 ? api.accept : api.reject)(list[Math.floor(r() * list.length)]!.id);
        }
      }
      await tick();
      expect(a.editor.getHTML()).toBe(b.editor.getHTML());
      expect(getSuggestions(a.editor)!.list().map((s) => s.id)).toEqual(getSuggestions(b.editor)!.list().map((s) => s.id));
      a.destroy();
      b.destroy();
      link.destroy();
    });
  }
});
