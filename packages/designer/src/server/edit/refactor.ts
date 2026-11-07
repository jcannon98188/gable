// Refactors from the canvas (TASK-56.24): find every use of a component or a CSS class, and rename a component across the
// project. Both read the project's files (no model is kept, ADR 0001). Rename is a set of minimal text patches over several
// files that the edit service commits as ONE history entry, so a single undo takes the whole rename back.
//
// The TypeScript parser finds identifiers (never strings or comments), and import specifiers are followed to the files that
// really import the class: an unrelated class of the same name in a file that does not import it is not touched.
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "@typescript/typescript6";
import { findHtmlLiterals, parseTemplateTree } from "@gable/template-format";
import { sourceText } from "../source.js";
import { lineCol, lineText } from "../tokens/css-scan.js";
import { projectFiles } from "../tokens/model.js";
import { selects } from "./extract.js";
import type { Hunk } from "./hunks.js";
import { metaAround } from "./meta.js";
import { buildPalette } from "./palette.js";
import { elementsOf, fail } from "./template.js";
import type { EditError } from "./types.js";

export interface Use {
  /**
   * `declaration`, `import`, `export`, `imports` (the component's `imports` list), `reference` (any other mention in code),
   * `template` (the component used in a template), `class-attr` and `class-binding` (a CSS class in a template), `host-binding`
   * (a `[class.x]` in a component's `host`) and `css` (a rule in a stylesheet).
   */
  kind: "declaration" | "import" | "export" | "imports" | "reference" | "template" | "class-attr" | "class-binding" | "host-binding" | "css";
  file: string;
  line: number;
  column: number;
  /** The line it is on, trimmed. */
  text: string;
  /** For a use in a template: the element. */
  tag?: string;
  /** For a use in a template: the template literal's text and the element's offset in it, which the canvas finds the element by (nodeAt). */
  raw?: string;
  offset?: number;
}

export type FindUsesQuery = { kind: "component"; name: string; file?: string } | { kind: "class"; name: string };

export type FindUsesResult =
  | {
      ok: true;
      kind: "component" | "class";
      name: string;
      /** A component: where it is declared and the selector that uses it in templates. */
      declaration?: { file: string; line: number; selector: string | null };
      uses: Use[];
    }
  | EditError;

export interface RenameOp {
  /** The exported class to rename. */
  from: string;
  to: string;
  /** The class's module, when two files declare a class with that name. */
  file?: string;
  /** Also change the component's selector (`app-todo-item` to `app-todo-row`) in its meta and in every template that uses it. */
  selector?: string;
}

export interface RefactorPlan {
  files: Array<{ abs: string; original: string; hunks: Hunk[] }>;
  label: string;
  note?: string;
}

interface Src {
  abs: string;
  rel: string;
  /** LF text. */
  text: string;
  original: string;
  sf: ts.SourceFile;
}

const isTs = (n: string) => /\.tsx?$/.test(n) && !/\.d\.ts$/.test(n);

function loadSources(root: string): Src[] {
  return projectFiles(root, isTs).map((abs) => {
    const original = readFileSync(abs, "utf8");
    const text = original.replaceAll("\r\n", "\n");
    return { abs, rel: relative(root, abs).split(sep).join("/"), text, original, sf: ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true) };
  });
}

const posOf = (text: string, offset: number) => lineCol(text, offset);

// --- components -------------------------------------------------------------------------------------------------------

interface Ref {
  node: ts.Identifier;
  kind: Use["kind"];
}

interface FileRefs {
  src: Src;
  refs: Ref[];
  /** The file declares the class. */
  declares: boolean;
}

/** Where an identifier stands for the class itself rather than a property or label that happens to share the name. */
function isReference(node: ts.Identifier): boolean {
  const p = node.parent;
  if (!p) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (ts.isQualifiedName(p) && p.right === node) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p)) && p.name === node) return false;
  if (ts.isBindingElement(p) && p.propertyName === node) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return p.propertyName ? p.propertyName === node : true;
  return true;
}

function classify(node: ts.Identifier): Ref["kind"] {
  const p = node.parent;
  if (ts.isClassDeclaration(p) && p.name === node) return "declaration";
  if (ts.isImportSpecifier(p)) return "import";
  if (ts.isExportSpecifier(p)) return "export";
  // `imports: [A, B]` in a component's meta
  if (ts.isArrayLiteralExpression(p) && ts.isPropertyAssignment(p.parent) && p.parent.name.getText() === "imports") return "imports";
  return "reference";
}

function resolveSpec(from: string, spec: string, known: Map<string, Src>): Src | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  const bare = base.replace(/\.(m?js|ts)$/, "");
  for (const c of [bare + ".ts", bare + ".tsx", bare + "/index.ts", base]) {
    const hit = known.get(c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/**
 * Every file that holds the class (declares it, or imports it from a file that does, directly or through a barrel), with the
 * identifiers to change. A file that imports it under another name (`X as Y`) only has the specifier changed.
 */
function componentRefs(srcs: Src[], name: string, file?: string): { declared: Src[]; files: FileRefs[] } | EditError {
  const known = new Map(srcs.map((s) => [resolve(s.abs).toLowerCase(), s]));
  const declared = srcs.filter((s) => (!file || s.rel === file) && s.sf.statements.some((st) => ts.isClassDeclaration(st) && st.name?.text === name));
  if (declared.length === 0) return fail("missing", file ? `${file} declares no class ${name}.` : `No class ${name} is declared in this project.`);
  if (declared.length > 1) return fail("ambiguous", `${name} is declared in ${declared.map((d) => d.rel).join(" and ")}: say which one (file).`);

  const providers = new Set<Src>(declared);
  const specifiers = new Map<Src, Array<ts.ImportSpecifier | ts.ExportSpecifier>>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const s of srcs) {
      for (const st of s.sf.statements) {
        if (!ts.isImportDeclaration(st) && !ts.isExportDeclaration(st)) continue;
        const spec = st.moduleSpecifier;
        if (!spec || !ts.isStringLiteral(spec)) continue;
        const target = resolveSpec(s.abs, spec.text, known);
        if (!target || !providers.has(target)) continue;
        const clause = ts.isImportDeclaration(st) ? st.importClause?.namedBindings : st.exportClause;
        if (!clause && ts.isExportDeclaration(st) && !providers.has(s)) {
          // `export * from './x'`: a barrel
          providers.add(s);
          grew = true;
          continue;
        }
        if (!clause || !(ts.isNamedImports(clause) || ts.isNamedExports(clause))) continue;
        const hits = clause.elements.filter((e) => (e.propertyName ?? e.name).text === name);
        if (hits.length === 0) continue;
        const list = specifiers.get(s) ?? [];
        for (const h of hits) if (!list.includes(h)) list.push(h);
        specifiers.set(s, list);
        // a re-export is a provider in its turn
        if (ts.isExportDeclaration(st) && !providers.has(s)) {
          providers.add(s);
          grew = true;
        }
      }
    }
  }

  const files: FileRefs[] = [];
  for (const s of srcs) {
    const declares = declared.includes(s);
    const spec = specifiers.get(s);
    if (!declares && !spec) continue;
    const refs: Ref[] = [];
    // Local bindings: a plain import specifier (or the declaration itself) means every identifier of that name is the class.
    const plainImport = spec?.some((e) => ts.isImportSpecifier(e) && !e.propertyName) ?? false;
    if (declares || plainImport) {
      const walk = (n: ts.Node) => {
        if (ts.isIdentifier(n) && n.text === name && isReference(n)) refs.push({ node: n, kind: classify(n) });
        ts.forEachChild(n, walk);
      };
      walk(s.sf);
    } else {
      for (const e of spec!) {
        const id = e.propertyName ?? e.name;
        if (ts.isIdentifier(id)) refs.push({ node: id, kind: classify(id) });
      }
    }
    if (refs.length) files.push({ src: s, refs, declares });
  }
  return { declared, files };
}

/** The selector of the component class `name` declared in `file`, as written in its meta. */
function selectorOf(root: string, name: string, file: string): string | null {
  return buildPalette(root).find((p) => p.component?.name === name && p.component.file === file)?.selector ?? null;
}

interface TemplateHit {
  src: Src;
  /** The literal's body. */
  raw: string;
  /** Offset of the literal's body in the file (LF). */
  open: number;
  el: Extract<ReturnType<typeof parseTemplateTree>[number], { k: "el" }>;
}

function templateElements(src: Src): TemplateHit[] {
  const out: TemplateHit[] = [];
  for (const lit of findHtmlLiterals(src.text)) {
    const body = src.text.slice(lit.open, lit.close);
    for (const e of elementsOf(parseTemplateTree(body))) out.push({ src, raw: body, open: lit.open, el: e.el });
  }
  return out;
}

// --- find uses ---------------------------------------------------------------------------------------------------------

const useAt = (s: Src, offset: number, kind: Use["kind"], el?: TemplateHit["el"], hit?: TemplateHit): Use => {
  const { line, column } = posOf(s.text, offset);
  return { kind, file: s.rel, line, column, text: lineText(s.text, offset), ...(el ? { tag: el.name } : {}), ...(hit && el ? { raw: hit.raw, offset: el.start } : {}) };
};

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const blankComments = (css: string) => css.replace(CSS_COMMENT, (m) => m.replace(/[^\n]/g, " "));

function cssFiles(root: string) {
  return projectFiles(root, (n) => n.endsWith(".css")).map((abs) => {
    const text = readFileSync(abs, "utf8").replaceAll("\r\n", "\n");
    return { abs, rel: relative(root, abs).split(sep).join("/"), text };
  });
}

export function findUses(root: string, q: FindUsesQuery): FindUsesResult {
  const srcs = loadSources(root);
  const uses: Use[] = [];
  if (q.kind === "component") {
    const found = componentRefs(srcs, q.name, q.file);
    if ("ok" in found) return found;
    const decl = found.declared[0]!;
    for (const f of found.files) for (const r of f.refs) uses.push(useAt(f.src, r.node.getStart(f.src.sf), r.kind));
    const selector = selectorOf(root, q.name, decl.rel);
    if (selector) {
      for (const s of srcs) for (const h of templateElements(s)) if (selects(selector, h.el)) uses.push(useAt(s, h.open + h.el.start, "template", h.el, h));
    }
    uses.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
    const declUse = uses.find((u) => u.kind === "declaration");
    return { ok: true, kind: "component", name: q.name, declaration: { file: decl.rel, line: declUse?.line ?? 1, selector }, uses };
  }

  const name = q.name.replace(/^\./, "");
  if (!/^[\w-]+$/.test(name)) return fail("invalid", "A class name is letters, digits, - and _.");
  const word = new RegExp(`(?<![\\w-])${name.replace(/[-]/g, "\\-")}(?![\\w-])`);
  for (const s of srcs) {
    for (const h of templateElements(s)) {
      for (const a of h.el.attrInfo) {
        const at = h.open + a.start;
        if (a.name === "class" && a.valueStart >= 0) {
          const value = s.text.slice(h.open + a.valueStart, h.open + a.valueEnd);
          const m = word.exec(value);
          if (m) uses.push(useAt(s, h.open + a.valueStart + m.index, "class-attr", h.el, h));
        } else if (a.name === `[class.${name}]`) uses.push(useAt(s, at, "class-binding", h.el, h));
      }
    }
    // `host: { '[class.completed]': ... }` in a component's meta
    for (const m of s.text.matchAll(new RegExp(`['"]\\[class\\.${name.replace(/-/g, "\\-")}\\]['"]`, "g"))) uses.push(useAt(s, m.index!, "host-binding"));
  }
  for (const f of cssFiles(root)) {
    const css = blankComments(f.text);
    for (const m of css.matchAll(new RegExp(`(?<!\\d)\\.${name.replace(/-/g, "\\-")}(?![\\w-])`, "g"))) {
      const { line, column } = posOf(f.text, m.index!);
      uses.push({ kind: "css", file: f.rel, line, column, text: lineText(f.text, m.index!) });
    }
  }
  uses.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
  return { ok: true, kind: "class", name, uses };
}

// --- rename ------------------------------------------------------------------------------------------------------------

const IDENT = /^[A-Za-z_$][\w$]*$/;

interface SelectorShape {
  tag: string | null;
  attr: string | null;
}

function shapeOf(selector: string): SelectorShape | null {
  const m = /^([a-zA-Z][\w-]*)?(?:\[([\w-]+)\])?$/.exec(selector.trim());
  if (!m || (!m[1] && !m[2])) return null;
  return { tag: m[1] ?? null, attr: m[2] ?? null };
}

export function planRename(root: string, op: RenameOp): RefactorPlan | EditError {
  if (!IDENT.test(op.to)) return fail("invalid", "Name the component with letters, digits, _ or $ (PascalCase, such as TodoRow).");
  if (op.from === op.to) return fail("nothing", `${op.from} already has that name.`);
  const srcs = loadSources(root);
  const found = componentRefs(srcs, op.from, op.file);
  if ("ok" in found) return found;
  const decl = found.declared[0]!;
  const word = new RegExp(`(^|[^\\w$.])${op.to.replace(/\$/g, "\\$")}(?![\\w$])`);
  const clash = found.files.find((f) => word.test(f.src.text));
  if (clash) return fail("invalid", `${op.to} is already a name in ${clash.src.rel}: choose another.`);
  if (buildPalette(root).some((p) => p.component?.name === op.to)) return fail("invalid", `The project already has a component called ${op.to}.`);

  const hunks = new Map<Src, Hunk[]>();
  const add = (s: Src, h: Hunk) => hunks.set(s, [...(hunks.get(s) ?? []), h]);
  let references = 0;
  let other = 0;
  for (const f of found.files) {
    for (const r of f.refs) {
      const p = r.node.parent;
      const shorthand = ts.isShorthandPropertyAssignment(p) && p.name === r.node;
      add(f.src, { start: r.node.getStart(f.src.sf), end: r.node.end, text: shorthand ? `${op.from}: ${op.to}` : op.to });
      references++;
    }
    const mentions = [...f.src.text.matchAll(new RegExp(`(?<![\\w$])${op.from.replace(/\$/g, "\\$")}(?![\\w$])`, "g"))].length;
    other += Math.max(0, mentions - f.refs.length);
  }

  let templates = 0;
  let oldSelector: string | null = null;
  if (op.selector !== undefined) {
    oldSelector = selectorOf(root, op.from, decl.rel);
    if (!oldSelector) return fail("invalid", `${op.from} has no plain string selector in its meta, so its selector cannot be renamed.`);
    const before = shapeOf(oldSelector);
    const after = shapeOf(op.selector);
    if (!before || !after) return fail("invalid", "Only a tag (app-todo-row) or a tag with one attribute (li[app-todo-row]) selector can be renamed.");
    if (op.selector === oldSelector) return fail("nothing", "The selector is already that.");
    if ((before.attr === null) !== (after.attr === null) || (before.attr !== null && before.tag !== after.tag)) return fail("invalid", `Keep the shape of the selector ${oldSelector}: change the tag, or the attribute, not both.`);
    if (buildPalette(root).some((p) => p.selector === op.selector)) return fail("invalid", `The project already has a component with the selector ${op.selector}.`);
    const oldName = before.attr ?? before.tag!;
    const newName = after.attr ?? after.tag!;
    for (const s of srcs) {
      for (const h of templateElements(s)) {
        if (!selects(oldSelector, h.el)) continue;
        templates++;
        if (before.attr !== null) {
          const a = h.el.attrInfo.find((x) => x.name.toLowerCase() === oldName.toLowerCase());
          if (a) add(s, { start: h.open + a.start, end: h.open + a.nameEnd, text: newName });
        } else {
          add(s, { start: h.open + h.el.start + 1, end: h.open + h.el.nameEnd, text: newName });
          if (h.el.closeStart >= 0) add(s, { start: h.open + h.el.closeStart + 2, end: h.open + h.el.closeStart + 2 + h.el.name.length, text: newName });
        }
      }
    }
    // the selector string in the component's own meta
    for (const lit of findHtmlLiterals(decl.text)) {
      const meta = metaAround(decl.text, lit.open);
      const prop = meta?.props.find((p) => p.key === "selector");
      if (!prop) continue;
      const q = decl.text[prop.valueStart];
      if ((q !== "'" && q !== '"') || decl.text.slice(prop.valueStart + 1, prop.valueEnd - 1) !== oldSelector) continue;
      add(decl, { start: prop.valueStart + 1, end: prop.valueEnd - 1, text: op.selector });
      break;
    }
    // stylesheets that style the tag by name
    if (before.attr === null) {
      const re = new RegExp(`(?<![\\w.#\\[-])${oldName.replace(/-/g, "\\-")}(?![\\w-])`, "g");
      for (const f of cssFiles(root)) {
        const blanked = blankComments(f.text);
        for (const m of blanked.matchAll(re)) {
          const abs = f.abs;
          let s = srcs.find((x) => x.abs === abs);
          if (!s) srcs.push((s = { abs, rel: f.rel, text: f.text, original: readFileSync(abs, "utf8"), sf: ts.createSourceFile(abs, "", ts.ScriptTarget.Latest) }));
          add(s, { start: m.index!, end: m.index! + oldName.length, text: newName });
        }
      }
    }
  }

  const files: RefactorPlan["files"] = [];
  for (const [s, hs] of hunks) {
    const lf = sourceText(s.original);
    files.push({ abs: s.abs, original: s.original, hunks: hs.map((h) => ({ start: lf.toOriginal(h.start), end: lf.toOriginal(h.end), text: h.text })) });
  }
  files.sort((a, b) => (a.abs === decl.abs ? -1 : b.abs === decl.abs ? 1 : a.abs.localeCompare(b.abs)));
  const notes: string[] = [];
  if (other > 0) notes.push(`${other} other mention${other === 1 ? "" : "s"} of ${op.from} (in strings or comments) ${other === 1 ? "was" : "were"} left as written.`);
  notes.push(`The file ${decl.rel} keeps its name; rename it in your editor if you want it to match.`);
  const label = `Rename ${op.from} to ${op.to}` + (op.selector !== undefined ? ` (${oldSelector} to ${op.selector}, ${templates} template use${templates === 1 ? "" : "s"})` : "");
  return { files, label, note: `${references} reference${references === 1 ? "" : "s"} in ${found.files.length} file${found.files.length === 1 ? "" : "s"}. ${notes.join(" ")}` };
}
