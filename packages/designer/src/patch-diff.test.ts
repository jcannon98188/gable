import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTemplateTree } from "@gable/template-format";
import { describe, expect, it } from "vitest";
import { unifiedDiff } from "./server/edit/diff.js";
import { EditService } from "./server/edit/service.js";
import { elementsOf } from "./server/edit/template.js";
import type { EditResult } from "./server/edit/types.js";

/** Applies a unified diff's hunks to `text` (lines), checking every context and removed line: the diff must describe the change exactly. */
function patch(text: string, diff: ReturnType<typeof unifiedDiff>): string {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const trailing = lines[lines.length - 1] === "" ? (lines.pop(), true) : false;
  let shift = 0;
  for (const h of diff.hunks) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/.exec(h.header)!;
    const oldCount = m[2] === undefined ? 1 : Number(m[2]);
    const start = (oldCount === 0 ? Number(m[1]) : Number(m[1]) - 1) + shift;
    const old = h.lines.filter((l) => l.kind !== "+").map((l) => l.text);
    expect(lines.slice(start, start + old.length)).toEqual(old);
    const next = h.lines.filter((l) => l.kind !== "-").map((l) => l.text);
    lines.splice(start, old.length, ...next);
    shift += next.length - old.length;
  }
  return lines.join("\n") + (trailing ? "\n" : "");
}

describe("unifiedDiff", () => {
  it("prints a git-style diff with three lines of context", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h"].join("\n") + "\n";
    const after = ["a", "b", "c", "d", "E", "f", "g", "h"].join("\n") + "\n";
    const d = unifiedDiff("src/x.ts", before, after);
    expect(d.text).toBe(["--- a/src/x.ts", "+++ b/src/x.ts", "@@ -2,7 +2,7 @@", " b", " c", " d", "-e", "+E", " f", " g", " h", ""].join("\n"));
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.hunks[0]!.lines.find((l) => l.kind === "+")).toMatchObject({ text: "E", new: 5 });
    expect(d.hunks[0]!.lines.find((l) => l.kind === "-")).toMatchObject({ text: "e", old: 5 });
  });

  it("splits far-apart changes into hunks and merges near ones", () => {
    const base = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
    const far = [...base];
    far[1] = "changed 2";
    far[30] = "changed 31";
    expect(unifiedDiff("f", base.join("\n"), far.join("\n")).hunks).toHaveLength(2);
    const near = [...base];
    near[10] = "x";
    near[16] = "y"; // 5 unchanged lines between: within 2 x context, one hunk
    expect(unifiedDiff("f", base.join("\n"), near.join("\n")).hunks).toHaveLength(1);
  });

  it("describes insertions and deletions with zero-length ranges", () => {
    expect(unifiedDiff("f", "a\nb\n", "a\nx\nb\n").hunks[0]!.header).toBe("@@ -1,2 +1,3 @@");
    expect(unifiedDiff("f", "", "a\n").hunks[0]!.header).toBe("@@ -0,0 +1 @@");
    expect(unifiedDiff("f", "a\n", "").hunks[0]!.header).toBe("@@ -1 +0,0 @@");
  });

  it("reports nothing for equal lines, ignoring CRLF", () => {
    const d = unifiedDiff("f", "a\r\nb\r\n", "a\nb\n");
    expect(d.hunks).toEqual([]);
    expect(d.text).toBe("");
  });

  it("is exact on random edits (applying it gives the new text)", () => {
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (let round = 0; round < 200; round++) {
      const a = Array.from({ length: rand(30) }, () => `l${rand(6)}`);
      const b = [...a];
      for (let k = rand(6); k > 0; k--) {
        const at = rand(b.length + 1);
        const what = rand(3);
        if (what === 0) b.splice(at, 0, `n${rand(6)}`);
        else if (what === 1) b.splice(at, 1);
        else b[at] = `c${rand(6)}`;
      }
      const before = a.join("\n") + "\n";
      const after = b.filter((x) => x !== undefined).join("\n") + "\n";
      const d = unifiedDiff("f", before, after);
      expect(patch(before, d)).toBe(after);
    }
  });
});

const SOURCE = `import { html } from "@gable/core";

export class Counter {
  static meta = {
    selector: "app-counter",
    template: html\`
      <div class="box">
        <button>Add</button>
      </div>
    \`,
  };
}
`;

function project(eol = "\n") {
  const root = mkdtempSync(join(tmpdir(), "gable-diff-"));
  mkdirSync(join(root, "src"));
  const file = join(root, "src", "counter.ts");
  writeFileSync(file, SOURCE.replaceAll("\n", eol));
  const svc = new EditService(root);
  const target = (tag: string) => {
    const raw = /html`([\s\S]*?)`/.exec(readFileSync(file, "utf8").replaceAll("\r\n", "\n"))![1]!;
    const el = elementsOf(parseTemplateTree(raw)).find((e) => e.el.name === tag)!;
    return { raw, start: el.el.start, tag, file: "src/counter.ts" };
  };
  return { file, svc, target, text: () => readFileSync(file, "utf8") };
}

const ok = (r: EditResult) => {
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
  return r;
};

describe("history.last: the diff of the patch Undo would take back", () => {
  it("is the diff of the write, and follows undo and redo", () => {
    const p = project();
    expect(p.svc.history().last).toBeNull();
    const before = p.text();
    ok(p.svc.apply({ op: "setText", target: p.target("button"), run: 0, text: "Plus one" }));
    const first = p.svc.history().last!;
    expect(first).toMatchObject({ label: expect.any(String), file: "src/counter.ts", stale: false });
    expect(first.diff.text).toContain("-        <button>Add</button>\n+        <button>Plus one</button>\n");
    expect(patch(before, first.diff)).toBe(p.text());

    const middle = p.text();
    ok(p.svc.apply({ op: "setAttr", target: p.target("div"), name: "class", value: "card" }));
    const second = p.svc.history().last!;
    expect(second.id).not.toBe(first.id);
    expect(second.diff.text).toContain('-      <div class="box">\n+      <div class="card">\n');
    expect(patch(middle, second.diff)).toBe(p.text());

    ok(p.svc.undo()); // the top is the first edit again, with its own diff
    expect(p.svc.history().last).toMatchObject({ id: first.id, diff: first.diff });
    ok(p.svc.redo()); // redo writes the change again: same lines changed
    expect(p.svc.history().last!.id).toBe(second.id);
    expect(p.svc.history().last!.diff.text).toBe(second.diff.text);
    ok(p.svc.undo());
    ok(p.svc.undo());
    expect(p.svc.history().last).toBeNull();
  });

  it("is computed on LF lines for a CRLF file", () => {
    const p = project("\r\n");
    ok(p.svc.apply({ op: "setText", target: p.target("button"), run: 0, text: "Go" }));
    const d = p.svc.history().last!.diff;
    expect(d.text).not.toContain("\r");
    expect(d.removed).toBe(1);
    expect(d.added).toBe(1);
  });

  it("marks the last patch stale when the file changes outside the Designer", () => {
    const p = project();
    ok(p.svc.apply({ op: "setText", target: p.target("button"), run: 0, text: "Go" }));
    writeFileSync(p.file, "// x\n" + p.text());
    p.svc.noteFileChanged(p.file);
    expect(p.svc.history().last!.stale).toBe(true);
  });
});
