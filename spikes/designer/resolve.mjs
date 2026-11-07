// THROWAWAY SPIKE. The "file side" of node-to-source mapping: runs in the shell backend (Rust command in Tauri, Node here).
// Input: what the agent reported (module path + the template literal's raw text + offsets inside it).
// Output: the file and an exact range inside the `html` literal in the .ts source.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findHtmlLiterals } from "../../packages/template-format/dist/index.js";

export function resolveSource(root, s) {
  const file = s.component?.source?.file ?? (s.component?.source?.path && join(root, s.component.source.path));
  if (!file) return { error: "no source file for component" };
  const original = readFileSync(file, "utf8");
  // JS normalises CRLF to LF inside template literals, so the agent's offsets are in LF space: work in LF, map back.
  const text = original.replaceAll("\r\n", "\n");
  const back = []; // LF offset -> original offset
  for (let i = 0, extra = 0; i <= text.length; i++) {
    back[i] = i + extra;
    if (original[i + extra] === "\r" && original[i + extra + 1] === "\n") extra++;
  }
  const lineCol = (lf) => {
    const before = text.slice(0, lf);
    return { line: before.split("\n").length, col: lf - (before.lastIndexOf("\n") + 1) + 1, offset: back[lf] };
  };
  // The literal is identified by its content: templates have no ${} holes, so `strings.raw[0]` IS the literal body.
  const matches = findHtmlLiterals(text).filter((l) => text.slice(l.open, l.close) === s.raw);
  if (matches.length === 0) return { error: "literal not found in file (edited since load, or escapes)", file };
  const lit = matches[0];
  const [a, b, c] = [lit.open + s.start, lit.open + s.openEnd, lit.open + s.end];
  return { file, ambiguous: matches.length > 1, range: { from: lineCol(a), to: lineCol(c) }, openingTag: text.slice(a, b), text: text.slice(a, c) };
}
