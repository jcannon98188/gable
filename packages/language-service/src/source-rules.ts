// Rules that need no template analysis and run on every source file: constructors in
// components and services, module-level state, Tailwind class fragments, and the
// tsconfig settings class fields depend on.

import ts from "@typescript/typescript6";
import type { RuleId } from "./config.js";
import type { Report } from "./file-rules.js";
import { hasModifier, isSignal, unwrap } from "./typeutil.js";

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

/** Tailwind scans source text for whole class names, so a `${}` hole glued to class text, or a built-up string in [class], is invisible to it. */
function classFragments(sf: ts.SourceFile, literal: ts.TemplateLiteral, report: Report): void {
  // The template text with each hole replaced by NUL, and where each character came from.
  let text = "";
  const origin: number[] = [];
  const holes: Array<{ start: number; length: number }> = [];
  const piece = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      text += sf.text[i];
      origin.push(i);
    }
  };
  if (ts.isNoSubstitutionTemplateLiteral(literal)) piece(literal.getStart(sf) + 1, literal.end - 1);
  else {
    piece(literal.head.getStart(sf) + 1, literal.head.end - 2);
    let holeStart = literal.head.end - 2;
    for (const span of literal.templateSpans) {
      const holeEnd = span.literal.getStart(sf) + 1;
      holes.push({ start: holeStart, length: holeEnd - holeStart });
      text += "\0";
      origin.push(holeStart);
      piece(holeEnd, span.literal.end - (ts.isTemplateTail(span.literal) ? 1 : 2));
      holeStart = span.literal.end - 2;
    }
  }
  for (const m of text.matchAll(/(?<![\w[.-])class\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const value = m[1] ?? m[2] ?? "";
    const valueAt = m.index! + m[0].length - 1 - value.length;
    for (const g of value.matchAll(/[^\s\0]\0|\0[^\s\0]/g)) {
      const nul = valueAt + g.index! + (g[0][0] === "\0" ? 0 : 1);
      const hole = holes[[...text.slice(0, nul)].filter((c) => c === "\0").length]!;
      report(hole.start, hole.length, "class-fragment", "A class name assembled from a ${} hole is invisible to Tailwind: write the full class names, or look them up from a map of literal names");
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
