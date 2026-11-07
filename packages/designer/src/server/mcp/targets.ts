// How an agent names an element and reads back what an edit did. Agents work with files, lines and columns, not with the
// runtime's `TargetRef` (the whole template literal text plus an offset), so this turns a source position into a
// `TargetRef` (and back), and a before/after pair of file texts into a unified diff.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { findHtmlLiterals, parseTemplateTree } from "@gable/template-format";
import { sourceText } from "../source.js";
import { elementsOf } from "../edit/template.js";
import type { TargetRef } from "../edit/types.js";

export interface SourcePos {
  /** Project-relative path, forward slashes. */
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

/** A project file by a relative path (or a dev-server URL such as `/src/app.ts`), refusing anything outside the project. */
export function projectFile(root: string, file: string): { abs: string; rel: string } | { error: string } {
  const given = file.replaceAll("\\", "/");
  const abs = isAbsolute(given) && existsSync(given) && !given.startsWith("/src/") ? resolve(given) : resolve(join(root, given.replace(/^\//, "")));
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("node_modules")) return { error: `${file} is not a file of the project.` };
  if (!existsSync(abs)) return { error: `${file} does not exist.` };
  return { abs, rel: rel.split(sep).join("/") };
}

const lineCol = (text: string, offset: number): { line: number; column: number } => {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
};

/**
 * The innermost template element at a source position: the position may be anywhere from the element's `<` to the end
 * of its closing tag. Returns the `TargetRef` the edit service takes.
 */
export function targetAt(root: string, pos: SourcePos): { target: TargetRef; at: SourcePos } | { error: string } {
  const f = projectFile(root, pos.file);
  if ("error" in f) return f;
  const src = sourceText(readFileSync(f.abs, "utf8"));
  const lines = src.text.split("\n");
  if (pos.line < 1 || pos.line > lines.length) return { error: `${f.rel} has ${lines.length} lines; line ${pos.line} is out of range.` };
  const offset = lines.slice(0, pos.line - 1).reduce((n, l) => n + l.length + 1, 0) + Math.max(0, Math.min(pos.column - 1, lines[pos.line - 1]!.length));
  const lit = findHtmlLiterals(src.text).find((l) => offset >= l.open && offset <= l.close);
  if (!lit) return { error: `${f.rel}:${pos.line}:${pos.column} is not inside an html\`\` template.` };
  const raw = src.text.slice(lit.open, lit.close);
  const inner = offset - lit.open;
  const hits = elementsOf(parseTemplateTree(raw)).filter((e) => e.el.start <= inner && inner < e.el.end);
  const hit = hits[hits.length - 1];
  if (!hit) return { error: `${f.rel}:${pos.line}:${pos.column} is in a template but not inside an element.` };
  return { target: { raw, start: hit.el.start, tag: hit.el.name, file: f.rel }, at: { file: f.rel, ...lineCol(src.text, lit.open + hit.el.start) } };
}

/** Where an offset inside a template literal is in its file (`raw` is found by content, like the edit service does). */
export function positionOf(root: string, file: string, raw: string, offset: number): SourcePos | null {
  const f = projectFile(root, file);
  if ("error" in f) return null;
  const text = readFileSync(f.abs, "utf8").replaceAll("\r\n", "\n");
  const lits = findHtmlLiterals(text).filter((l) => text.slice(l.open, l.close) === raw);
  if (lits.length !== 1) return null;
  return { file: f.rel, ...lineCol(text, lits[0]!.open + offset) };
}

/** The file a `TargetRef` points at, project-relative, when it can be told. */
export function fileOfTarget(root: string, target: Pick<TargetRef, "file" | "modulePath">): string | null {
  const given = target.file ?? target.modulePath;
  if (!given) return null;
  const f = projectFile(root, given);
  return "error" in f ? null : f.rel;
}

// --- diffs -----------------------------------------------------------------------------------------------------------

/**
 * A unified diff of one file, `context` lines around each change. Lines are compared after the common head and tail are
 * cut off, so the cost follows the size of the change, not of the file.
 */
export function unifiedDiff(file: string, before: string, after: string, context = 2): string {
  if (before === after) return "";
  const a = before.replaceAll("\r\n", "\n").split("\n");
  const b = after.replaceAll("\r\n", "\n").split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const am = a.slice(head, a.length - tail);
  const bm = b.slice(head, b.length - tail);
  // An edit script over the middle (LCS); a huge middle is shown as one replacement rather than spending time on it.
  type Op = { k: " " | "-" | "+"; text: string };
  let ops: Op[];
  if (am.length * bm.length > 4_000_000) ops = [...am.map((text) => ({ k: "-" as const, text })), ...bm.map((text) => ({ k: "+" as const, text }))];
  else {
    const n = am.length;
    const m = bm.length;
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = am[i] === bm[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    ops = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && am[i] === bm[j]) (ops.push({ k: " ", text: am[i]! }), i++, j++);
      // Deletions before insertions, as diff tools print them.
      else if (i < n && (j === m || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) ops.push({ k: "-", text: am[i++]! });
      else ops.push({ k: "+", text: bm[j++]! });
    }
  }
  const all: Op[] = [...a.slice(0, head).map((text) => ({ k: " " as const, text })), ...ops, ...a.slice(a.length - tail).map((text) => ({ k: " " as const, text }))];
  // Group changes into hunks with `context` lines around them.
  const out = [`--- a/${file}`, `+++ b/${file}`];
  const changed = all.map((o, i) => (o.k === " " ? -1 : i)).filter((i) => i >= 0);
  let k = 0;
  while (k < changed.length) {
    const from = Math.max(0, changed[k]! - context);
    let to = Math.min(all.length - 1, changed[k]! + context);
    while (k + 1 < changed.length && changed[k + 1]! - context <= to + 1) to = Math.min(all.length - 1, changed[++k]! + context);
    k++;
    let aLine = 1;
    let bLine = 1;
    for (let i = 0; i < from; i++) {
      if (all[i]!.k !== "+") aLine++;
      if (all[i]!.k !== "-") bLine++;
    }
    const slice = all.slice(from, to + 1);
    const aCount = slice.filter((o) => o.k !== "+").length;
    const bCount = slice.filter((o) => o.k !== "-").length;
    out.push(`@@ -${aLine},${aCount} +${bLine},${bCount} @@`, ...slice.map((o) => o.k + o.text));
  }
  return out.join("\n");
}
