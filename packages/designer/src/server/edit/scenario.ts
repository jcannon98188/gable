// The Scenario writer: adds a scene to a `*.scenes.ts` file as one text insertion after its last scene. The TypeScript parser
// finds the default export's `scenes` object (the same reading as scene-index.ts); nothing is reprinted, so the file's own
// layout, quotes and trailing commas stay as they are and the change is a reverse patch away from undone.
import ts from "@typescript/typescript6";
import type { Hunk } from "./hunks.js";
import { fail } from "./template.js";
import type { EditError, EditOp } from "./types.js";

type AddScene = Extract<EditOp, { op: "addScene" }>;

const unwrap = (e: ts.Expression): ts.Expression => (ts.isSatisfiesExpression(e) || ts.isAsExpression(e) || ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e);
const keyOf = (n: ts.PropertyName): string | null => (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null);
const IDENT = /^[A-Za-z_$][\w$]*$/;

const lineStart = (s: string, i: number) => s.lastIndexOf("\n", i - 1) + 1;
const indentOf = (s: string, i: number) => /^[ \t]*/.exec(s.slice(lineStart(s, i)))![0];

/** The object literal of the default export's `scenes`, or why there is none. */
export function scenesObject(sf: ts.SourceFile): ts.ObjectLiteralExpression | EditError {
  const exported = sf.statements.find(ts.isExportAssignment);
  let def: ts.Expression | undefined = exported && unwrap(exported.expression);
  if (def && ts.isIdentifier(def)) {
    const name = def.text;
    def = undefined;
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) def = unwrap(d.initializer);
    }
  }
  if (!def || !ts.isObjectLiteralExpression(def)) return fail("invalid", "The scenes file has no default export written as an object literal, so a scene cannot be added to it.");
  for (const p of def.properties) {
    if (ts.isPropertyAssignment(p) && keyOf(p.name) === "scenes") {
      const v = unwrap(p.initializer);
      if (ts.isObjectLiteralExpression(v)) return v;
      return fail("readonly", "The file's `scenes` is not an object literal (it is computed), so it is shown but not rewritten.");
    }
  }
  return fail("invalid", "The scenes file's default export has no `scenes` object.");
}

/** A string literal in the file's own quote style. */
function stringLiteral(value: string, quote: string): string {
  return quote + value.replaceAll("\\", "\\\\").replaceAll(quote, "\\" + quote) + quote;
}

/** Plans adding scene `op.name` to the scenes file `text` (LF). Hunks are in LF coordinates. */
export function planScene(text: string, op: AddScene): { hunks: Hunk[]; label: string } | EditError {
  const name = op.name.trim();
  if (name === "") return fail("invalid", "Name the Scenario.");
  if (name.length > 80) return fail("invalid", "The name is too long (80 characters at most).");
  if (/[\\`\n\r\t]/.test(name) || name.includes("|")) return fail("invalid", "The name cannot contain a backslash, a backtick, a | or a line break.");
  const description = (op.description ?? "").trim();
  if (/[\n\r`]/.test(description) || description.includes("${")) return fail("invalid", "The description must be one line of plain text.");

  const sf = ts.createSourceFile("x.scenes.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const scenes = scenesObject(sf);
  if ("ok" in scenes) return scenes;
  const props = scenes.properties;
  const named = new Map<string, ts.ObjectLiteralElementLike>();
  for (const p of props) {
    const k = p.name && ts.isPropertyName(p.name) ? keyOf(p.name) : null;
    if (k !== null) named.set(k, p);
  }
  if (named.has(name)) return fail("invalid", `There is already a Scenario called "${name}".`);

  const firstImport = sf.statements.find(ts.isImportDeclaration);
  const quote = firstImport?.moduleSpecifier.getText(sf)[0] === '"' ? '"' : "'";
  const key = IDENT.test(name) ? name : stringLiteral(name, quote);
  const desc = description ? `description: ${stringLiteral(description, quote)}` : "";

  // The new scene's definition: a copy of another scene's, or an empty one.
  let value: string;
  if (op.from !== undefined) {
    const source = named.get(op.from);
    if (!source || !ts.isPropertyAssignment(source)) return fail("stale", `There is no Scenario "${op.from}" to start from any more.`);
    value = copyScene(text, sf, source.initializer, desc);
  } else value = desc ? `{ ${desc} }` : "{}";

  const label = `Add Scenario "${name}"`;
  const entry = `${key}: ${value}`;
  if (props.length === 0) {
    const indent = indentOf(text, scenes.getStart(sf));
    const unit = /^[ \t]+/m.exec(text)?.[0] ?? "  ";
    return { hunks: [{ start: scenes.getStart(sf), end: scenes.end, text: `{\n${indent}${unit}${entry},\n${indent}}` }], label };
  }
  const last = props[props.length - 1]!;
  const trailing = props.hasTrailingComma;
  // The comma after the last scene, when there is one: the new scene goes after it.
  const at = trailing ? text.indexOf(",", last.end) + 1 : last.end;
  const multiline = text.slice(scenes.getStart(sf), props[0]!.getStart(sf)).includes("\n");
  if (multiline) {
    const indent = indentOf(text, last.getStart(sf));
    return { hunks: [{ start: at, end: at, text: `${trailing ? "" : ","}\n${indent}${entry}${trailing ? "," : ""}` }], label };
  }
  return { hunks: [{ start: at, end: at, text: trailing ? ` ${entry},` : `, ${entry}` }], label };
}

/** Another scene's definition as written, with its description replaced (or removed, when the new one has none). */
function copyScene(text: string, sf: ts.SourceFile, init: ts.Expression, desc: string): string {
  const written = text.slice(init.getStart(sf), init.end);
  const obj = unwrap(init);
  if (!ts.isObjectLiteralExpression(obj)) return desc ? `{ ...${written}, ${desc} }` : written;
  const base = init.getStart(sf);
  const rel = (n: number) => n - base;
  const existing = obj.properties.find((p) => ts.isPropertyAssignment(p) && keyOf(p.name) === "description");
  if (existing) {
    if (desc) return written.slice(0, rel(existing.getStart(sf))) + desc + written.slice(rel(existing.end));
    // Removed with its comma and the space up to the next property.
    let end = rel(existing.end);
    const after = /^\s*,[ \t]*\n?[ \t]*/.exec(written.slice(end));
    if (after) end += after[0].length;
    let start = rel(existing.getStart(sf));
    if (!after) {
      const before = /,\s*$/.exec(written.slice(0, start));
      if (before) start -= before[0].length;
    }
    return written.slice(0, start) + written.slice(end);
  }
  if (!desc) return written;
  const open = rel(obj.getStart(sf)) + 1;
  const first = obj.properties[0];
  if (!first) return written.slice(0, open) + ` ${desc} ` + written.slice(rel(obj.end) - 1);
  const firstAt = rel(first.getStart(sf));
  if (written.slice(open, firstAt).includes("\n")) return written.slice(0, firstAt) + `${desc},\n${indentOf(written, firstAt)}` + written.slice(firstAt);
  return written.slice(0, firstAt) + `${desc}, ` + written.slice(firstAt);
}
