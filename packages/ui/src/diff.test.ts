import { describe, expect, it } from "vitest";
import { diffLines, parseDiff, serializeDiff, splitRows, type DiffLine } from "./lib/diff.js";

const PATCH = [
  "diff --git a/a.ts b/a.ts",
  "index 111..222 100644",
  "--- a/a.ts",
  "+++ b/a.ts",
  "@@ -1,4 +1,4 @@",
  " one",
  "-two",
  "+TWO",
  " three",
  " four",
  "\\ No newline at end of file",
  "@@ -10 +10,2 @@",
  "-ten",
  "+ten",
  "+eleven",
  "",
].join("\n");

const newSide = (lines: DiffLine[]) => lines.filter((l) => l.kind === "context" || l.kind === "add").map((l) => l.content);
const oldSide = (lines: DiffLine[]) => lines.filter((l) => l.kind === "context" || l.kind === "del").map((l) => l.content);

describe("parseDiff", () => {
  it("classifies lines and numbers them from the hunk headers", () => {
    const lines = parseDiff(PATCH);
    expect(lines.map((l) => l.kind)).toEqual(["file", "file", "file", "file", "hunk", "context", "del", "add", "context", "context", "note", "hunk", "del", "add", "add"]);
    expect(lines[5]).toMatchObject({ oldNo: 1, newNo: 1, content: "one" });
    expect(lines[6]).toMatchObject({ oldNo: 2, newNo: null, content: "two" });
    expect(lines[7]).toMatchObject({ oldNo: null, newNo: 2, content: "TWO" });
    expect(lines[12]).toMatchObject({ oldNo: 10 });
    expect(lines[14]).toMatchObject({ newNo: 11 });
  });
  it("round-trips the text, CRLF included", () => {
    expect(serializeDiff(parseDiff(PATCH)) + "\n").toBe(PATCH);
    const crlf = PATCH.replace(/\n/g, "\r\n");
    expect(serializeDiff(parseDiff(crlf)).length).toBe(crlf.length - 1);
    expect(parseDiff(crlf).map((l) => l.kind)).toEqual(parseDiff(PATCH).map((l) => l.kind));
  });
  it("is total on malformed, binary, rename and headerless input", () => {
    const inputs = ["", "\n", "@@", "@@ -x +y @@\n+a", "-a\n+b\n c", "Binary files a/x and b/x differ", "rename from a\nrename to b\nsimilarity index 90%", "@@ -1,99 +1,99 @@\n a", "@@ -0,0 +1 @@\n+a\n\\ No newline at end of file", "random\ntext", "\ud800\r\r\n"];
    for (const t of inputs) {
      const out = serializeDiff(parseDiff(t));
      expect(t === out || t === out + "\n").toBe(true);
    }
    expect(parseDiff("Binary files a/x and b/x differ")[0]!.kind).toBe("file");
    expect(parseDiff("-a\n+b")).toMatchObject([{ kind: "del", oldNo: null }, { kind: "add" }]);
  });
});

describe("diffLines", () => {
  it("is empty for equal texts", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([]);
    expect(diffLines("", "")).toEqual([]);
  });
  it("finds the minimal edit and numbers both sides", () => {
    const lines = diffLines("a\nb\nc\n", "a\nB\nc\nd\n", { context: -1 });
    expect(lines.map((l) => l.text)).toEqual([" a", "-b", "+B", " c", "+d"]);
    expect(lines[1]).toMatchObject({ oldNo: 2, newNo: null });
    expect(lines[2]).toMatchObject({ oldNo: null, newNo: 2 });
    expect(lines[4]).toMatchObject({ newNo: 4 });
  });
  it("collapses unchanged stretches into hunks with context", () => {
    const old = Array.from({ length: 30 }, (_, i) => `l${i + 1}`);
    const next = old.slice();
    next[2] = "X";
    next[25] = "Y";
    const lines = diffLines(old.join("\n"), next.join("\n"), { context: 2 });
    expect(lines.filter((l) => l.kind === "hunk").map((l) => l.text)).toEqual(["@@ -1,5 +1,5 @@", "@@ -24,5 +24,5 @@"]);
    expect(lines.filter((l) => l.kind === "context")).toHaveLength(8);
  });
  it("handles pure insertions and deletions", () => {
    expect(diffLines("", "a\nb").map((l) => l.text)).toEqual(["@@ -0,0 +1,2 @@", "+a", "+b"]);
    expect(diffLines("a\nb", "").map((l) => l.text)).toEqual(["@@ -1,2 +0,0 @@", "-a", "-b"]);
  });
  it("reproduces both sides from the script (property test)", () => {
    let seed = 7;
    const rnd = (n: number) => Math.floor(((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * n);
    for (let t = 0; t < 300; t++) {
      const a = Array.from({ length: rnd(25) }, () => String(rnd(5)));
      const b = Array.from({ length: rnd(25) }, () => String(rnd(5)));
      if (a.join("\n") === b.join("\n")) continue;
      const lines = diffLines(a.join("\n"), b.join("\n"), { context: -1 });
      expect(newSide(lines)).toEqual(b);
      expect(oldSide(lines)).toEqual(a);
    }
  });
  it("is minimal on a known case, falls back past maxEdits, and stays fast on big input", () => {
    const edits = diffLines("a\nb\nc\nd\ne", "a\nc\nd\nx\ne", { context: -1 }).filter((l) => l.kind === "add" || l.kind === "del");
    expect(edits).toHaveLength(2);
    const fallback = diffLines("a\nb\nc\nd", "w\nx\ny\nz", { context: -1, maxEdits: 2 });
    expect(newSide(fallback)).toEqual(["w", "x", "y", "z"]);
    expect(oldSide(fallback)).toEqual(["a", "b", "c", "d"]);
    const big = Array.from({ length: 20000 }, (_, i) => `line ${i}`);
    const other = big.map((l, i) => (i % 2 ? `${l}!` : l));
    const t = performance.now();
    const lines = diffLines(big.join("\n"), other.join("\n"), { context: 1 });
    expect(lines.length).toBeGreaterThan(0);
    expect(performance.now() - t).toBeLessThan(3000);
  });
});

describe("splitRows", () => {
  it("pairs deletions with the additions after them", () => {
    const rows = splitRows(diffLines("a\nb\nc\nd", "a\nB\nC\nD\nE\nd", { context: -1 }));
    expect(rows.map((r) => [r.left?.content ?? null, r.right?.content ?? null])).toEqual([["a", "a"], ["b", "B"], ["c", "C"], [null, "D"], [null, "E"], ["d", "d"]]);
    expect(splitRows(parseDiff(PATCH))[0]!.full?.kind).toBe("file");
  });
});
