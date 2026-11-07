// Route config write-back: finds the project's `Route[]` in its source, and turns "add a route" / "edit a route" into
// minimal text patches of that file (ADR 0001: the source is the truth; nothing is regenerated, so formatting, comments and
// everything the Designer does not touch survive). HMR applies the result to the running router.
//
// This is deliberately its own small module: it plans edits as plain `{ start, end, text }` ranges over one file's text and
// knows nothing about how they are written. `RouteConfigHost` is the one seam, so the general write-back engine (TASK-56.4)
// can supply its own read and write (with undo, for instance) without this file changing. It is not that engine: it edits
// route objects only, never templates.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import ts from "@typescript/typescript6";

// --- what the Designer shows ---------------------------------------------------

/** One route as written in the config. `at` is its index path from the top of the array (`[2, 0]` is the first child of the third route). */
export interface RouteSourceNode {
  at: number[];
  /** `null` when the path is not a string literal (the Designer then leaves it alone). */
  path: string | null;
  component: string | null;
  title: string | null;
  redirectTo: string | null;
  /** `"lazy"` for `lazy()` children, `null` for none. */
  children: RouteSourceNode[] | "lazy" | null;
  /** 1-based line of the route's object in the file. */
  line: number;
}

export interface RouteConfigInfo {
  /** Root-relative, forward slashes. */
  file: string;
  routes: RouteSourceNode[];
  /** Other files that also declare a `Route[]` and were not chosen. */
  others: string[];
}

export interface ComponentInfo {
  name: string;
  /** Root-relative, forward slashes. */
  file: string;
}

// --- edits ---------------------------------------------------------------------

export interface ComponentRef {
  name: string;
  /** Root-relative file the class is exported from; an import is added when the config file does not import `name` yet. */
  from?: string;
}

export interface NewRoute {
  path: string;
  component?: ComponentRef;
  title?: string;
  redirectTo?: string;
}

export type RouteEdit =
  /**
   * Adds `route` to the children of the route at `parent` (`[]`: the top level). `index` is the position among the siblings;
   * by default it goes at the end, but before a trailing `**` catch-all (anything after it could never match).
   */
  | { op: "add"; parent: number[]; index?: number; route: NewRoute }
  /** Changes the named fields of the route at `at`; `null` removes a field. */
  | { op: "set"; at: number[]; set: { path?: string; title?: string | null; redirectTo?: string | null; component?: ComponentRef | null } };

export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

/** Where the file's text lives. The default reads and writes the file; a write-back engine can pass its own. */
export interface RouteConfigHost {
  read(file: string): string;
  write(file: string, text: string): void;
}

export const fileHost = (root: string): RouteConfigHost => ({
  read: (file) => readFileSync(join(root, file), "utf8"),
  write: (file, text) => writeFileSync(join(root, file), text),
});

export interface RouteConfigResult {
  file: string;
  before: string;
  after: string;
  routes: RouteSourceNode[];
}

// --- parsing ---------------------------------------------------------------------

const parse = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const propName = (p: ts.ObjectLiteralElementLike): string | null =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;

/** True for `Route[]`, `readonly Route[]`, `Array<Route>`, `ReadonlyArray<Route>`, `Routes`. */
function isRouteArrayType(type: ts.TypeNode | undefined): boolean {
  if (!type) return false;
  if (ts.isTypeOperatorNode(type)) return isRouteArrayType(type.type);
  if (ts.isArrayTypeNode(type)) return ts.isTypeReferenceNode(type.elementType) && type.elementType.typeName.getText() === "Route";
  if (ts.isTypeReferenceNode(type)) {
    const name = type.typeName.getText();
    if (name === "Routes") return true;
    const arg = type.typeArguments?.[0];
    return (name === "Array" || name === "ReadonlyArray") && !!arg && ts.isTypeReferenceNode(arg) && arg.typeName.getText() === "Route";
  }
  return false;
}

/** The array literal the project's route config is: a `Route[]`-typed variable, or what `provideRouter(...)` is given. */
function findRouteArray(sf: ts.SourceFile): ts.ArrayLiteralExpression | null {
  const named = new Map<string, ts.ArrayLiteralExpression>();
  let typed: ts.ArrayLiteralExpression | null = null;
  let provided: ts.Expression | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const init = ts.isSatisfiesExpression(node.initializer) || ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isArrayLiteralExpression(init)) {
        named.set(node.name.text, init);
        if (isRouteArrayType(node.type) || (ts.isSatisfiesExpression(node.initializer) && isRouteArrayType(node.initializer.type))) typed ??= init;
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "provideRouter" && node.arguments[0]) provided ??= node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (provided) {
    const p: ts.Expression = provided;
    if (ts.isArrayLiteralExpression(p)) return p;
    if (ts.isIdentifier(p) && named.get(p.text)) return named.get(p.text)!;
  }
  return typed;
}

const stringOf = (e: ts.Expression | undefined): string | null => (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null);

function treeOf(sf: ts.SourceFile, array: ts.ArrayLiteralExpression, at: number[] = []): RouteSourceNode[] {
  const out: RouteSourceNode[] = [];
  array.elements.forEach((el, i) => {
    if (!ts.isObjectLiteralExpression(el)) return void out.push({ at: [...at, i], path: null, component: null, title: null, redirectTo: null, children: null, line: sf.getLineAndCharacterOfPosition(el.getStart()).line + 1 });
    const props = new Map<string, ts.ObjectLiteralElementLike>();
    for (const p of el.properties) {
      const n = propName(p);
      if (n) props.set(n, p);
    }
    const value = (name: string) => {
      const p = props.get(name);
      return p && ts.isPropertyAssignment(p) ? p.initializer : undefined;
    };
    const comp = props.get("component");
    const children = value("children");
    out.push({
      at: [...at, i],
      path: stringOf(value("path")),
      component: comp ? (ts.isShorthandPropertyAssignment(comp) ? comp.name.text : ts.isPropertyAssignment(comp) ? comp.initializer.getText() : null) : null,
      title: stringOf(value("title")),
      redirectTo: stringOf(value("redirectTo")),
      children: !children ? null : ts.isArrayLiteralExpression(children) ? treeOf(sf, children, [...at, i]) : "lazy",
      line: sf.getLineAndCharacterOfPosition(el.getStart()).line + 1,
    });
  });
  return out;
}

const SKIP = new Set(["node_modules", "dist", ".git", ".vite", "target", "coverage"]);

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name) && !entry.name.startsWith(".")) walk(join(dir, entry.name));
      } else if (/\.ts$/.test(entry.name) && !/\.(d|test|scenes)\.ts$/.test(entry.name)) out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

/** The classes in the project that look like components (`static meta`), for the "add route" picker. */
export function listComponents(root: string): ComponentInfo[] {
  const out: ComponentInfo[] = [];
  for (const file of sourceFiles(root)) {
    const text = readFileSync(join(root, file), "utf8");
    if (!text.includes("meta")) continue;
    const sf = parse(file, text);
    for (const st of sf.statements) {
      if (!ts.isClassDeclaration(st) || !st.name) continue;
      if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      const hasMeta = st.members.some((m) => ts.isPropertyDeclaration(m) && m.name.getText() === "meta" && m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword));
      if (hasMeta) out.push({ name: st.name.text, file });
    }
  }
  return out;
}

/** Finds the route config: the first file (routes-named files first) with a `Route[]`. */
export function locateRouteConfig(root: string, host: RouteConfigHost = fileHost(root)): RouteConfigInfo | null {
  const found: Array<{ file: string; routes: RouteSourceNode[] }> = [];
  for (const file of sourceFiles(root)) {
    const text = host.read(file);
    if (!text.includes("Route") && !text.includes("provideRouter")) continue;
    const sf = parse(file, text);
    const array = findRouteArray(sf);
    if (array) found.push({ file, routes: treeOf(sf, array) });
  }
  if (found.length === 0) return null;
  found.sort((a, b) => Number(/routes?\b/i.test(b.file)) - Number(/routes?\b/i.test(a.file)));
  return { ...found[0]!, others: found.slice(1).map((f) => f.file) };
}

// --- planning --------------------------------------------------------------------

interface Style {
  quote: "'" | '"';
  eol: string;
  semi: boolean;
}

function styleOf(sf: ts.SourceFile, text: string): Style {
  let single = 0;
  let double = 0;
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n)) n.getText().startsWith("'") ? single++ : double++;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const imports = sf.statements.filter(ts.isImportDeclaration);
  return { quote: double > single ? '"' : "'", eol: text.includes("\r\n") ? "\r\n" : "\n", semi: imports.length === 0 || imports[imports.length - 1]!.getText().endsWith(";") };
}

const quoted = (s: string, q: string) => q + s.replaceAll("\\", "\\\\").replaceAll(q, "\\" + q).replaceAll("\n", "\\n") + q;

const lineIndent = (text: string, pos: number) => {
  const start = text.lastIndexOf("\n", pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(start, pos))![0];
};

/** The array a path of indices leads to; `[]` is the top level. Creates nothing. */
function arrayAt(root: ts.ArrayLiteralExpression, parent: number[]): { array: ts.ArrayLiteralExpression | null; owner: ts.ObjectLiteralExpression | null } {
  let array = root;
  let owner: ts.ObjectLiteralExpression | null = null;
  for (let d = 0; d < parent.length; d++) {
    const el = array.elements[parent[d]!];
    if (!el || !ts.isObjectLiteralExpression(el)) throw new Error(`There is no route at ${parent.slice(0, d + 1).join(".")}.`);
    owner = el;
    const children = el.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && propName(p) === "children");
    if (!children) {
      if (d === parent.length - 1) return { array: null, owner };
      throw new Error(`The route at ${parent.slice(0, d + 1).join(".")} has no children.`);
    }
    if (!ts.isArrayLiteralExpression(children.initializer)) throw new Error("Children loaded with lazy() are not edited here.");
    array = children.initializer;
  }
  return { array, owner };
}

const render = (route: NewRoute, s: Style): string => {
  const parts = [`path: ${quoted(route.path, s.quote)}`];
  if (route.component) parts.push(`component: ${route.component.name}`);
  if (route.title !== undefined) parts.push(`title: ${quoted(route.title, s.quote)}`);
  if (route.redirectTo !== undefined) parts.push(`redirectTo: ${quoted(route.redirectTo, s.quote)}`);
  return `{ ${parts.join(", ")} }`;
};

const isMultiline = (text: string, a: number, b: number) => text.slice(a, b).includes("\n");

/** Inserts `item` as element `index` of an array literal or property of an object literal (they edit alike). */
function insertItem(text: string, nodes: readonly ts.Node[], open: number, close: number, index: number, item: string, s: Style): TextEdit {
  const n = nodes.length;
  if (n === 0) return { start: open + 1, end: close, text: ` ${item} ` };
  const multi = isMultiline(text, open, nodes[0]!.getStart());
  const indent = lineIndent(text, nodes[0]!.getStart());
  if (index < n) {
    const at = nodes[index]!.getStart();
    return { start: at, end: at, text: multi ? `${item},${s.eol}${indent}` : `${item}, ` };
  }
  const at = nodes[n - 1]!.end;
  return { start: at, end: at, text: multi ? `,${s.eol}${indent}${item}` : `, ${item}` };
}

function removeProp(text: string, props: readonly ts.ObjectLiteralElementLike[], k: number): TextEdit {
  if (k < props.length - 1) return { start: props[k]!.getStart(), end: props[k + 1]!.getStart(), text: "" };
  if (k > 0) return { start: props[k - 1]!.end, end: props[k]!.end, text: "" };
  return { start: props[k]!.getStart(), end: props[k]!.end, text: "" };
}

function importEdit(sf: ts.SourceFile, text: string, s: Style, name: string, fromFile: string, configFile: string): TextEdit | null {
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    const bindings = st.importClause?.namedBindings;
    if (st.importClause?.name?.text === name || (bindings && ts.isNamedImports(bindings) && bindings.elements.some((e) => e.name.text === name))) return null;
  }
  let spec = relative(dirname(configFile), fromFile).split(sep).join("/").replace(/\.ts$/, ".js");
  if (!spec.startsWith(".")) spec = "./" + spec;
  const line = `import { ${name} } from ${quoted(spec, s.quote)}${s.semi ? ";" : ""}`;
  const imports = sf.statements.filter(ts.isImportDeclaration);
  if (imports.length === 0) return { start: 0, end: 0, text: line + s.eol };
  const at = imports[imports.length - 1]!.end;
  return { start: at, end: at, text: s.eol + line };
}

/** Plans `edit` against `text` (the config file at `file`). Pure: nothing is written. */
export function planRouteEdit(file: string, text: string, edit: RouteEdit): TextEdit[] {
  const sf = parse(file, text);
  const root = findRouteArray(sf);
  if (!root) throw new Error(`${file} has no route config.`);
  const s = styleOf(sf, text);
  const edits: TextEdit[] = [];
  const withImport = (c: ComponentRef | undefined | null) => {
    if (!c?.from) return;
    const e = importEdit(sf, text, s, c.name, c.from, file);
    if (e) edits.push(e);
  };

  if (edit.op === "add") {
    if (!/^[\w\-:./*]*$/.test(edit.route.path)) throw new Error(`"${edit.route.path}" is not a valid route path.`);
    const { array, owner } = arrayAt(root, edit.parent);
    const item = render(edit.route, s);
    withImport(edit.route.component);
    if (array) {
      const els = array.elements;
      const last = els[els.length - 1];
      const catchAll = last && ts.isObjectLiteralExpression(last) && stringOf((last.properties.find((p) => propName(p) === "path") as ts.PropertyAssignment | undefined)?.initializer) === "**";
      const index = Math.max(0, Math.min(edit.index ?? (catchAll ? els.length - 1 : els.length), els.length));
      edits.push(insertItem(text, els, array.getStart(), array.end - 1, index, item, s));
    } else {
      // the parent has no children yet: give it a `children` array
      const props = owner!.properties;
      edits.push(insertItem(text, props, owner!.getStart(), owner!.end - 1, props.length, `children: [${item}]`, s));
    }
    return edits;
  }

  const { array } = arrayAt(root, edit.at.slice(0, -1));
  const el = array?.elements[edit.at[edit.at.length - 1]!];
  if (!el || !ts.isObjectLiteralExpression(el)) throw new Error(`There is no route at ${edit.at.join(".")}.`);
  const props = el.properties;
  const open = el.getStart();
  const close = el.end - 1;
  const fields: Array<[string, string | null]> = [];
  if (edit.set.path !== undefined) fields.push(["path", quoted(edit.set.path, s.quote)]);
  if (edit.set.title !== undefined) fields.push(["title", edit.set.title === null ? null : quoted(edit.set.title, s.quote)]);
  if (edit.set.redirectTo !== undefined) fields.push(["redirectTo", edit.set.redirectTo === null ? null : quoted(edit.set.redirectTo, s.quote)]);
  if (edit.set.component !== undefined) {
    fields.push(["component", edit.set.component === null ? null : edit.set.component.name]);
    withImport(edit.set.component);
  }
  if (edit.set.path !== undefined && !/^[\w\-:./*]*$/.test(edit.set.path)) throw new Error(`"${edit.set.path}" is not a valid route path.`);
  const added: string[] = [];
  for (const [name, value] of fields) {
    const k = props.findIndex((p) => propName(p) === name);
    if (k >= 0) {
      const p = props[k]!;
      if (value === null) edits.push(removeProp(text, props, k));
      else if (ts.isPropertyAssignment(p)) edits.push({ start: p.initializer.getStart(), end: p.initializer.end, text: value });
      else edits.push({ start: p.getStart(), end: p.end, text: `${name}: ${value}` });
    } else if (value !== null) added.push(`${name}: ${value}`);
  }
  // Removing several props that touch each other would overlap; one removal per plan keeps that simple.
  if (edits.filter((e) => e.text === "" ).length > 1) throw new Error("Remove one field at a time.");
  if (added.length) edits.push(insertItem(text, props, open, close, props.length, added.join(", "), s));
  return edits;
}

/** Applies non-overlapping edits (positions refer to the original text). */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Plans, applies, and checks that the result still parses before it is written. */
export function editRouteConfig(root: string, file: string, edit: RouteEdit, host: RouteConfigHost = fileHost(root)): RouteConfigResult {
  const before = host.read(file);
  const after = applyTextEdits(before, planRouteEdit(file, before, edit));
  const out = ts.transpileModule(after, { reportDiagnostics: true, fileName: file, compilerOptions: { target: ts.ScriptTarget.Latest } });
  if (out.diagnostics?.length) throw new Error(`The edit would not parse: ${ts.flattenDiagnosticMessageText(out.diagnostics[0]!.messageText, "\n")}`);
  const routes = treeOf(parse(file, after), findRouteArray(parse(file, after))!);
  host.write(file, after);
  return { file, before, after, routes };
}

