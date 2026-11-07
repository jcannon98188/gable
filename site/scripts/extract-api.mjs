// Build-time API extractor. Reads the built declarations (dist/*.d.ts) of every publishable workspace
// package through the TypeScript compiler API and writes the public API, with TSDoc, as JSON for the
// docs section (site/src/generated/api/). The JSON contract is site/src/generated/api-schema.ts.
//
//   node scripts/extract-api.mjs [--strict] [--packages <dir>] [--out <dir>]
//
// --strict exits non-zero when any public symbol has no TSDoc summary.
//
// Uses @typescript/typescript6 (the classic JS compiler API; the typescript@7 package ships only the
// native compiler), the same one the language service uses.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const KIND_ORDER = ["class", "function", "interface", "type", "const", "enum", "namespace", "variable"];

const collapse = (s) => s.replace(/\s+/g, " ").trim();
const stripDecl = (s) => s.replace(/^(?:(?:export|declare|default)\s+)+/, "");
const trimTail = (s) => s.replace(/[;,]\s*$/, "");
const posix = (p) => p.split(path.sep).join("/");

// ---------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------

/** The .d.ts a consumer's type resolution lands on for one exports-map target, or undefined. */
function declTarget(pkgDir, target) {
  if (typeof target === "string") {
    let file = target;
    if (!/\.d\.(m|c)?ts$/.test(file)) {
      if (!/\.(m|c)?js$/.test(file)) return undefined;
      file = file.replace(/\.((?:m|c)?)js$/, ".d.$1ts");
    }
    const abs = path.resolve(pkgDir, file);
    return fs.existsSync(abs) ? abs : undefined;
  }
  if (target && typeof target === "object") {
    if ("types" in target) {
      const hit = declTarget(pkgDir, target.types);
      if (hit) return hit;
    }
    for (const key of Object.keys(target)) {
      if (key === "types") continue;
      const hit = declTarget(pkgDir, target[key]);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Entry points of a package: [{ path: "@gable/core/rxjs", file: <abs .d.ts> }].
 * Returns { entries, skipped } where skipped is a reason when the package exposes no declarations.
 */
export function resolveEntryPoints(pkgDir, pkg) {
  const entries = [];
  const missing = [];
  if (pkg.exports && typeof pkg.exports === "object") {
    const map = Object.keys(pkg.exports).some((k) => k.startsWith(".")) ? pkg.exports : { ".": pkg.exports };
    for (const [key, target] of Object.entries(map)) {
      if (key === "./package.json" || key.includes("*")) continue;
      const file = declTarget(pkgDir, target);
      if (file) entries.push({ path: key === "." ? pkg.name : pkg.name + key.slice(1), file });
      else if (JSON.stringify(target).includes('"types"')) missing.push(key);
    }
  } else {
    const rel = pkg.types ?? pkg.typings ?? (pkg.main ? pkg.main.replace(/\.(c|m)?js$/, ".d.ts") : undefined);
    if (rel) {
      const abs = path.resolve(pkgDir, rel);
      if (fs.existsSync(abs)) entries.push({ path: pkg.name, file: abs });
      else missing.push(".");
    }
  }
  if (missing.length) {
    throw new Error(
      `${pkg.name}: declaration entry points not found for ${missing.join(", ")}. Build the packages first (npm run build at the repo root).`,
    );
  }
  if (!entries.length) return { entries, skipped: "no declaration entry points (no exports/types)" };
  return { entries, skipped: undefined };
}

// ---------------------------------------------------------------------------------------------
// TSDoc reading
// ---------------------------------------------------------------------------------------------

/** The node whose leading JSDoc documents `decl`. */
function docNode(decl) {
  if (ts.isVariableDeclaration(decl) && ts.isVariableDeclarationList(decl.parent) && decl.parent.parent) {
    return decl.parent.parent;
  }
  return decl;
}

function jsDocOf(decl) {
  const arr = docNode(decl).jsDoc;
  return arr && arr.length ? arr[arr.length - 1] : undefined;
}

const commentText = (c) => (c === undefined ? "" : (ts.getTextOfJSDocComment(c) ?? "")).trim();
const tagName = (t) => t.tagName.text;
const stripDash = (s) => s.replace(/^\s*-\s*/, "").trim();

/** {@link X} / {@link X|label} / {@link X label} to inline code or the label; collects targets. */
function convertLinks(text, links) {
  return text.replace(/\{@link(?:code|plain)?\s+([^}\s|]+)(?:\s*[|\s]\s*([^}]*))?\}/g, (_m, target, label) => {
    links.push(target);
    return label && label.trim() ? label.trim() : `\`${target}\``;
  });
}

/** Blank-line separated paragraphs; blank lines inside \/.test(line)) fenced = !fenced;
    if (!fenced && line.trim() === "") {
      if (cur.length) paras.push(cur.join("
").trim());
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) paras.push(cur.join("
").trim());
  return paras;
}

/** Blank-line separated paragraphs; blank lines inside ``` fences do not split. */
function splitParagraphs(text) {
  const paras = [];
  let cur = [];
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && line.trim() === "") {
      if (cur.length) paras.push(cur.join("\n").trim());
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) paras.push(cur.join("\n").trim());
  return paras;
}

function stripFences(text) {
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[0].trim() === "") lines.shift();
  if (lines.length && /^\s*```/.test(lines[0])) lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length && /^\s*```\s*$/.test(lines[lines.length - 1])) lines.pop();
  return lines.join("\n").trimEnd();
}

/** Documentation of one declaration (undefined jsDoc gives empty docs). */
function readDocs(decl) {
  const doc = jsDocOf(decl);
  const out = { summary: "", remarks: undefined, deprecated: undefined, examples: [], see: [], internal: false, tags: [] };
  if (!doc) return out;
  const links = [];
  const body = convertLinks(commentText(doc.comment), links);
  const paras = splitParagraphs(body);
  out.summary = (paras[0] ?? "").replace(/\s*\n\s*/g, " ");
  const remarks = paras.slice(1);
  for (const tag of doc.tags ?? []) {
    out.tags.push(tag);
    const name = tagName(tag);
    const text = commentText(tag.comment);
    if (name === "internal") out.internal = true;
    else if (name === "remarks") {
      const t = convertLinks(text, links);
      if (t) remarks.push(t);
    } else if (name === "deprecated") out.deprecated = convertLinks(text, links) || "Deprecated.";
    else if (name === "example") {
      const code = stripFences(text);
      if (code) out.examples.push(code);
    } else if (name === "see") {
      const l = [];
      const full = (tag.name ? tag.name.getText() + " " : "") + text;
      const stripped = convertLinks(full, l);
      if (l.length) links.push(...l);
      else if (stripped.trim()) links.push(stripped.trim());
    }
  }
  if (remarks.length) out.remarks = remarks.join("\n\n");
  out.see = [...new Set(links)];
  return out;
}

function paramDocs(param) {
  const tags = ts.getJSDocParameterTags(param);
  return tags.length ? convertLinks(stripDash(commentText(tags[0].comment)), []) : "";
}

// ---------------------------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------------------------

function nodeText(node, sf) {
  return node.getText(sf);
}

/** Declaration text without its body, modifiers `export`/`declare`, and trailing `;`. */
function plainText(node, sf) {
  const end = node.body ? node.body.getStart(sf) : node.end;
  return trimTail(stripDecl(sf.text.slice(node.getStart(sf), end).trim()));
}

/** Header (everything before the member block) of a class/interface/enum/namespace. */
function headerText(node, sf) {
  const start = node.getStart(sf);
  let end;
  if (ts.isModuleDeclaration(node)) end = node.body ? node.body.getStart(sf) : node.end;
  else end = node.members.pos - 1;
  return collapse(stripDecl(sf.text.slice(start, end).trim()));
}

/** Multi-line text: collapse to one line when short enough, else dedent and keep the lines. */
function fit(text, max = 240) {
  const one = collapse(text);
  if (one.length <= max) return one;
  const lines = text.split(/\r?\n/);
  const indents = lines.slice(1).filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return [lines[0].trim(), ...lines.slice(1).map((l) => l.slice(cut).trimEnd())].join("\n");
}

function isPrivateMember(node) {
  if (node.name && ts.isPrivateIdentifier(node.name)) return true;
  const flags = ts.getCombinedModifierFlags(node);
  return (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0;
}

function paramList(checker, decl, sf) {
  const params = decl.parameters;
  if (!params) return undefined;
  return params.map((p) => ({
    name: nodeText(p.name, sf),
    type: p.type ? collapse(nodeText(p.type, sf)) : collapse(checker.typeToString(checker.getTypeAtLocation(p))),
    description: paramDocs(p),
    optional: !!p.questionToken || !!p.initializer,
  }));
}

function returnInfo(checker, decl, sf, docs) {
  let type;
  if (decl.type) type = collapse(nodeText(decl.type, sf));
  else {
    const sig = checker.getSignatureFromDeclaration(decl);
    type = sig ? collapse(checker.typeToString(sig.getReturnType())) : "unknown";
  }
  const tag = docs.tags.find((t) => ["returns", "return"].includes(tagName(t)));
  return { type, description: tag ? convertLinks(stripDash(commentText(tag.comment)), []) : "" };
}

function typeParamList(decl, sf, docs) {
  if (!decl.typeParameters) return undefined;
  const described = new Map();
  for (const t of docs.tags) {
    const n = tagName(t);
    if (n === "template" && t.typeParameters) {
      for (const tp of t.typeParameters) described.set(tp.name.text, stripDash(commentText(t.comment)));
    } else if (n === "typeParam" || n === "typeparam") {
      const m = commentText(t.comment).match(/^(\w+)\s*-?\s*([\s\S]*)$/);
      if (m) described.set(m[1], m[2].trim());
    }
  }
  return decl.typeParameters.map((tp) => ({
    name: tp.name.text,
    ...(tp.constraint ? { constraint: collapse(nodeText(tp.constraint, sf)) } : {}),
    description: described.get(tp.name.text) ?? "",
  }));
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

function memberKind(node) {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return "method";
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return "accessor";
  if (ts.isIndexSignatureDeclaration(node)) return "index";
  if (ts.isCallSignatureDeclaration(node) || ts.isConstructSignatureDeclaration(node)) return "call";
  if (ts.isEnumMember(node)) return "enum-member";
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) return "property";
  return undefined;
}

function memberName(node, sf) {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isIndexSignatureDeclaration(node)) return "[index]";
  if (ts.isConstructSignatureDeclaration(node)) return "new";
  if (ts.isCallSignatureDeclaration(node)) return "()";
  return nodeText(node.name, sf);
}

function memberSignature(node, sf) {
  let text = plainText(node, sf);
  text = text.replace(/^(?:(?:public|declare)\s+)+/, "");
  return fit(text);
}

/** Describe the members of one container node (class/interface/enum/type literal members). */
function memberNodes(decl) {
  if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl) || ts.isEnumDeclaration(decl)) return [...decl.members];
  return [];
}

function describeMembers(checker, decls) {
  const groups = new Map(); // key -> { kind, name, nodes: [{node, sf}] }
  const order = [];
  const add = (key, entry) => {
    const g = groups.get(key);
    if (g) g.nodes.push(entry);
    else {
      groups.set(key, { nodes: [entry] });
      order.push(key);
    }
  };
  for (const decl of decls) {
    const sf = decl.getSourceFile();
    for (const node of memberNodes(decl)) {
      const kind = memberKind(node);
      if (!kind || isPrivateMember(node)) continue;
      const statik = (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Static) !== 0;
      const name = memberName(node, sf);
      const k = kind === "method" || kind === "accessor" || kind === "call" || kind === "constructor" ? kind : `${kind}#${order.length}`;
      add(`${k}:${statik ? "s" : "i"}:${name}`, { node, sf, kind, name, statik });
    }
  }
  const members = [];
  for (const key of order) {
    const { nodes } = groups.get(key);
    const { kind, name, statik } = nodes[0];
    const docs = nodes.map((n) => readDocs(n.node)).filter((d) => !d.internal || false);
    if (nodes.some((n) => readDocs(n.node).internal)) continue;
    const documented = nodes.map((n) => readDocs(n.node)).find((d) => d.summary) ?? readDocs(nodes[0].node);
    void docs;
    const first = nodes[0];
    const readonly =
      kind === "accessor"
        ? !nodes.some((n) => ts.isSetAccessorDeclaration(n.node))
        : (ts.getCombinedModifierFlags(first.node) & ts.ModifierFlags.Readonly) !== 0;
    const sigs = [...new Set(nodes.map((n) => memberSignature(n.node, n.sf)))];
    const member = {
      name,
      kind,
      signature: sigs.join("\n"),
      summary: documented.summary,
      optional: !!first.node.questionToken,
      readonly,
      static: statik,
    };
    if (documented.deprecated !== undefined) member.deprecated = documented.deprecated;
    const callable = nodes.find((n) => n.node.parameters && kind !== "accessor");
    if (callable) {
      member.params = paramList(checker, callable.node, callable.sf);
      if (kind !== "constructor" && kind !== "index") member.returns = returnInfo(checker, callable.node, callable.sf, readDocs(callable.node));
    }
    members.push(member);
  }
  return members;
}

/** Namespace members: the namespace's own exports, described as method/property members. */
function describeNamespaceMembers(checker, symbol, entryOf) {
  const out = [];
  for (const exp of checker.getExportsOfModule(symbol)) {
    const sym = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
    const decls = sym.declarations ?? [];
    if (!decls.length) continue;
    const info = describeSymbol(checker, exp.getName(), sym, entryOf, { shallow: true });
    if (!info) continue;
    out.push({
      name: info.name,
      kind: info.kind === "function" ? "method" : "property",
      signature: info.signature,
      summary: info.summary,
      optional: false,
      readonly: info.kind === "const",
      static: false,
      ...(info.deprecated !== undefined ? { deprecated: info.deprecated } : {}),
      ...(info.params ? { params: info.params } : {}),
      ...(info.returns ? { returns: info.returns } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------------------------

function kindOf(symbol) {
  const f = symbol.flags;
  const decls = symbol.declarations ?? [];
  if (f & ts.SymbolFlags.Class) return "class";
  if (f & ts.SymbolFlags.Enum) return "enum";
  if (f & ts.SymbolFlags.Function) return "function";
  if (f & ts.SymbolFlags.Interface) return f & ts.SymbolFlags.Variable ? "const" : "interface";
  if (f & ts.SymbolFlags.TypeAlias) return f & ts.SymbolFlags.Variable ? "const" : "type";
  if (f & ts.SymbolFlags.Variable) {
    const decl = decls.find((d) => ts.isVariableDeclaration(d));
    const isConst = decl && ts.isVariableDeclarationList(decl.parent) && (decl.parent.flags & ts.NodeFlags.Const) !== 0;
    return isConst ? "const" : "variable";
  }
  if (f & ts.SymbolFlags.Module) return "namespace";
  return undefined;
}

function sourceFileOf(decl) {
  let file = decl.getSourceFile().fileName;
  try {
    file = fs.realpathSync(file);
  } catch {
    /* keep as is */
  }
  const rel = posix(path.relative(repoRoot, file));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
  const m = rel.match(/^(packages\/[^/]+)\/dist\/(.+)\.d\.(?:m|c)?ts$/);
  if (m) {
    for (const ext of [".ts", ".tsx"]) {
      const cand = `${m[1]}/src/${m[2]}${ext}`;
      if (fs.existsSync(path.join(repoRoot, cand))) return cand;
    }
    return undefined;
  }
  return rel.includes("node_modules/") ? undefined : rel;
}

/**
 * Build the ApiSymbol (without id/see resolution) for a resolved symbol.
 * Returns undefined for @internal symbols and for symbols that carry no declaration.
 */
function describeSymbol(checker, name, symbol, entryOf, options = {}) {
  const kind = kindOf(symbol);
  const decls = symbol.declarations ?? [];
  if (!kind || !decls.length) return undefined;

  const byFlag = (pred) => decls.filter(pred);
  const funcs = byFlag((d) => ts.isFunctionDeclaration(d));
  const classes = byFlag((d) => ts.isClassDeclaration(d));
  const ifaces = byFlag((d) => ts.isInterfaceDeclaration(d));
  const aliases = byFlag((d) => ts.isTypeAliasDeclaration(d));
  const enums = byFlag((d) => ts.isEnumDeclaration(d));
  const vars = byFlag((d) => ts.isVariableDeclaration(d));
  const mods = byFlag((d) => ts.isModuleDeclaration(d));

  const primary =
    { class: classes, function: funcs, interface: ifaces, type: aliases, enum: enums, const: vars, variable: vars, namespace: mods }[kind];
  const mainDecls = primary.length ? primary : decls;
  const docDecl = [...mainDecls, ...decls].find((d) => readDocs(d).summary) ?? mainDecls[0];
  const docs = readDocs(docDecl);
  if (decls.some((d) => readDocs(d).internal)) return undefined;

  const sfOf = (d) => d.getSourceFile();
  // A type re-exported from a third-party package cannot carry our TSDoc: say where it comes from instead of listing it as a gap.
  if (!docs.summary) {
    const posix = (d) => sfOf(d).fileName.replace(/\\/g, "/");
    const external = decls.length > 0 && decls.every((d) => posix(d).includes("/node_modules/"));
    const origin = external ? /\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(posix(decls[0]))?.[1] : undefined;
    if (origin) docs.summary = `Re-exported from \`${origin}\`.`;
  }
  let signature;
  switch (kind) {
    case "function":
      signature = [...new Set(funcs.map((d) => fit(plainText(d, sfOf(d)))))].join("\n");
      break;
    case "class":
    case "interface":
    case "enum":
    case "namespace": {
      const heads = [...mainDecls, ...decls.filter((d) => !mainDecls.includes(d) && !ts.isVariableDeclaration(d) && !ts.isFunctionDeclaration(d))];
      signature = [...new Set(heads.map((d) => (ts.isSourceFile(d) ? `namespace ${name}` : ts.isTypeAliasDeclaration(d) ? fit(plainText(d, sfOf(d))) : headerText(d, sfOf(d)))))].join("\n");
      break;
    }
    case "type":
      signature = fit(plainText(aliases[0], sfOf(aliases[0])));
      break;
    default: {
      const d = vars[0];
      const list = d.parent;
      const kw = ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Const ? "const" : ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Let ? "let" : "var";
      signature = `${kw} ${fit(nodeText(d, sfOf(d)))}`;
      // Declaration-merged `const X` + `interface X`: show the type side too.
      for (const extra of [...ifaces, ...aliases]) {
        signature += "\n" + (ts.isTypeAliasDeclaration(extra) ? fit(plainText(extra, sfOf(extra))) : headerText(extra, sfOf(extra)));
      }
    }
  }

  const sym = {
    id: "",
    name,
    kind,
    signature,
    summary: docs.summary,
    ...(docs.remarks ? { remarks: docs.remarks } : {}),
    ...(docs.deprecated !== undefined ? { deprecated: docs.deprecated } : {}),
    examples: docs.examples,
  };

  // params / returns: functions (first overload that has them), or const with a function type.
  const callDecl = kind === "function" ? funcs[0] : kind === "const" || kind === "variable" ? (vars[0].type && ts.isFunctionTypeNode(vars[0].type) ? vars[0].type : undefined) : undefined;
  if (callDecl) {
    const sf = sfOf(callDecl);
    const callDocs = kind === "function" ? readDocs(funcs.find((f) => readDocs(f).summary || readDocs(f).tags.length) ?? funcs[0]) : docs;
    const withDocs = kind === "function" ? funcs.find((f) => ts.getJSDocParameterTags(f.parameters[0] ?? f).length) : undefined;
    sym.params = paramList(checker, withDocs ?? callDecl, sf);
    sym.returns = returnInfo(checker, callDecl, sf, callDocs);
    if (!sym.returns.description) sym.returns = { ...sym.returns, description: "" };
  }

  // type parameters from the first declaration that has any
  const tpDecl = [...mainDecls, ...decls].find((d) => d.typeParameters && d.typeParameters.length);
  if (tpDecl) {
    const tps = typeParamList(tpDecl, sfOf(tpDecl), readDocs(tpDecl));
    if (tps) sym.typeParams = tps;
  }

  // heritage
  const ext = new Set();
  const impl = new Set();
  for (const d of decls) {
    for (const clause of d.heritageClauses ?? []) {
      const target = clause.token === ts.SyntaxKind.ImplementsKeyword ? impl : ext;
      for (const t of clause.types) target.add(collapse(nodeText(t, sfOf(d))));
    }
  }
  if (ext.size) sym.extends = [...ext];
  if (impl.size) sym.implements = [...impl];

  if (!options.shallow) {
    // members
    const memberDecls = decls.filter((d) => ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d) || ts.isEnumDeclaration(d));
    let members = memberDecls.length ? describeMembers(checker, memberDecls) : [];
    if (kind === "namespace" || mods.length) {
      const ns = describeNamespaceMembers(checker, symbol, entryOf);
      members = members.concat(ns);
    }
    if (members.length) sym.members = members;
  }

  // see (raw link targets, resolved later)
  if (docs.see.length) sym.see = docs.see;
  const src = sourceFileOf(mainDecls[0]);
  if (src) sym.sourceFile = src;
  return sym;
}

function compareSymbols(a, b) {
  const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (k) return k;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** Resolve see targets against the package's exported names; unresolved ones stay as text. */
function resolveSee(entryPoints) {
  const byEntry = new Map();
  const any = new Map();
  for (const ep of entryPoints) {
    const names = new Set(ep.symbols.map((s) => s.name));
    byEntry.set(ep.path, names);
    for (const n of names) if (!any.has(n)) any.set(n, `${ep.path}#${n}`);
  }
  for (const ep of entryPoints) {
    for (const s of ep.symbols) {
      if (!s.see) continue;
      s.see = [
        ...new Set(
          s.see.map((t) => {
            const head = t.split(/[.#(]/)[0];
            if (byEntry.get(ep.path).has(head)) return `${ep.path}#${head}`;
            return any.get(head) ?? t;
          }),
        ),
      ];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Package extraction
// ---------------------------------------------------------------------------------------------

/**
 * Packages that are applications, not libraries: nothing imports them, so there is no API to document. Skipped on
 * purpose, with the reason shown in the summary. A package that merely forgot its `exports` map is not listed
 * here; it is reported as skipped with the generic "no exports/types" reason so the omission stays visible.
 */
export const SKIP = {
  "@gable/designer":
    "application, not a library: a private CLI (gable-designer), Tauri shell and dev-only preview agent with no entry module and no importers",
  "@gable/devtools-extension": "application, not a library: a Manifest V3 browser extension bundle",
  "gable-vscode": "application, not a library: a VS Code extension (TypeScript server plugin and grammar)",
};

/**
 * Extract one package. Returns { skipped } or { api }.
 * @param {string} pkgDir absolute package directory
 */
export function extractPackage(pkgDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  if (Object.hasOwn(SKIP, pkg.name)) return { name: pkg.name, skipped: SKIP[pkg.name] };
  const { entries, skipped } = resolveEntryPoints(pkgDir, pkg);
  if (skipped) return { name: pkg.name, skipped };

  const program = ts.createProgram({
    rootNames: entries.map((e) => e.file),
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      noEmit: true,
      types: [],
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    },
  });
  const checker = program.getTypeChecker();

  const entryPoints = entries.map((entry) => {
    const sf = program.getSourceFile(entry.file);
    const moduleSymbol = sf && checker.getSymbolAtLocation(sf);
    const symbols = [];
    if (moduleSymbol) {
      for (const exp of checker.getExportsOfModule(moduleSymbol)) {
        const target = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
        const name = exp.getName();
        const sym = describeSymbol(checker, name, target, null);
        if (!sym) continue;
        sym.id = `${entry.path}#${name}`;
        symbols.push(sym);
      }
    }
    symbols.sort(compareSymbols);
    return { path: entry.path, symbols };
  });
  resolveSee(entryPoints);

  return {
    name: pkg.name,
    api: {
      name: pkg.name,
      slug: pkg.name.replace(/^@[^/]+\//, ""),
      version: pkg.version ?? "0.0.0",
      description: pkg.description ?? "",
      entryPoints,
    },
  };
}

export function buildIndex(apis) {
  return {
    packages: apis.map((api) => {
      const all = api.entryPoints.flatMap((e) => e.symbols);
      return {
        name: api.name,
        slug: api.slug,
        version: api.version,
        description: api.description,
        entryPoints: api.entryPoints.map((e) => e.path),
        symbolCount: all.length,
        undocumentedCount: all.filter((s) => !s.summary).length,
      };
    }),
  };
}

/** Workspace package directories under packagesDir, in name order. */
export function listPackageDirs(packagesDir) {
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(packagesDir, d.name, "package.json")))
    .map((d) => path.join(packagesDir, d.name))
    .sort();
}

/** Extract every package, write <out>/<slug>.json and <out>/index.json. Returns the report. */
export function run({ packagesDir, outDir, log = console.log }) {
  const apis = [];
  const skipped = [];
  for (const dir of listPackageDirs(packagesDir)) {
    const result = extractPackage(dir);
    if (result.skipped) skipped.push({ name: result.name, reason: result.skipped });
    else apis.push(result.api);
  }
  apis.sort((a, b) => (a.slug < b.slug ? -1 : 1));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const api of apis) fs.writeFileSync(path.join(outDir, `${api.slug}.json`), JSON.stringify(api, null, 2) + "\n");
  const index = buildIndex(apis);
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");

  const undocumented = apis.flatMap((api) =>
    api.entryPoints.flatMap((e) => e.symbols.filter((s) => !s.summary).map((s) => s.id)),
  );
  const rows = index.packages.map((p) => [p.name, String(p.entryPoints.length), String(p.symbolCount), String(p.undocumentedCount)]);
  const head = ["package", "entries", "symbols", "undocumented"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (r) => r.map((c, i) => (i ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join("  ");
  log("API extraction summary");
  log(fmt(head));
  for (const r of rows) log(fmt(r));
  for (const s of skipped) log(`skipped ${s.name}: ${s.reason}`);
  return { index, skipped, undocumented };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const opt = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i >= 0 ? path.resolve(args[i + 1]) : fallback;
  };
  const strict = args.includes("--strict");
  const { undocumented } = run({
    packagesDir: opt("--packages", path.join(repoRoot, "packages")),
    outDir: opt("--out", path.resolve(here, "..", "src", "generated", "api")),
  });
  if (undocumented.length) {
    console.log(`${undocumented.length} public symbol(s) without a TSDoc summary${strict ? "" : " (pass --strict to fail)"}.`);
    if (strict) {
      for (const id of undocumented) console.log(`  ${id}`);
      process.exit(1);
    }
  }
}
