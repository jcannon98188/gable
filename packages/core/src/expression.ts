// Gable's own expression language: parser plus tree-walking interpreter. No eval.
// Value expressions allow property reads (`a.b`, `a?.b`), zero-argument signal
// reads (`count()`), literals, `!` and `??`.

export type Expr =
  | { type: "literal"; value: string | number | boolean | null | undefined }
  | { type: "name"; name: string }
  | { type: "member"; object: Expr; property: string; optional: boolean }
  | { type: "call"; callee: Expr; optional: boolean }
  | { type: "not"; operand: Expr }
  | { type: "coalesce"; left: Expr; right: Expr };

type Token = { kind: "id" | "num" | "str" | "punct"; text: string };

const TOKEN = /\s*(?:([A-Za-z_$][\w$]*)|(\d+(?:\.\d+)?)|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(\?\?|\?\.|[.()!]))/y;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < source.length) {
    if (/^\s*$/.test(source.slice(TOKEN.lastIndex))) break;
    const m = TOKEN.exec(source);
    if (!m) throw new Error(`Invalid expression "${source}" at ${TOKEN.lastIndex}`);
    if (m[1] !== undefined) tokens.push({ kind: "id", text: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: "num", text: m[2] });
    else if (m[3] !== undefined || m[4] !== undefined) tokens.push({ kind: "str", text: (m[3] ?? m[4])!.replace(/\\(.)/g, "$1") });
    else tokens.push({ kind: "punct", text: m[5]! });
  }
  return tokens;
}

export function parseExpression(source: string): Expr {
  const tokens = tokenize(source);
  let pos = 0;
  const fail = (msg: string): never => {
    throw new Error(`Invalid expression "${source}": ${msg}`);
  };
  const peek = () => tokens[pos];
  const isPunct = (t: Token | undefined, text: string) => t?.kind === "punct" && t.text === text;

  function noArgs(): void {
    pos++; // "("
    if (!isPunct(peek(), ")")) fail("calls take no arguments in value expressions");
    pos++;
  }
  function coalesce(): Expr {
    let left = unary();
    while (isPunct(peek(), "??")) {
      pos++;
      left = { type: "coalesce", left, right: unary() };
    }
    return left;
  }
  function unary(): Expr {
    if (isPunct(peek(), "!")) {
      pos++;
      return { type: "not", operand: unary() };
    }
    return postfix();
  }
  function postfix(): Expr {
    let expr = primary();
    for (;;) {
      const t = peek();
      if (isPunct(t, ".") || isPunct(t, "?.")) {
        pos++;
        const optional = t!.text === "?.";
        if (optional && isPunct(peek(), "(")) {
          noArgs();
          expr = { type: "call", callee: expr, optional: true };
          continue;
        }
        const prop = peek();
        if (prop?.kind !== "id") return fail("expected a property name");
        pos++;
        expr = { type: "member", object: expr, property: prop.text, optional };
      } else if (isPunct(t, "(")) {
        noArgs();
        expr = { type: "call", callee: expr, optional: false };
      } else return expr;
    }
  }
  function primary(): Expr {
    const t = peek();
    if (!t) return fail("unexpected end");
    pos++;
    if (t.kind === "num") return { type: "literal", value: Number(t.text) };
    if (t.kind === "str") return { type: "literal", value: t.text };
    if (t.kind === "id") {
      if (t.text === "true") return { type: "literal", value: true };
      if (t.text === "false") return { type: "literal", value: false };
      if (t.text === "null") return { type: "literal", value: null };
      if (t.text === "undefined") return { type: "literal", value: undefined };
      return { type: "name", name: t.text };
    }
    if (isPunct(t, "(")) {
      const inner = coalesce();
      if (!isPunct(peek(), ")")) fail("expected )");
      pos++;
      return inner;
    }
    return fail(`unexpected "${t.text}"`);
  }

  const result = coalesce();
  if (pos < tokens.length) fail(`unexpected "${tokens[pos]!.text}"`);
  return result;
}

/** Evaluates against the component instance; reads signals by calling them. */
export function evaluate(expr: Expr, scope: object): unknown {
  switch (expr.type) {
    case "literal":
      return expr.value;
    case "name":
      return (scope as Record<string, unknown>)[expr.name];
    case "not":
      return !evaluate(expr.operand, scope);
    case "coalesce":
      return evaluate(expr.left, scope) ?? evaluate(expr.right, scope);
    case "member": {
      const object = evaluate(expr.object, scope) as Record<string, unknown> | null | undefined;
      if (object == null) {
        if (expr.optional) return undefined;
        throw new TypeError(`Cannot read "${expr.property}" of ${object}`);
      }
      return object[expr.property];
    }
    case "call": {
      let fn: unknown;
      let self: unknown = scope;
      if (expr.callee.type === "member") {
        const owner = evaluate(expr.callee.object, scope) as Record<string, unknown> | null | undefined;
        if (owner == null) {
          if (expr.callee.optional || expr.optional) return undefined;
          throw new TypeError(`Cannot read "${expr.callee.property}" of ${owner}`);
        }
        self = owner;
        fn = owner[expr.callee.property];
      } else fn = evaluate(expr.callee, scope);
      if (fn == null && expr.optional) return undefined;
      if (typeof fn !== "function") throw new TypeError("Template expression called something that is not a function");
      return fn.call(self);
    }
  }
}
