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


export function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === kind);
}

/** The object literal of a class's `static meta = { ... }`, when it has one. */
export function metaObject(cls: ts.ClassDeclaration): ts.ObjectLiteralExpression | undefined {
  for (const member of cls.members) {
    if (!ts.isPropertyDeclaration(member) || !member.initializer || !ts.isIdentifier(member.name) || member.name.text !== "meta") continue;
    if (!hasModifier(member, ts.SyntaxKind.StaticKeyword)) continue;
    const meta = unwrap(member.initializer);
    if (ts.isObjectLiteralExpression(meta)) return meta;
  }
  return undefined;
}

/** The initializer of a property of an object literal (`selector`, `imports`, ...). */
export function metaProperty(meta: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const prop of meta.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === name) return prop.initializer;
  }
  return undefined;
}

/** A component class's literal `selector`, when it has one. */
export function literalSelector(cls: ts.ClassDeclaration): string | undefined {
  const meta = metaObject(cls);
  const selector = meta && metaProperty(meta, "selector");
  return selector && ts.isStringLiteralLike(selector) ? selector.text : undefined;
}

/** Follows import aliases to the class declaration a name refers to. */
export function classOf(checker: ts.TypeChecker, node: ts.Node): ts.ClassDeclaration | undefined {
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return symbol?.declarations?.find(ts.isClassDeclaration);
}

/** A form field: a writable signal with a `state` namespace (see @gable/core/forms). */
export function isFieldType(checker: ts.TypeChecker, type: ts.Type): boolean {
  const t = checker.getNonNullableType(type);
  const state = t.getProperty("state");
  return !!t.getProperty("set") && !!state && !!checker.getTypeOfSymbol(state).getProperty("markTouched");
}

/** A custom control by convention: a `value` member that is a model signal. */
export function hasValueModel(checker: ts.TypeChecker, type: ts.Type): boolean {
  const value = type.getProperty("value");
  return !!value && !!checker.getTypeOfSymbol(value).getProperty("changes") && isSignal(checker, checker.getTypeOfSymbol(value));
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

/** The candidate nearest to `name`, when it is near enough to be a plausible typo. */
export function closest(name: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Math.max(2, Math.floor(name.length / 3)) + 1;
  for (const c of candidates) {
    const d = distance(name.toLowerCase(), c.toLowerCase());
    if (d < bestDistance) [best, bestDistance] = [c, d];
  }
  return best;
}


/** A @gable/store store: its type carries the STATE_SOURCE unique-symbol member. */
export function isStoreType(checker: ts.TypeChecker, type: ts.Type): boolean {
  return checker.getNonNullableType(type).getProperties().some((p) => /^__@STATE_SOURCE@/.test(p.escapedName as string));
}
