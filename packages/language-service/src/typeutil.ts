import ts from "@typescript/typescript6";

export function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
}


export function findIdentifier(sf: ts.SourceFile, pos: number): ts.Identifier | undefined {
  let found: ts.Identifier | undefined;
  const visit = (node: ts.Node): void => {
    if (found || pos < node.pos || pos >= node.end) return;
    if (ts.isIdentifier(node) && node.getStart(sf) === pos) found = node;
    else ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** A signal is anything typed as (or extending) a `*Signal` interface: ReadonlySignal, WritableSignal, InputSignal... */
export function isSignal(checker: ts.TypeChecker, type: ts.Type): boolean {
  const seen = new Set<ts.Type>();
  const check = (t: ts.Type): boolean => {
    if (seen.has(t)) return false;
    seen.add(t);
    if (t.isUnion()) return t.types.some(check);
    const name = t.aliasSymbol?.name ?? t.getSymbol()?.name;
    if (name && /Signal$/.test(name)) return true;
    const target = (t.flags & ts.TypeFlags.Object && (t as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference ? (t as ts.TypeReference).target : t) as ts.Type;
    return target.isClassOrInterface() ? checker.getBaseTypes(target).some(check) : false;
  };
  return check(checker.getNonNullableType(type));
}

export function isObservableLike(checker: ts.TypeChecker, type: ts.Type): boolean {
  const t = checker.getNonNullableType(type);
  const callable = (name: string) => {
    const p = t.getProperty(name);
    return !!p && checker.getTypeOfSymbol(p).getCallSignatures().length > 0;
  };
  return callable("subscribe") || callable("then");
}

/** True when `id` is part of the callee of some call (the handler's method path), not of its arguments. */
export function inCallee(id: ts.Node): boolean {
  for (let node: ts.Node = id; node.parent && !ts.isBlock(node.parent) && !ts.isSourceFile(node.parent); node = node.parent) {
    if (ts.isCallExpression(node.parent) && node.parent.expression === node) return true;
  }
  return false;
}

