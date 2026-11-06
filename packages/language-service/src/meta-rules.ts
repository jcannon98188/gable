// The `component-meta` rule: TypeScript cannot put a type on a class's static side without a
// base class or decorator, so `static meta = { ... }` is checked here against ComponentMeta
// (@gable/core). Reports unknown keys, mistyped values, `imports` entries that are not
// components or lazy() entries, and a missing selector. A meta that already carries a type
// (an annotation, or `satisfies`/`as` ComponentMeta) is left to the compiler.

import ts from "@typescript/typescript6";
import { ensureImport, type Fix } from "./fixes.js";
import { closest, hasModifier } from "./typeutil.js";

export type MetaReport = (start: number, length: number, message: string, fixes?: Fix[]) => void;

const checkers = new WeakMap<ts.TypeChecker, ts.Type | null>();

/** The ComponentMeta interface of the @gable/core in the program, when the program has one. */
function componentMetaType(checker: ts.TypeChecker, program: ts.Program): ts.Type | null {
  let type = checkers.get(checker);
  if (type !== undefined) return type;
  type = null;
  for (const file of program.getSourceFiles()) {
    if (!/[\\/]component\.(d\.)?ts$/.test(file.fileName)) continue;
    const symbol = checker.getSymbolAtLocation(file);
    const meta = symbol && checker.getExportsOfModule(symbol).find((e) => e.name === "ComponentMeta");
    if (meta) {
      type = checker.getDeclaredTypeOfSymbol(meta);
      break;
    }
  }
  checkers.set(checker, type);
  return type;
}

/** Whether the initializer already names a type for the compiler to enforce. */
const alreadyTyped = (init: ts.Expression): boolean => {
  let node = init;
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    if (ts.isSatisfiesExpression(node) || (ts.isAsExpression(node) && !ts.isConstTypeReference(node.type))) return true;
    node = node.expression;
  }
  return false;
};

export function componentMetaRules(sf: ts.SourceFile, checker: ts.TypeChecker, program: ts.Program, report: MetaReport): void {
  let metaType: ts.Type | null | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (!ts.isPropertyDeclaration(member) || !member.initializer || member.type) continue;
        if (!ts.isIdentifier(member.name) || member.name.text !== "meta" || !hasModifier(member, ts.SyntaxKind.StaticKeyword)) continue;
        if (alreadyTyped(member.initializer)) continue;
        if (metaType === undefined) metaType = componentMetaType(checker, program);
        if (metaType) checkMeta(sf, checker, metaType, member, member.initializer, report);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function checkMeta(sf: ts.SourceFile, checker: ts.TypeChecker, metaType: ts.Type, member: ts.PropertyDeclaration, init: ts.Expression, report: MetaReport): void {
  const satisfies = (): Fix => {
    const imported = ensureImport(sf.fileName, sf, "ComponentMeta", "@gable/core", true);
    return {
      title: "Add 'satisfies ComponentMeta'",
      edits: [...(imported.edit ? [imported.edit] : []), { file: sf.fileName, start: init.end, length: 0, newText: ` satisfies ${imported.local}` }],
    };
  };
  const className = ts.isClassDeclaration(member.parent) ? (member.parent.name?.text ?? "This class") : "This class";
  const declared = (name: string) => {
    const prop = metaType.getProperty(name);
    return prop && checker.getTypeOfSymbol(prop);
  };

  let literal: ts.Expression = init;
  while (ts.isParenthesizedExpression(literal) || ts.isAsExpression(literal)) literal = literal.expression;

  if (!ts.isObjectLiteralExpression(literal)) {
    // `static meta = shared`: judge the whole value.
    const type = checker.getTypeAtLocation(init);
    if (!(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) && !checker.isTypeAssignableTo(type, metaType)) {
      report(init.getStart(sf), Math.max(1, init.getWidth(sf)), `${className}.meta is not a valid ComponentMeta: ${checker.typeToString(type)} is not assignable to ComponentMeta`, [satisfies()]);
    }
    return;
  }

  const hasSpread = literal.properties.some(ts.isSpreadAssignment);
  const keys = new Set<string>();
  let unknownKey = false;
  for (const prop of literal.properties) {
    if (ts.isSpreadAssignment(prop) || !prop.name || ts.isComputedPropertyName(prop.name)) continue;
    const name = ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name) ? prop.name.text : undefined;
    if (name === undefined) continue;
    keys.add(name);
    const target = declared(name);
    if (!target) {
      unknownKey = true;
      const hint = closest(name, metaType.getProperties().map((p) => p.name));
      const fixes = [satisfies()];
      if (hint && ts.isPropertyAssignment(prop)) {
        fixes.push({ title: `Change spelling to '${hint}'`, edits: [{ file: sf.fileName, start: prop.name.getStart(sf), length: prop.name.getWidth(sf), newText: ts.isIdentifier(prop.name) ? hint : JSON.stringify(hint) }] });
      }
      report(prop.name.getStart(sf), Math.max(1, prop.name.getWidth(sf)), `Unknown key "${name}" in ${className}.meta${hint ? `. Did you mean "${hint}"?` : ""} (ComponentMeta keys: ${metaType.getProperties().map((p) => p.name).join(", ")})`, fixes);
      continue;
    }
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
    const value = ts.isPropertyAssignment(prop) ? prop.initializer : prop.name;
    if (name === "imports" && ts.isPropertyAssignment(prop)) {
      if (checkImports(sf, checker, target, prop.initializer, className, report, satisfies)) continue;
    }
    const type = checker.getTypeAtLocation(value);
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown) || checker.isTypeAssignableTo(type, target)) continue;
    report(value.getStart(sf), Math.max(1, value.getWidth(sf)), `${className}.meta.${name} has the wrong type: ${checker.typeToString(type)} is not assignable to ${checker.typeToString(checker.getNonNullableType(target))}`, [satisfies()]);
  }
  if (!hasSpread && !unknownKey && !keys.has("selector")) {
    report(member.name.getStart(sf), member.name.getWidth(sf), `${className}.meta has no "selector"`, [satisfies()]);
  }
}

/**
 * Checks each `imports` array element on its own, so the report lands on the offending entry.
 * Returns whether it handled the value (an array literal); other shapes fall back to the whole-value check.
 */
function checkImports(sf: ts.SourceFile, checker: ts.TypeChecker, target: ts.Type, value: ts.Expression, className: string, report: MetaReport, satisfies: () => Fix): boolean {
  let list = value;
  while (ts.isParenthesizedExpression(list) || ts.isAsExpression(list) || ts.isSatisfiesExpression(list)) list = list.expression;
  if (!ts.isArrayLiteralExpression(list)) return false;
  const element = checker.getNonNullableType(target).getNumberIndexType();
  if (!element) return false;
  for (const entry of list.elements) {
    if (ts.isSpreadElement(entry) || ts.isOmittedExpression(entry)) continue;
    const type = checker.getTypeAtLocation(entry);
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown) || checker.isTypeAssignableTo(type, element)) continue;
    report(entry.getStart(sf), Math.max(1, entry.getWidth(sf)), `${className}.meta.imports entry ${entry.getText(sf)} is not a component or a lazy() entry: a component is a class with a static meta and no constructor arguments`, [satisfies()]);
  }
  return true;
}
