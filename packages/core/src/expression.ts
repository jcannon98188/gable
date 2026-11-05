import type { ViewContext } from "./view-context.js";
// Gable's own expression language: parser plus tree-walking interpreter. No eval.
// Value expressions allow property reads (`a.b`, `a?.b`), zero-argument signal
// reads (`count()`), literals, `!` and `??`. Event handlers additionally allow
// one call whose arguments are value expressions (references, literals, `$event`).

import { connect, isStream } from "./bridge.js";
import { signal, untracked } from "./signals.js";
import { currentScope, type Scope } from "./scope.js";

export type Expr =
  | { type: "literal"; value: string | number | boolean | null | undefined }
  | { type: "name"; name: string }
  | { type: "member"; object: Expr; property: string; optional: boolean }
  | { type: "call"; callee: Expr; optional: boolean }
  | { type: "not"; operand: Expr }
  | { type: "coalesce"; left: Expr; right: Expr };

/** A parsed event handler: `callee(args...)`. */
export interface HandlerExpr {
  callee: Expr;
  args: Expr[];
}

/** Name lookup for expressions: template-local variables first, then the component instance. */
export interface Env {
  readonly instance: object;
  /** Template-local variables (loop vars, `@let`, `#ref`, `$event`); read inside an effect they subscribe. */
  readonly locals: Map<string, () => unknown>;
  readonly parent: Env | null;
  /** Set on a component's root Env: what its template needs to compose children. */
  view?: ViewContext;
}

export function createEnv(instance: object, parent: Env | null = null): Env {
  return { instance, locals: new Map(), parent };
}

type Token = { kind: "id" | "num" | "str" | "punct" | "op"; text: string };

const TOKEN =
  /\s*(?:([A-Za-z_$][\w$]*)|(\d+(?:\.\d+)?)|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(\?\?|\?\.|[.()!,])|([^\s\w$.()!,'"]+))/y;

const OPERATOR_HINT = "Templates cannot compute: move derived values into a computed signal and read it.";

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
    else if (m[5] !== undefined) tokens.push({ kind: "punct", text: m[5] });
    else tokens.push({ kind: "op", text: m[6]! });
  }
  return tokens;
}

class Parser {
  readonly tokens: Token[];
  pos = 0;
  constructor(readonly source: string) {
    this.tokens = tokenize(source);
  }
  fail(msg: string): never {
    throw new Error(`Invalid template expression "${this.source}": ${msg}`);
  }
  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  isPunct(t: Token | undefined, text: string): boolean {
    return t?.kind === "punct" && t.text === text;
  }
  unexpected(t: Token): never {
    if (t.kind === "op") {
      if (t.text.startsWith("|")) this.fail(`"${t.text}" is not allowed: pipes do not exist. Format values in a computed signal.`);
      if (t.text === "=>") this.fail(`arrow functions are not allowed. ${OPERATOR_HINT}`);
      if (t.text === "=") this.fail(`assignment is not allowed. Use [(model)] for two-way binding or call a handler.`);
      if (t.text === "?" || t.text === ":") this.fail(`the conditional operator is not allowed. Use @if or a computed signal.`);
      if (t.text === "[" || t.text === "{") this.fail(`"${t.text}" literals and indexing are not allowed. ${OPERATOR_HINT}`);
      this.fail(`operator "${t.text}" is not allowed. ${OPERATOR_HINT}`);
    }
    return this.fail(`unexpected "${t.text}"`);
  }
  noArgs(): void {
    this.pos++; // "("
    if (!this.isPunct(this.peek(), ")")) {
      this.fail("calls take no arguments in value expressions (only signal reads like count() are allowed; event handlers may take arguments)");
    }
    this.pos++;
  }
  coalesce(): Expr {
    let left = this.unary();
    while (this.isPunct(this.peek(), "??")) {
      this.pos++;
      left = { type: "coalesce", left, right: this.unary() };
    }
    return left;
  }
  unary(): Expr {
    if (this.isPunct(this.peek(), "!")) {
      this.pos++;
      return { type: "not", operand: this.unary() };
    }
    return this.postfix(false);
  }
  /** Property chain; with `stopAtCall`, an unparsed `(` is left for the caller. */
  postfix(stopAtCall: boolean): Expr {
    let expr = this.primary();
    for (;;) {
      const t = this.peek();
      if (this.isPunct(t, ".") || this.isPunct(t, "?.")) {
        this.pos++;
        const optional = t!.text === "?.";
        if (optional && this.isPunct(this.peek(), "(")) {
          this.noArgs();
          expr = { type: "call", callee: expr, optional: true };
          continue;
        }
        const prop = this.peek();
        if (prop?.kind !== "id") return this.fail("expected a property name");
        this.pos++;
        expr = { type: "member", object: expr, property: prop.text, optional };
      } else if (this.isPunct(t, "(")) {
        if (stopAtCall) return expr;
        this.noArgs();
        expr = { type: "call", callee: expr, optional: false };
      } else return expr;
    }
  }
  primary(): Expr {
    const t = this.peek();
    if (!t) return this.fail("unexpected end");
    this.pos++;
    if (t.kind === "num") return { type: "literal", value: Number(t.text) };
    if (t.kind === "str") return { type: "literal", value: t.text };
    if (t.kind === "id") {
      if (t.text === "true") return { type: "literal", value: true };
      if (t.text === "false") return { type: "literal", value: false };
      if (t.text === "null") return { type: "literal", value: null };
      if (t.text === "undefined") return { type: "literal", value: undefined };
      if (t.text === "this") this.fail(`"this" is not available; name the member directly`);
      return { type: "name", name: t.text };
    }
    if (this.isPunct(t, "(")) {
      const inner = this.coalesce();
      if (!this.isPunct(this.peek(), ")")) this.fail("expected )");
      this.pos++;
      return inner;
    }
    return this.unexpected(t);
  }
  finish(): void {
    const t = this.peek();
    if (t) this.unexpected(t);
  }
}

export function parseExpression(source: string): Expr {
  const p = new Parser(source);
  const result = p.coalesce();
  p.finish();
  return result;
}

/** Parses `handler(arg, ...)` for event bindings. */
export function parseHandler(source: string): HandlerExpr {
  const p = new Parser(source);
  const callee = p.postfix(true);
  if (!p.isPunct(p.peek(), "(") || callee.type === "literal") {
    p.fail('an event binding must call a handler, e.g. (click)="save($event)"');
  }
  p.pos++;
  const args: Expr[] = [];
  if (!p.isPunct(p.peek(), ")")) {
    for (;;) {
      args.push(p.coalesce());
      if (p.isPunct(p.peek(), ",")) p.pos++;
      else break;
    }
  }
  if (!p.isPunct(p.peek(), ")")) p.fail("expected )");
  p.pos++;
  p.finish();
  return { callee, args };
}

function lookup(env: Env, name: string): unknown {
  for (let e: Env | null = env; e; e = e.parent) {
    const local = e.locals.get(name);
    if (local) return local();
  }
  if (name in env.instance) return (env.instance as Record<string, unknown>)[name];
  throw new ReferenceError(
    `Unknown name "${name}" in template expression: templates see the component's members and template variables only (no globals).`,
  );
}

interface StreamBinding {
  source: unknown;
  read: () => unknown;
  stop: () => void;
}
const streamBindings = new WeakMap<Scope, Map<Expr, StreamBinding>>();

/**
 * A bare Observable or Promise reference binds directly: it reads as its latest
 * value (undefined before the first emission). The subscription is owned by the
 * evaluating scope, kept across re-evaluations, and swapped when the reference
 * changes. Outside a scope (event handlers) the reference passes through as is.
 */
function unwrap(expr: Expr, value: unknown): unknown {
  if (!isStream(value)) return value;
  const scope = currentScope();
  if (!scope) return value;
  let bindings = streamBindings.get(scope);
  if (!bindings) streamBindings.set(scope, (bindings = new Map()));
  let binding = bindings.get(expr);
  if (binding?.source === value) return binding.read();
  if (binding) binding.stop();
  else {
    const entry = (binding = { source: value, read: () => undefined, stop: () => {} });
    scope.onDispose(() => entry.stop());
    bindings.set(expr, binding);
  }
  const state = signal<unknown>(undefined);
  binding.source = value;
  binding.read = () => state();
  binding.stop = untracked(() => connect(value, (v) => state.set(v)));
  return binding.read();
}

/** Evaluates against an environment; reads signals by calling them. */
export function evaluate(expr: Expr, env: Env): unknown {
  switch (expr.type) {
    case "literal":
      return expr.value;
    case "name":
      return unwrap(expr, lookup(env, expr.name));
    case "not":
      return !evaluate(expr.operand, env);
    case "coalesce":
      return evaluate(expr.left, env) ?? evaluate(expr.right, env);
    case "member": {
      const object = evaluate(expr.object, env) as Record<string, unknown> | null | undefined;
      if (object == null) {
        if (expr.optional) return undefined;
        throw new TypeError(`Cannot read "${expr.property}" of ${object}`);
      }
      return unwrap(expr, object[expr.property]);
    }
    case "call": {
      const [fn, self] = resolveCallee(expr.callee, expr.optional, env);
      if (fn === undefined) return undefined;
      return fn.call(self);
    }
  }
}

type Fn = (...args: unknown[]) => unknown;

/** Resolves a callee to `[function, this]`; `[undefined, _]` means an optional call that short-circuits. */
function resolveCallee(callee: Expr, optionalCall: boolean, env: Env): [Fn | undefined, unknown] {
  let fn: unknown;
  let self: unknown = env.instance;
  if (callee.type === "member") {
    const owner = evaluate(callee.object, env) as Record<string, unknown> | null | undefined;
    if (owner == null) {
      if (callee.optional || optionalCall) return [undefined, undefined];
      throw new TypeError(`Cannot read "${callee.property}" of ${owner}`);
    }
    self = owner;
    fn = owner[callee.property];
  } else fn = evaluate(callee, env);
  if (fn == null && optionalCall) return [undefined, undefined];
  if (typeof fn !== "function") throw new TypeError("Template expression called something that is not a function");
  return [fn as Fn, self];
}

/** Runs an event handler with arguments evaluated in `env`. */
export function runHandler(handler: HandlerExpr, env: Env): void {
  const [fn, self] = resolveCallee(handler.callee, false, env);
  fn!.apply(self, handler.args.map((a) => evaluate(a, env)));
}

/** Reads the current value of a signal reference (two-way binding). */
export function readModel(expr: Expr, env: Env): unknown {
  const target = evaluate(expr, env);
  if (typeof target !== "function") throw new TypeError("[(model)] must be bound to a writable signal");
  return (target as () => unknown)();
}

/** Writes `value` through a writable signal reference (two-way binding). */
export function writeModel(expr: Expr, env: Env, value: unknown): void {
  const target = evaluate(expr, env) as { set?: (v: unknown) => void } | null;
  if (typeof target?.set !== "function") throw new TypeError("[(model)] must be bound to a writable signal");
  target.set(value);
}
