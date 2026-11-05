// The `[field]` directive: binds a form field (see `@gable/core/forms`) to a control.
// It is structural on purpose, so the core never imports the forms module: a field is any
// writable signal with a `state` namespace.
import { effect, untracked } from "./signals.js";
import { FAILED, guard, guarded } from "./errors.js";
import { evaluate, type Env, type Expr } from "./expression.js";
import { currentScope } from "./scope.js";
import { inputOf, type InputHandle } from "./input.js";
import { OutputEmitter } from "./output.js";
import type { Renderer } from "./renderer.js";

interface FieldLike {
  (): unknown;
  set(value: unknown): void;
  state: {
    disabled(): boolean;
    readonly(): boolean;
    errors(): unknown[];
    markTouched(): void;
  };
}

function asField(value: unknown, expr: string): FieldLike {
  const f = value as { set?: unknown; state?: { markTouched?: unknown } } | null | undefined;
  if (typeof value === "function" && typeof f?.set === "function" && typeof f.state?.markTouched === "function") return value as FieldLike;
  throw new TypeError(`[field] must be bound to a form field such as form.email, but ${expr} is not one.`);
}

/** The field an expression currently names; reads reactively and reports a non-field once per failure. */
function fieldOf(expr: Expr, env: Env, source: string): () => FieldLike | typeof FAILED {
  const safe = guard(currentScope(), "field");
  return () => safe(() => asField(evaluate(expr, env), source));
}

function describe(expr: Expr): string {
  return expr.type === "member" ? `${describe(expr.object)}.${expr.property}` : expr.type === "name" ? expr.name : "this expression";
}

/** Whether a built component takes `[field]` as a custom control: a `value = model<T>()` field. */
export function isCustomControl(instances: object[]): boolean {
  return instances.some((i) => inputOf(i, "value")?.changes);
}

/**
 * Binds a field to a native control through the renderer: value mapping by element type, writes back,
 * touched on blur, disabled / readonly and aria-invalid.
 */
export function bindNativeField<N>(el: N, expr: Expr, renderer: Renderer<N>, env: Env): void {
  const scope = currentScope();
  if (!renderer.fieldControl) throw new Error(`The ${renderer.name ?? "current"} renderer does not support [field]: it has no fieldControl().`);
  const control = renderer.fieldControl(el);
  const current = fieldOf(expr, env, describe(expr));
  let field: FieldLike | undefined;
  effect(() => {
    const f = current();
    if (f === FAILED) return;
    field = f;
    control.write(f());
  });
  effect(() => {
    const f = current();
    if (f === FAILED) return;
    control.setState({ disabled: f.state.disabled(), readonly: f.state.readonly(), invalid: f.state.errors().length > 0 });
  });
  scope?.onDispose(
    control.listen({
      value: (v) => guarded(scope, "event", () => untracked(() => field?.set(v)), "field"),
      touched: () => guarded(scope, "event", () => untracked(() => field?.state.markTouched()), "field"),
    }),
  );
}

/**
 * Binds a field to a custom control by convention: `value = model<T>()` is required; `disabled`, `readonly`,
 * `invalid` and `errors` inputs are filled when present, and a `touched` output marks the field touched.
 */
export function bindCustomField(instances: object[], expr: Expr, env: Env): void {
  const scope = currentScope();
  const current = fieldOf(expr, env, describe(expr));
  const handle = (name: string): InputHandle | undefined => instances.map((i) => inputOf(i, name)).find((h) => h);
  const value = handle("value")!;
  let field: FieldLike | undefined;
  effect(() => {
    const f = current();
    if (f === FAILED) return;
    field = f;
    value.set(f());
  });
  const state: Array<[string, (f: FieldLike) => unknown]> = [
    ["disabled", (f) => f.state.disabled()],
    ["readonly", (f) => f.state.readonly()],
    ["invalid", (f) => f.state.errors().length > 0],
    ["errors", (f) => f.state.errors()],
  ];
  for (const [name, read] of state) {
    const target = handle(name);
    if (!target) continue;
    effect(() => {
      const f = current();
      if (f !== FAILED) target.set(read(f));
    });
  }
  const subscribe = (source: { subscribe(next: (v: unknown) => void): { unsubscribe(): void } }, next: (v: unknown) => void) => {
    const sub = source.subscribe(next);
    scope?.onDispose(() => sub.unsubscribe());
  };
  subscribe(value.changes!, (v) => guarded(scope, "event", () => untracked(() => field?.set(v)), "field"));
  for (const instance of instances) {
    const touched = (instance as Record<string, unknown>).touched;
    if (touched instanceof OutputEmitter) subscribe(touched, () => guarded(scope, "event", () => untracked(() => field?.state.markTouched()), "field"));
  }
}
