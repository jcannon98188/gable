// Quick fixes. The headline fix extracts an expression the template language does
// not allow (a method call, an operator, a formatted Observable) into a
// `readonly name = computed(() => ...)` view-model signal on the component and
// rewrites the template to read it. Inside a `@for` the fix instead extracts a
// "rows" view model (`xs().map(...)` carrying the derived field) when the loop
// source is a plain signal read. Anything else is reported without a fix.

import ts from "@typescript/typescript6";
import type { Diagnostic } from "./analyze.js";
import type { Site } from "./emit.js";
import { findIdentifier, isObservableLike, isSignal } from "./typeutil.js";

export interface TextEdit {
  file: string;
  start: number;
  length: number;
  newText: string;
}

export interface Fix {
  title: string;
  edits: TextEdit[];
}

export interface FixEnv {
  /** The original source file (offsets match the file on disk). */
  sf: ts.SourceFile;
  /** The same file inside the checked program, with the generated check code appended. */
  checked: ts.SourceFile;
  checker: ts.TypeChecker;
  classType(className: string): ts.Type | undefined;
  /** Member names already claimed by fixes in this run, per class. */
  taken: Map<string, Set<string>>;
}

const PLAIN_SIGNAL_READ = /^([A-Za-z_$][\w$]*)\(\)$/;

/** Quick fix for a bare signal in a value position: call it. */
export function callSignalFix(file: string, end: number, name: string): Fix {
  return { title: `Call the signal: ${name}()`, edits: [{ file, start: end, length: 0, newText: "()" }] };
}

interface Reference {
  node: ts.Identifier;
  name: string;
  kind: "member" | "local" | "global";
}

function bindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) into.add(name.text);
  else for (const el of name.elements) if (ts.isBindingElement(el)) bindingNames(el.name, into);
}

/** Free identifiers of an expression: not property names, not bound by an inner function. */
function references(root: ts.Node, isLocal: (n: string) => boolean, isMember: (n: string) => boolean): Reference[] {
  const out: Reference[] = [];
  const visit = (node: ts.Node, bound: ReadonlySet<string>): void => {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const inner = new Set(bound);
      for (const p of node.parameters) bindingNames(p.name, inner);
      visit(node.body, inner);
      return;
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.name === node) return;
      if (ts.isPropertyAssignment(parent) && parent.name === node) return;
      if (bound.has(node.text)) return;
      out.push({ node, name: node.text, kind: isLocal(node.text) ? "local" : isMember(node.text) ? "member" : "global" });
      return;
    }
    ts.forEachChild(node, (c) => visit(c, bound));
  };
  visit(root, new Set());
  return out;
}

/** The `import { name } from module` situation of a file: the local name to use, and an edit when an import must be added. */
export function ensureImport(file: string, sf: ts.SourceFile, name: string, module: string, typeOnly = false): { local: string; edit?: TextEdit } {
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== module) continue;
    const clause = stmt.importClause;
    if (!clause || (clause.isTypeOnly && !typeOnly) || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    const elements = clause.namedBindings.elements;
    const found = elements.find((e) => (typeOnly || !e.isTypeOnly) && (e.propertyName ?? e.name).text === name);
    if (found) return { local: found.name.text };
    if (elements.length) return { local: name, edit: { file, start: elements[elements.length - 1]!.end, length: 0, newText: `, ${typeOnly && !clause.isTypeOnly ? "type " : ""}${name}` } };
  }
  return { local: name, edit: { file, start: 0, length: 0, newText: `import { ${name} } from "${module}";\n` } };
}

/** A name not used by the class (or its row type) nor by an earlier fix. */
function uniqueName(preferred: string, existing: ts.Type | undefined, claimed: Set<string>, extra?: ts.Type): string {
  const used = (n: string) => claimed.has(n) || !!existing?.getProperty(n) || !!extra?.getProperty(n);
  let name = preferred;
  for (let i = 2; used(name); i++) name = `${preferred}${i}`;
  claimed.add(name);
  return name;
}

/** A readable member name: the binding target when there is one (`aria-expanded` gives `ariaExpanded`), else the first member read with a `Text` suffix, else `value`. */
function suggestName(hint: string | undefined, member: string | undefined): string {
  const target = hint?.replace(/^(attr|class|style)\./, "");
  if (target && /^[A-Za-z][\w-]*$/.test(target)) return target.replace(/-+([a-z])/g, (_, c: string) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
  return `${(member ?? "value").replace(/\$$/, "")}Text`;
}

/** Extract a value expression into a computed view-model signal (see the file header). */
export function extractFix(file: string, site: Site, env: FixEnv): Fix | undefined {
  const text = site.expr.text;
  const parsed = ts.createSourceFile("expression.ts", `(${text})`, ts.ScriptTarget.ES2022, true);
  const syntax = (parsed as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
  const statement = parsed.statements[0];
  if (syntax.length || parsed.statements.length !== 1 || !statement || !ts.isExpressionStatement(statement) || !ts.isParenthesizedExpression(statement.expression)) return undefined;
  const expression = statement.expression.expression;
  if (statement.expression.end !== parsed.text.length) return undefined;

  const className = site.model.className;
  const cls = env.classType(className);
  if (!cls) return undefined;
  const claimed = env.taken.get(className) ?? new Set<string>();
  env.taken.set(className, claimed);

  const refs = references(
    expression,
    (n) => site.locals.has(n),
    (n) => !!cls.getProperty(n),
  );
  const locals = refs.filter((r) => r.kind === "local");
  const loop = site.loop;
  const rows = locals.length > 0;
  if (rows && (!loop || locals.some((r) => r.name !== loop.item))) return undefined;
  const members = refs.filter((r) => r.kind === "member");
  const observed = new Set(members.filter((r) => { const t = env.checker.getTypeOfSymbol(cls.getProperty(r.name)!); return isObservableLike(env.checker, t) && !isSignal(env.checker, t); }).map((r) => r.name));

  // The row type, when extracting inside a loop.
  let itemType: ts.Type | undefined;
  let source: string | undefined;
  if (rows) {
    source = PLAIN_SIGNAL_READ.exec(loop!.source.text)?.[1];
    if (!source || site.locals.has(source) || !cls.getProperty(source) || loop!.track.text === loop!.item || observed.size) return undefined;
    const id = loop!.sourceRef && findIdentifier(env.checked, loop!.sourceRef.part.gen);
    const call = id?.parent.parent;
    if (!call || !ts.isCallExpression(call)) return undefined;
    itemType = env.checker.getTypeAtLocation(call).getNumberIndexType();
    if (!itemType || !(itemType.flags & ts.TypeFlags.Object) || itemType.getCallSignatures().length) return undefined;
  }

  // Imports and observed-root signals.
  const edits: TextEdit[] = [];
  const computed = ensureImport(file, env.sf, "computed", "@gable/core");
  if (computed.edit) edits.push(computed.edit);
  const toSignal = observed.size ? ensureImport(file, env.sf, "toSignal", "@gable/core/rxjs") : undefined;
  if (toSignal?.edit) edits.push(toSignal.edit);
  const signalFor = new Map<string, string>();
  const members_: string[] = [];
  for (const name of observed) {
    const signalName = uniqueName(name.replace(/\$$/, "") || `${name}Value`, cls, claimed);
    signalFor.set(name, signalName);
    members_.push(`readonly ${signalName} = ${toSignal!.local}(this.${name});`);
  }

  // Rewrite the expression as TypeScript that lives on the component.
  const rewrites: Array<{ at: number; end: number; text: string }> = [];
  for (const r of members) {
    const at = r.node.getStart(parsed) - 1;
    const end = r.node.end - 1;
    const parent = r.node.parent;
    const signalName = signalFor.get(r.name);
    const replacement = signalName ? `this.${signalName}()` : `this.${r.name}`;
    if (ts.isShorthandPropertyAssignment(parent)) rewrites.push({ at, end, text: `${r.name}: ${replacement}` });
    else rewrites.push({ at, end, text: replacement });
    if (signalName) {
      // Every later step of an Observable's path is optional, like in the template.
      for (let node: ts.Node = r.node; ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node; node = node.parent) {
        if (!node.parent.questionDotToken) rewrites.push({ at: node.parent.name.pos - 2, end: node.parent.name.pos - 2, text: "?" });
      }
    }
  }
  let body = text;
  for (const w of rewrites.sort((a, b) => b.at - a.at || b.end - a.end)) body = body.slice(0, w.at) + w.text + body.slice(w.end);

  const { insertAt, indent } = site.model;
  const lines = (...declarations: string[]) => declarations.map((d) => `\n\n${indent}${d}`).join("");
  const replaceSite: TextEdit = { file, start: site.expr.start, length: text.length, newText: "" };

  if (rows) {
    const rowsName = uniqueName(`${source}Rows`, cls, claimed);
    const field = uniqueName(`${(members[0]?.name ?? loop!.item).replace(/\$$/, "")}View`, undefined, new Set(), itemType);
    replaceSite.newText = `${loop!.item}.${field}`;
    edits.push(
      replaceSite,
      { file, start: loop!.source.start, length: loop!.source.text.length, newText: `${rowsName}()` },
      { file, start: insertAt, length: 0, newText: lines(`readonly ${rowsName} = ${computed.local}(() => this.${source}().map((${loop!.item}) => ({ ...${loop!.item}, ${field}: ${body} })));`) },
    );
    return { title: `Extract "${text}" into the rows view model "${rowsName}"`, edits };
  }

  const name = uniqueName(suggestName(site.hint, members[0]?.name), cls, claimed);
  replaceSite.newText = `${name}()`;
  edits.push(replaceSite, { file, start: insertAt, length: 0, newText: lines(...members_, `readonly ${name} = ${computed.local}(() => ${body});`) });
  return { title: `Extract "${text}" into the computed signal "${name}"`, edits };
}

/** Applies each file's non-overlapping edits (identical edits are applied once); returns the new texts. */
export function applyEdits(texts: Map<string, string>, fixes: Fix[]): Map<string, string> {
  const applied = new Map<string, TextEdit[]>();
  const overlaps = (a: TextEdit, b: TextEdit) =>
    a.start < b.start + b.length && b.start < a.start + a.length ? true : a.length === 0 && b.length > 0 ? a.start > b.start && a.start < b.start + b.length : b.length === 0 && a.length > 0 ? b.start > a.start && b.start < a.start + a.length : false;
  const same = (a: TextEdit, b: TextEdit) => a.start === b.start && a.length === b.length && a.newText === b.newText;
  for (const fix of fixes) {
    const fresh = fix.edits.filter((e) => !(applied.get(e.file) ?? []).some((o) => same(o, e)));
    if (fresh.some((e) => (applied.get(e.file) ?? []).some((o) => overlaps(o, e)))) continue;
    for (const e of fresh) applied.set(e.file, [...(applied.get(e.file) ?? []), e]);
  }
  const out = new Map<string, string>();
  for (const [file, edits] of applied) {
    let text = texts.get(file)!;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.newText + text.slice(e.start + e.length);
    out.set(file, text);
  }
  return out;
}

/** An editor code fix in the diagnostic's own file. */
export interface EditorFix {
  description: string;
  edits: Array<{ start: number; length: number; newText: string }>;
}

/** Fixes for the diagnostics that overlap the range `[start, end]`: the analyzer's own fixes plus spelling suggestions. */
export function fixesFor(diagnostics: Diagnostic[], file: string, start: number, end: number): EditorFix[] {
  const out: EditorFix[] = [];
  for (const d of diagnostics) {
    if (d.start > end || d.start + d.length < start) continue;
    for (const fix of d.fixes ?? []) {
      const edits = fix.edits.filter((e) => sameFile(e.file, file));
      if (edits.length === fix.edits.length) out.push({ description: fix.title, edits });
    }
    if (d.rule === "unknown-member") {
      const suggestion = /Did you mean '([^']+)'/.exec(d.message)?.[1];
      if (suggestion) out.push({ description: `Change spelling to '${suggestion}'`, edits: [{ start: d.start, length: d.length, newText: suggestion }] });
    }
  }
  return out;
}

const normPath = (p: string) => p.split("\\").join("/").toLowerCase();
const sameFile = (a: string, b: string) => normPath(a) === normPath(b);
