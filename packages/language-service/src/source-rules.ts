// Rules that need no template analysis and run on every source file: constructors in
// components and services, module-level state, Tailwind class fragments, and the
// tsconfig settings class fields depend on.

import ts from "@typescript/typescript6";
import type { RuleId } from "./config.js";
import type { Report } from "./file-rules.js";
import { hasModifier, isSignal, isStoreType, unwrap } from "./typeutil.js";

const staticMember = (cls: ts.ClassDeclaration, name: string) =>
  cls.members.some((m) => ts.isPropertyDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === name && hasModifier(m, ts.SyntaxKind.StaticKeyword));

/** Subjects are anything with a callable `next` and `subscribe`. */
function isSubject(checker: ts.TypeChecker, type: ts.Type): boolean {
  const callable = (name: string) => {
    const p = type.getProperty(name);
    return !!p && checker.getTypeOfSymbol(p).getCallSignatures().length > 0;
  };
  return callable("next") && callable("subscribe");
}

export function sourceRules(sf: ts.SourceFile, checker: ts.TypeChecker, templateTag: string, report: Report): void {
  const visit = (node: ts.Node): void => {
    // Setup is field initialisers only: a constructor in a component (static meta) or service (static scope) breaks that.
    if (ts.isClassDeclaration(node) && (staticMember(node, "meta") || staticMember(node, "scope"))) {
      for (const member of node.members) {
        if (ts.isConstructorDeclaration(member)) {
          report(member.getStart(sf), "constructor".length, "constructor-in-class", `${node.name?.text ?? "This class"} is a component or service: Setup is field initialisers only, so move the constructor body into field initialisers`);
        }
      }
    }
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === templateTag) classFragments(sf, node.template, report);
    if (ts.isCallExpression(node)) reservedStateKey(sf, checker, node, report);
    if (ts.isCallExpression(node) && isCoreCall(checker, node, "injectHost") && !inSetup(node)) {
      report(node.getStart(sf), node.getWidth(sf), "inject-host-context", "injectHost() only works during Setup: call it in a field initialiser (or a helper those call), not at module level, in a method or in a callback");
    }
    if (ts.isNewExpression(node) && !inSetup(node) && isStoreType(checker, checker.getTypeAtLocation(node))) {
      report(node.getStart(sf), node.getWidth(sf), "store-outside-injection-context", "A store runs its factories in the injection context: get it with inject(Store) in Setup, or list it in providers, instead of constructing it with new here");
    }
    if (ts.isCallExpression(node)) storeWrite(sf, checker, node, report);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Module-level state resets whenever the module is hot-updated, unless it lives behind hotState().
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      const init = decl.initializer && unwrap(decl.initializer);
      if (!init || !ts.isIdentifier(decl.name)) continue;
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "hotState") continue;
      const type = checker.getTypeAtLocation(decl.name);
      const kind = isSignal(checker, type) ? "signal" : isSubject(checker, type) ? "subject" : undefined;
      if (kind) {
        const name = decl.name.text;
        report(decl.name.getStart(sf), name.length, "module-level-state", `Module-level ${kind} "${name}" resets when this module is hot-updated. Move it into a service, or keep it across edits: hotState(import.meta, "${name}", () => ...)`);
      }
    }
  }
}

/**
 * Tailwind scans source text for whole class names, so a string joined with `+` inside `[class]` is invisible to it.
 * (A `${}` hole in a template is a template-syntax error, so holes are no longer checked here.)
 */
function classFragments(sf: ts.SourceFile, literal: ts.TemplateLiteral, report: Report): void {
  // The template text, and where each character came from; a hole is one blank.
  let text = "";
  const origin: number[] = [];
  const piece = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      text += sf.text[i];
      origin.push(i);
    }
  };
  if (ts.isNoSubstitutionTemplateLiteral(literal)) piece(literal.getStart(sf) + 1, literal.end - 1);
  else {
    piece(literal.head.getStart(sf) + 1, literal.head.end - 2);
    for (const span of literal.templateSpans) {
      text += " "; // a hole is blank; it cannot be part of a class name
      origin.push(span.literal.getStart(sf));
      piece(span.literal.getStart(sf) + 1, span.literal.end - (ts.isTemplateTail(span.literal) ? 1 : 2));
    }
  }
  for (const m of text.matchAll(/\[class\]\s*=\s*"([^"]*)"/g)) {
    const value = m[1]!;
    const valueAt = m.index! + m[0].length - 1 - value.length;
    const plus = /'[^']*'\s*\+|\+\s*'[^']*'/.exec(value);
    if (plus) {
      report(origin[valueAt + value.indexOf("+", plus.index)]!, 1, "class-fragment", "A class name built by joining strings is invisible to Tailwind: bind a computed signal that picks from full literal class names");
    }
  }
}

/** Settings in the tsconfig that stop `static meta` and field initialisers from behaving as native class fields. */
export function projectRules(options: ts.CompilerOptions, report: (file: string, start: number, length: number, rule: RuleId, message: string) => void): void {
  const file = options.configFilePath as string | undefined;
  if (!file) return;
  const text = ts.sys.readFile(file) ?? "";
  const at = (key: string) => {
    const i = text.indexOf(`"${key}"`);
    return i < 0 ? { start: 0, length: 1 } : { start: i, length: key.length + 2 };
  };
  const define = options.useDefineForClassFields;
  if (define === false) {
    const { start, length } = at("useDefineForClassFields");
    report(file, start, length, "class-fields-config", "useDefineForClassFields is false, but Gable's Setup relies on native class fields: remove it, or set it to true");
  } else if (define === undefined && options.target !== undefined && options.target < ts.ScriptTarget.ES2022) {
    const { start, length } = at("target");
    report(file, start, length, "class-fields-config", "target is below ES2022, so class fields are compiled down: use ES2022 or newer, or set useDefineForClassFields to true");
  }
}

/** `form(model)` where the model has a key called `state`, which the form reserves for per-field state. */
function reservedStateKey(sf: ts.SourceFile, checker: ts.TypeChecker, call: ts.CallExpression, report: Report): void {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "form" || !call.arguments[0]) return;
  let symbol = checker.getSymbolAtLocation(call.expression);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  if (!symbol?.declarations?.some((d) => /forms/.test(d.getSourceFile().fileName))) return;
  const argument = call.arguments[0];
  const read = checker.getTypeAtLocation(argument).getCallSignatures()[0];
  if (!read) return;
  const seen = new Set<ts.Type>();
  const visit = (type: ts.Type, depth: number): void => {
    if (seen.has(type) || depth > 6 || !(type.flags & ts.TypeFlags.Object) || type.getCallSignatures().length) return;
    seen.add(type);
    if (type.symbol?.name === "Array") {
      const [element] = checker.getTypeArguments(type as ts.TypeReference);
      if (element) visit(element, depth + 1);
      return;
    }
    if (type.symbol?.declarations?.some((d) => d.getSourceFile().hasNoDefaultLib)) return;
    for (const prop of type.getProperties()) {
      if (prop.name === "state") {
        const decl = prop.declarations?.find((d) => d.getSourceFile() === sf);
        const at = (decl && ts.getNameOfDeclaration(decl)) ?? argument;
        report(at.getStart(sf), Math.max(1, at.getWidth(sf)), "model-key-state", 'A form model cannot have a key named "state": form fields keep their state (errors, touched, ...) under that name, e.g. form.email.state.errors()');
      } else visit(checker.getTypeOfSymbol(prop), depth + 1);
    }
  };
  visit(read.getReturnType(), 0);
}

/** Whether `call` is a call to the named export of @gable/core (under any import alias). */
function isCoreCall(checker: ts.TypeChecker, call: ts.CallExpression, name: string): boolean {
  if (!ts.isIdentifier(call.expression)) return false;
  const symbol = checker.getSymbolAtLocation(call.expression);
  return !!symbol?.declarations?.some(
    (d) => ts.isImportSpecifier(d) && (d.propertyName ?? d.name).text === name && ts.isStringLiteral(d.parent.parent.parent.moduleSpecifier) && /^@gable\/core(\/|$)/.test(d.parent.parent.parent.moduleSpecifier.text),
  );
}

/** Setup is a non-static field initialiser. A plain function may be a helper called from one, so it passes; methods, constructors, accessors, callbacks stored in fields and module level do not. */
function inSetup(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isPropertyDeclaration(n)) return !hasModifier(n, ts.SyntaxKind.StaticKeyword);
    if (ts.isClassStaticBlockDeclaration(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isAccessor(n)) return false;
    if (ts.isFunctionDeclaration(n)) return true;
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      // A function stored in a field (a handler) runs later, outside Setup; any other function may be a Setup helper.
      if (n.parent && ts.isPropertyDeclaration(n.parent) && n.parent.initializer === n) return false;
      return true;
    }
  }
  return false;
}

/** `store[STATE_SOURCE].set(...)`: state is written with patchState(), which is the only write path. */
function storeWrite(sf: ts.SourceFile, checker: ts.TypeChecker, call: ts.CallExpression, report: Report): void {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee) || !/^(set|update)$/.test(callee.name.text)) return;
  const receiver = unwrap(callee.expression);
  if (!ts.isElementAccessExpression(receiver) || !ts.isIdentifier(receiver.argumentExpression)) return;
  const symbol = checker.getSymbolAtLocation(receiver.argumentExpression);
  const declared = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (declared?.name !== "STATE_SOURCE") return;
  report(call.getStart(sf), call.getWidth(sf), "store-write-outside-patch", "Store state is written with patchState(store, ...), not through its state source: patchState merges updaters in one write and is the only supported path");
}
