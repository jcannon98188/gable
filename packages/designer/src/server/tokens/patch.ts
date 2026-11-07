// Write-back of one design token: set or remove one custom property in one exact context (`:root`, `.dark`,
// `@media (prefers-color-scheme: dark) :root`, `@theme`) of a stylesheet, as a patch of just that declaration. The last block
// with exactly that context holds the edit (the one the cascade lets win); a context the file lacks is appended at its end.
import type { Hunk } from "../edit/hunks.js";
import { fail } from "../edit/template.js";
import type { EditError } from "../edit/types.js";
import { normalizePrelude, scanCss, type CssFrame, type CssScan } from "./css-scan.js";

export interface TokenSpot {
  name: string;
  selector: string | null;
  atRules: string[];
}

const chainOf = (spot: TokenSpot): CssFrame[] => [
  ...spot.atRules.map((text): CssFrame => ({ kind: "at", text: normalizePrelude(text) })),
  ...(spot.selector !== null ? [{ kind: "rule" as const, text: normalizePrelude(spot.selector) }] : []),
];

const sameChain = (a: CssFrame[], b: CssFrame[]) => a.length === b.length && a.every((f, i) => f.kind === b[i]!.kind && f.text === b[i]!.text);

/** The block that holds `spot` in the file (the last one with exactly its context), and its declaration of the token. */
export function findToken(css: string, spot: TokenSpot, scan: CssScan = scanCss(css)) {
  const chain = chainOf(spot);
  let block = -1;
  scan.blocks.forEach((b, i) => {
    if (sameChain(b.chain, chain)) block = i;
  });
  const own = scan.decls.filter((d) => d.block === block);
  const decl = block === -1 ? undefined : own.filter((d) => d.property === spot.name).pop();
  return { block, info: block === -1 ? null : scan.blocks[block]!, decl, own, chain };
}

const lineStart = (s: string, i: number) => s.lastIndexOf("\n", i - 1) + 1;
const indentAt = (s: string, i: number) => /^[ \t]*/.exec(s.slice(lineStart(s, i)))![0];
const norm = (v: string | null | undefined) => (v == null ? null : v.replace(/\s+/g, " ").trim());

export function planTokenEdit(css: string, spot: TokenSpot & { value: string | null; expect?: string | null }): Hunk[] | EditError {
  if (!/^--[\w-]+$/.test(spot.name)) return fail("invalid", `"${spot.name}" is not a custom property name (--name).`);
  if (spot.value !== null && (spot.value.trim() === "" || /[;{}]|\/\*|\*\//.test(spot.value))) return fail("invalid", "The value must be a plain CSS value (no ; { } or comments).");
  if (spot.selector !== null && (spot.selector.trim() === "" || /[{};]|\/\*/.test(spot.selector))) return fail("invalid", "Not a plain selector.");
  if (spot.atRules.some((a) => !a.trim().startsWith("@") || /[{};]|\/\*/.test(a))) return fail("invalid", "Not a plain at-rule prelude.");
  if (spot.selector === null && spot.atRules.length === 0) return fail("invalid", "A token is written inside a rule or an at-rule such as @theme.");
  const value = spot.value?.trim() ?? null;
  const { block, info, decl, own, chain } = findToken(css, spot);
  if (spot.expect !== undefined && norm(decl?.value) !== norm(spot.expect)) {
    return fail("stale", `${spot.name} changed in the file since it was read (it is now ${decl ? `"${decl.value}"` : "not set there"}). Refresh and try again.`);
  }

  if (block === -1) {
    if (value === null) return fail("nothing", `No ${chain.map((f) => f.text).join(" ")} block to remove ${spot.name} from.`);
    let text = "";
    chain.forEach((f, i) => (text += `${"  ".repeat(i)}${f.text} {\n`));
    text += `${"  ".repeat(chain.length)}${spot.name}: ${value};\n`;
    for (let i = chain.length - 1; i >= 0; i--) text += `${"  ".repeat(i)}}\n`;
    const lead = css === "" ? "" : css.endsWith("\n\n") ? "" : css.endsWith("\n") ? "\n" : "\n\n";
    return [{ start: css.length, end: css.length, text: lead + text }];
  }

  const b = info!;
  if (decl) {
    if (value === null) {
      const nl = css.indexOf("\n", decl.end);
      const restOfLine = css.slice(decl.end, nl === -1 ? css.length : nl);
      if (css.slice(lineStart(css, decl.start), decl.start).trim() === "" && restOfLine.trim() === "") {
        return [{ start: lineStart(css, decl.start), end: nl === -1 ? css.length : nl + 1, text: "" }];
      }
      return [{ start: decl.start, end: decl.end, text: "" }];
    }
    return [{ start: decl.valueStart, end: decl.valueEnd, text: value }];
  }
  if (value === null) return fail("nothing", `${chain.map((f) => f.text).join(" ")} has no ${spot.name} to remove.`);
  const last = own[own.length - 1];
  if (last) {
    const onOwnLine = css.slice(lineStart(css, last.start), last.start).trim() === "";
    const semi = css[last.end - 1] === ";";
    if (onOwnLine) return [{ start: last.end, end: last.end, text: `${semi ? "" : ";"}\n${indentAt(css, last.start)}${spot.name}: ${value};` }];
    return [{ start: last.end, end: last.end, text: `${semi ? "" : ";"} ${spot.name}: ${value};` }];
  }
  // An empty block, or one holding only nested blocks: first thing after the `{`.
  const inner = css.slice(b.open + 1, b.close);
  if (!inner.includes("\n")) return [{ start: b.open + 1, end: b.close, text: ` ${spot.name}: ${value}; ` }];
  return [{ start: b.open + 1, end: b.open + 1, text: `\n${indentAt(css, b.start)}  ${spot.name}: ${value};` }];
}

