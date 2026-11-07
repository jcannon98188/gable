// The file side of node-to-source mapping and of diagnostics-to-canvas mapping. The runtime reports a template node as
// "this literal text, this range inside it" (it cannot know file offsets: Vite serves transpiled code); this module finds
// the literal in the file by content (templates have no ${} holes, so the literal body is exactly the runtime's
// `strings.raw[0]`) and converts between ranges in the literal and positions in the file.
import { readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { findHtmlLiterals } from "@gable/template-format";

/** A file read once, with its `\r\n` folded to `\n` (JavaScript does the same inside template literals) and the offset maps between the two. */
export interface SourceText {
  original: string;
  /** LF-only text; every offset the runtime reports is in this space. */
  text: string;
  toOriginal(lf: number): number;
  toLf(original: number): number;
}

export function sourceText(original: string): SourceText {
  const text = original.replaceAll("\r\n", "\n");
  if (text.length === original.length) return { original, text, toOriginal: (n) => n, toLf: (n) => n };
  const back: number[] = [];
  for (let i = 0, extra = 0; i <= text.length; i++) {
    back[i] = i + extra;
    if (original[i + extra] === "\r" && original[i + extra + 1] === "\n") extra++;
  }
  // original offset -> LF offset: the number of CRs before it is what to subtract
  const toLf = (n: number) => {
    let lo = 0;
    let hi = back.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (back[mid]! <= n) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return { original, text, toOriginal: (n) => back[n] ?? original.length, toLf };
}

export interface Position {
  line: number;
  col: number;
  /** Offset in the file as stored (CRLF counted). */
  offset: number;
}

export interface SourceRange {
  file: string;
  from: Position;
  to: Position;
  /** The opening tag, and the element's whole text, as written. */
  openingTag: string;
  text: string;
  /** More than one literal in the file has this exact text: the first was taken. */
  ambiguous: boolean;
}

export interface NodeReport {
  /** Absolute file path, or a path relative to the project root (as the dev server serves it). */
  file?: string;
  modulePath?: string;
  raw: string;
  start: number;
  openEnd: number;
  end: number;
}

const position = (src: SourceText, lf: number): Position => {
  const before = src.text.slice(0, lf);
  return { line: before.split("\n").length, col: lf - (before.lastIndexOf("\n") + 1) + 1, offset: src.toOriginal(lf) };
};

export function resolveNode(root: string, report: NodeReport): SourceRange | { error: string; file?: string } {
  const file = report.file ?? (report.modulePath ? join(root, report.modulePath) : undefined);
  if (!file) return { error: "No source file is known for this component." };
  const abs = isAbsolute(file) ? file : join(root, file);
  const src = sourceText(readFileSync(abs, "utf8"));
  const matches = findHtmlLiterals(src.text).filter((l) => src.text.slice(l.open, l.close) === report.raw);
  if (matches.length === 0) return { error: "The template literal is not in the file any more (edited since it loaded, or it contains escapes).", file: abs };
  const lit = matches[0]!;
  const a = lit.open + report.start;
  const c = lit.open + report.end;
  return {
    file: abs,
    from: position(src, a),
    to: position(src, c),
    openingTag: src.text.slice(a, lit.open + report.openEnd),
    text: src.text.slice(a, c),
    ambiguous: matches.length > 1,
  };
}

/** The template literal containing a file offset, as the runtime would see it: its text and the offset inside it. */
export function literalAt(src: SourceText, originalOffset: number): { raw: string; offset: number } | null {
  const lf = src.toLf(originalOffset);
  const lit = findHtmlLiterals(src.text).find((l) => lf >= l.open && lf < l.close);
  return lit ? { raw: src.text.slice(lit.open, lit.close), offset: lf - lit.open } : null;
}
