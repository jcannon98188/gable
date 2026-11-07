// `@gable/core/forms`: model-first signal forms. `form(model, schema)` derives a tree of
// fine-grained writable signals from a writable model signal; the model stays canonical.
// Per-field state lives under the one reserved `state` property.
import { Observable, Subject, lastValueFrom, type Subscription } from "rxjs";
import { computed, effect, signal, untracked, type ReadonlySignal, type WritableSignal } from "./signals.js";
import { createScope, currentScope, runInScope, type Scope } from "./scope.js";
import { reportError } from "./errors.js";
import { toObservable } from "./rxjs.js";

// --- public types ----------------------------------------------------------

/** What a validator returns for one problem: a `kind`, an optional `message` and any data. */
export interface ErrorObject {
  kind: string;
  message?: string;
  [data: string]: unknown;
}

/** One error somewhere in a subtree, with the dotted path of the field it belongs to (`items.0.name`; the root is `""`). */
export interface FieldError {
  path: string;
  error: ErrorObject;
}

/** The reserved per-field state namespace. Every member that is a signal is read by calling it. */
export interface FieldState {
  /** Stable identity: the property name, or the generated key of an array row. */
  readonly key: string;
  /** Own errors: sync rules, then async results, then server errors. Empty while the field is disabled. */
  readonly errors: ReadonlySignal<ErrorObject[]>;
  readonly errors$: Observable<ErrorObject[]>;
  /** Errors of this field and everything below it (disabled fields are skipped). */
  readonly allErrors: ReadonlySignal<FieldError[]>;
  /** True after the first blur (or `markTouched()`), and for any group with a touched descendant. */
  readonly touched: ReadonlySignal<boolean>;
  /** The value differs from the baseline (the initial model value, or the last `reset(value)`). */
  readonly dirty: ReadonlySignal<boolean>;
  /** An async validator in this subtree has not emitted yet. */
  readonly pending: ReadonlySignal<boolean>;
  /** No errors in the subtree and nothing pending. */
  readonly valid: ReadonlySignal<boolean>;
  readonly disabled: ReadonlySignal<boolean>;
  readonly readonly: ReadonlySignal<boolean>;
  /** Form-wide: a `submit()` action is running. */
  readonly submitting: ReadonlySignal<boolean>;
  /** Form-wide: `submit()` has been called since the last `reset()`. */
  readonly submitted: ReadonlySignal<boolean>;
  /** Marks this field touched (the `[field]` directive calls it on blur). */
  markTouched(): void;
}

type Leaf = string | number | boolean | bigint | symbol | null | undefined | Date | ((...args: any[]) => unknown);

interface FieldBase<T> extends WritableSignal<T> {
  readonly state: FieldState;
  readonly value$: Observable<T>;
}

interface ArrayMembers<U> {
  /** The row fields, each with a stable `state.key`. Use `@for (row of form.items.rows(); track row.state.key)`. */
  readonly rows: ReadonlySignal<Field<U>[]>;
  push(item: U): void;
  insert(index: number, item: U): void;
  remove(index: number | Field<U>): void;
  move(from: number, to: number): void;
}

/** A node of a form: a writable signal of its slice of the model, plus `state` and the fields below it. */
export type Field<T> = FieldBase<T> &
  (T extends readonly (infer U)[] ? ArrayMembers<U> : T extends Leaf ? unknown : { readonly [K in keyof T]-?: Field<T[K]> });

/** What a submit action can resolve to: server errors keyed by the dotted path of the field they belong to. */
export type ServerErrors = Record<string, ErrorObject[]>;

/** `ok`: the action ran and succeeded. `invalid`: not run (errors or pending). `busy`: a submit is already running. `serverErrors`: the action returned errors, now attached. `failed`: the action threw (reported to the ErrorHandler). */
export type SubmitResult = "ok" | "invalid" | "busy" | "serverErrors" | "failed";

/**
 * The function passed to `form.submit`. It receives the form's value and may return (directly, as a promise or as an observable) server-side errors keyed by field path, which are then attached to the fields. Returning nothing means success.
 *
 * @typeParam T - The form's model type.
 */
export type SubmitAction<T> = (value: T) => PromiseLike<ServerErrors | void | undefined> | Observable<ServerErrors | void | undefined> | ServerErrors | void;

/**
 * The members only the root of a form has: `submit`, `submit$` and `reset`.
 *
 * @typeParam T - The form's model type.
 */
export interface FormField<T> {
  /** Touches every field, then runs `action` with the model only if the form is valid and nothing is pending. */
  submit(action: SubmitAction<T>): Promise<SubmitResult>;
  /** Cold twin of `submit`: submits when subscribed and emits the result. */
  submit$(action: SubmitAction<T>): Observable<SubmitResult>;
  /** Restores the baseline; with `value`, sets it and makes it the new baseline. Clears touched, submitted and server errors. */
  reset(value?: T): void;
}

/**
 * The root of a form: a {@link Field} for the whole model plus {@link FormField} for submitting and resetting. Created by {@link form}.
 *
 * @typeParam T - The form's model type.
 */
export type Form<T> = Field<T> & FormField<T>;

/** Options for {@link form}. */
export interface FormOptions {
  /** Own the form with this scope instead of the current one. */
  scope?: Scope;
}

/** A schema path: mirrors the model's shape; passed to rules as their target. */
export type Path<T> = PathMarker<T> & (T extends readonly unknown[] ? unknown : T extends Leaf ? unknown : { readonly [K in keyof T]-?: Path<T[K]> });
declare const PATH_TYPE: unique symbol;
interface PathMarker<T> {
  readonly [PATH_TYPE]?: T;
}
/**
 * A function that declares the rules for a model by calling rule functions (`required`, `validate`, ...) on the paths it is given. It runs once.
 *
 * @typeParam T - The type of the model slice the schema covers.
 */
export type Schema<T> = (path: Path<T>) => void;

/** What a validator returns: nothing or `null` for valid, or one error object or an array of them. */
export type ValidationResult = ErrorObject | readonly ErrorObject[] | null | undefined | void;

/**
 * Gives a validator or condition access to the field it runs on and to the rest of the form, for rules that depend on other fields.
 */
export interface ValidationContext {
  /** The field being validated. */
  readonly field: Field<any>;
  /** The form root, for cross-field reads: `root.password()`. Reads are reactive. */
  readonly root: Field<any>;
  /** The group or array row that contains the field (the root's own parent is itself). */
  readonly parent: Field<any>;
}

// --- schema functions ------------------------------------------------------

const PATH = Symbol("gable.path");

type Segments = readonly string[];

interface Cond {
  at: Segments;
  test: (ctx: ValidationContext) => boolean;
}

type Rule =
  | { kind: "sync"; at: Segments; conds: Cond[]; fn: (value: any, ctx: ValidationContext) => ValidationResult }
  | { kind: "async"; at: Segments; conds: Cond[]; fn: (value$: Observable<any>) => Observable<ErrorObject | readonly ErrorObject[] | null | undefined | void> }
  | { kind: "disabled" | "readonly"; at: Segments; conds: Cond[]; fn: (ctx: ValidationContext) => boolean };

interface Collector {
  rules: Rule[];
  conds: Cond[];
}
let collecting: Collector | null = null;

function makePath(segments: Segments): unknown {
  return new Proxy(
    {},
    {
      get: (_, key) => (key === PATH ? segments : typeof key === "string" ? makePath([...segments, key]) : undefined),
    },
  );
}

function segmentsOf(path: unknown): Segments {
  const segments = (path as { [PATH]?: Segments })[PATH];
  if (!segments) throw new Error("Expected a path from the form schema callback (e.g. `p.email`).");
  return segments;
}

function collector(name: string): Collector {
  if (!collecting) throw new Error(`${name}() can only be called inside a form schema function.`);
  return collecting;
}

function add(name: string, path: unknown, rule: (at: Segments, conds: Cond[]) => Rule): void {
  const c = collector(name);
  c.rules.push(rule(segmentsOf(path), [...c.conds]));
}

/**
 * Declares a sync rule: a pure function returning nothing, an error object, or an array of them. Runs reactively.
 *
 * @example
 * ```ts
 * form(model, (p) => {
 *   validate(p.confirm, (value, ctx) => (value === ctx.root.password() ? null : { kind: "mismatch" }));
 * });
 * ```
 */
export function validate<T>(path: Path<T>, fn: (value: T, ctx: ValidationContext) => ValidationResult): void {
  add("validate", path, (at, conds) => ({ kind: "sync", at, conds, fn }));
}

/**
 * Declares an async rule in plain RxJS: `value$` emits the value each time the sync rules pass; the stream
 * you return emits `null` (valid) or error objects. `state.pending()` holds until it emits. A stream error
 * goes to the ErrorHandler and adds `{ kind: 'asyncFailed' }`.
 */
export function validateAsync<T>(
  path: Path<T>,
  fn: (value$: Observable<T>) => Observable<ErrorObject | readonly ErrorObject[] | null | undefined | void>,
): void {
  add("validateAsync", path, (at, conds) => ({ kind: "async", at, conds, fn }));
}

/** Runs a sub-schema against a part of the model: `apply(p.address, addressSchema)`. */
export function apply<T>(path: Path<T>, schema: Schema<T>): void {
  collector("apply");
  schema(path);
}

/** Rules declared in `schema` apply only while `condition` is true (read reactively; it receives the field at `path`). */
export function applyWhen<T>(path: Path<T>, condition: (ctx: ValidationContext) => boolean, schema: Schema<T>): void {
  const c = collector("applyWhen");
  c.conds.push({ at: segmentsOf(path), test: condition });
  try {
    schema(path);
  } finally {
    c.conds.pop();
  }
}

/** Declares the rules of every row of an array field: `each(p.items, (row) => required(row.name))`. */
export function each<U>(path: Path<U[]>, schema: Schema<U>): void {
  collector("each");
  schema(makePath([...segmentsOf(path), "*"]) as Path<U>);
}

/** The field is disabled while `condition` is true (default: always). Disabled fields are skipped by validation; their value stays in the model. */
export function disabled<T>(path: Path<T>, condition: (ctx: ValidationContext) => boolean = () => true): void {
  add("disabled", path, (at, conds) => ({ kind: "disabled", at, conds, fn: condition }));
}

/**
 * The field is read-only while `condition` is true (default: always). It is reported through `state.readonly` and applied to the control by the `[field]` directive; the value stays in the model.
 */
export function readonly<T>(path: Path<T>, condition: (ctx: ValidationContext) => boolean = () => true): void {
  add("readonly", path, (at, conds) => ({ kind: "readonly", at, conds, fn: condition }));
}

/** Options shared by the built-in rules. */
export interface RuleOptions {
  message?: string;
}
const withMessage = (error: ErrorObject, options?: RuleOptions): ErrorObject => (options?.message === undefined ? error : { ...error, message: options.message });
const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Null, undefined, '' and [] fail.
 *
 * @example
 * ```ts
 * form(model, (p) => {
 *   required(p.name, { message: "Name is required" });
 * });
 * ```
 */
export function required<T>(path: Path<T>, options?: RuleOptions): void {
  validate(path, (v) => (isEmpty(v) ? withMessage({ kind: "required" }, options) : null));
}
/** The value must be exactly `true`; use it for a "I accept the terms" checkbox. */
export function requiredTrue(path: Path<boolean>, options?: RuleOptions): void {
  validate(path, (v) => (v === true ? null : withMessage({ kind: "requiredTrue" }, options)));
}
/** A non-empty string or array must have at least `min` items; empty values pass (combine with `required`). */
export function minLength(path: Path<string | unknown[] | null | undefined>, min: number, options?: RuleOptions): void {
  validate(path, (v) => (!isEmpty(v) && (v as string).length < min ? withMessage({ kind: "minLength", min, actual: (v as string).length }, options) : null));
}
/** A string or array must have at most `max` items. */
export function maxLength(path: Path<string | unknown[] | null | undefined>, max: number, options?: RuleOptions): void {
  validate(path, (v) => (!isEmpty(v) && (v as string).length > max ? withMessage({ kind: "maxLength", max, actual: (v as string).length }, options) : null));
}
/** A number must be at least `min`. `null` and `undefined` pass (combine with `required`). */
export function min(path: Path<number | null | undefined>, min: number, options?: RuleOptions): void {
  validate(path, (v) => (v != null && v < min ? withMessage({ kind: "min", min, actual: v }, options) : null));
}
/** A number must be at most `max`. `null` and `undefined` pass. */
export function max(path: Path<number | null | undefined>, max: number, options?: RuleOptions): void {
  validate(path, (v) => (v != null && v > max ? withMessage({ kind: "max", max, actual: v }, options) : null));
}
/** A non-empty string must match `regex`. Empty values pass (combine with `required`). */
export function pattern(path: Path<string | null | undefined>, regex: RegExp, options?: RuleOptions): void {
  validate(path, (v) => {
    if (isEmpty(v)) return null;
    regex.lastIndex = 0;
    return regex.test(v as string) ? null : withMessage({ kind: "pattern", pattern: regex.source }, options);
  });
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * A non-empty string must look like an email address (`name@host.tld`). This is a basic shape check, not a deliverability check.
 */
export function email(path: Path<string | null | undefined>, options?: RuleOptions): void {
  validate(path, (v) => (isEmpty(v) || EMAIL.test(v as string) ? null : withMessage({ kind: "email" }, options)));
}

// --- the form tree ---------------------------------------------------------

const RESERVED = new Set(["state", "set", "update", "value$"]);
const ROOT_RESERVED = new Set(["submit", "submit$", "reset"]);
const NONE: unique symbol = Symbol("none");

const isGroup = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (isGroup(a) && isGroup(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

const sameErrors = (a: ErrorObject[], b: ErrorObject[]) => a.length === b.length && a.every((e, i) => deepEqual(e, b[i]));

function assertModelKeys(value: unknown, path: string, root: boolean): void {
  if (Array.isArray(value)) value.forEach((v, i) => assertModelKeys(v, path ? `${path}.${i}` : String(i), false));
  else if (isGroup(value)) {
    for (const key of Object.keys(value)) {
      const here = path ? `${path}.${key}` : key;
      if (RESERVED.has(key) || (root && ROOT_RESERVED.has(key))) {
        throw new Error(
          key === "state"
            ? `A form model cannot have a key named "state" (at "${here}"): it is reserved for field state (form.x.state.errors()). Rename the key.`
            : `A form model cannot have a key named "${key}" (at "${here}"): it is part of the field API. Rename the key.`,
        );
      }
      assertModelKeys(value[key], here, false);
    }
  }
}

interface Root {
  scope: Scope;
  rules: Rule[];
  model: WritableSignal<any>;
  baseline: WritableSignal<any>;
  submitting: WritableSignal<boolean>;
  submitted: WritableSignal<boolean>;
  node: Node;
}

interface Node {
  readonly root: Root;
  readonly parent: Node | null;
  readonly field: Field<any>;
  readonly key: ReadonlySignal<string>;
  readonly path: () => string;
  readonly pattern: Segments;
  readonly scope: Scope;
  children(): Node[];
  /** The group/leaf/array family of the node. */
  readonly kind: "leaf" | "group" | "array";
  ownTouched: WritableSignal<boolean>;
  server: WritableSignal<{ value: unknown; errors: ErrorObject[] } | null>;
  errors: ReadonlySignal<ErrorObject[]>;
  allErrors: ReadonlySignal<FieldError[]>;
  touched: ReadonlySignal<boolean>;
  pending: ReadonlySignal<boolean>;
  disabled: ReadonlySignal<boolean>;
  /** Resolves a child by dotted-path segment. */
  child(segment: string): Node | undefined;
  clearState(): void;
  touchAll(): void;
}

function sameSegments(rule: Segments, pattern: Segments): boolean {
  return rule.length === pattern.length && rule.every((s, i) => s === pattern[i]);
}

let rowCounter = 0;

interface NodeInit {
  root: Root;
  parent: Node | null;
  /** Property name, or the row's generated key. */
  segment: string;
  /** Row nodes are addressed by generated key; their position is looked up. */
  row?: { index: () => number };
  pattern: Segments;
  read: () => unknown;
  update: (fn: (current: any) => any) => void;
  baseline: () => unknown;
  /** The slice at creation, to decide the node's shape. */
  shape: unknown;
  scope: Scope;
}

function createNode(init: NodeInit): Node {
  const { root, parent, scope } = init;
  const read = computed(init.read);
  const self = { root, parent, scope, pattern: init.pattern } as Node;
  const groupChildren = new Map<string, Node>();
  let arrayRows: ReadonlySignal<Node[]> | undefined;
  const kind: Node["kind"] = Array.isArray(init.shape) ? "array" : isGroup(init.shape) ? "group" : "leaf";
  (self as { kind: Node["kind"] }).kind = kind;
  const fn = (() => read()) as unknown as Field<any>;
  const field = fn as unknown as Record<string, any>;
  const define = (name: string, value: unknown) => Object.defineProperty(field, name, { value, configurable: true, enumerable: true });
  define("set", (v: unknown) => init.update(() => v));
  define("update", (f: (v: unknown) => unknown) => init.update((cur) => f(cur)));

  const pathSegment = () => (init.row ? String(init.row.index()) : init.segment);
  const path = (): string => {
    const own = pathSegment();
    const above = parent ? parent.path() : "";
    return above ? `${above}.${own}` : parent ? own : "";
  };

  const rules = root.rules.filter((r) => sameSegments(r.at, init.pattern));
  const ancestorAt = (n: number): Node => {
    let node: Node = self;
    for (let up = init.pattern.length - n; up > 0 && node.parent; up--) node = node.parent;
    return node;
  };
  const ctx: ValidationContext = {
    field: fn,
    get root() {
      return root.node.field;
    },
    get parent() {
      return (parent ?? self).field;
    },
  };
  const active = (rule: Rule) => rule.conds.every((c) => c.test(ctxOf(ancestorAt(c.at.length))));
  const ctxOf = (n: Node): ValidationContext => (n === self ? ctx : { field: n.field, root: root.node.field, parent: (n.parent ?? n).field });

  const ownDisabled = computed(() => rules.some((r) => r.kind === "disabled" && active(r) && r.fn(ctx)));
  const ownReadonly = computed(() => rules.some((r) => r.kind === "readonly" && active(r) && r.fn(ctx)));
  const isDisabled = computed(() => ownDisabled() || (parent?.disabled() ?? false));
  const isReadonly = computed(() => ownReadonly() || (parent ? (parent.field.state.readonly() as boolean) : false));

  const syncRules = rules.filter((r): r is Extract<Rule, { kind: "sync" }> => r.kind === "sync");
  const syncErrors = computed(
    () => {
      if (isDisabled()) return [];
      const out: ErrorObject[] = [];
      const value = read();
      for (const rule of syncRules) {
        if (!active(rule)) continue;
        try {
          const result = rule.fn(value, ctx);
          if (Array.isArray(result)) out.push(...(result as ErrorObject[]));
          else if (result) out.push(result as ErrorObject);
        } catch (error) {
          reportError(error, "effect", root.scope, "form validator");
        }
      }
      return out;
    },
    { equal: sameErrors },
  );

  // Async rules: each one has its own pending flag and result, fed only while the sync rules pass.
  const asyncRules = rules.filter((r): r is Extract<Rule, { kind: "async" }> => r.kind === "async");
  const asyncStates = asyncRules.map((rule) => {
    const pending = signal(false);
    const errors = signal<ErrorObject[]>([]);
    let subject: Subject<unknown> | null = null;
    let subscription: Subscription | null = null;
    const start = () => {
      subject = new Subject();
      const mine = subject;
      try {
        subscription = rule
          .fn(mine.asObservable() as Observable<unknown>)
          .subscribe({
            next: (result) => {
              pending.set(false);
              errors.set(result ? ([] as ErrorObject[]).concat(result as ErrorObject | ErrorObject[]) : []);
            },
            error: (error) => {
              reportError(error, "subscription", scope, "form async validator");
              pending.set(false);
              errors.set([{ kind: "asyncFailed" }]);
              if (subject === mine) subject = null;
            },
          });
      } catch (error) {
        reportError(error, "subscription", scope, "form async validator");
        pending.set(false);
        subject = null;
      }
    };
    scope.onDispose(() => {
      subscription?.unsubscribe();
      subject?.complete();
    });
    // The value reaches the stream only while the sync rules pass and the rule applies.
    const gated = computed(() => (!isDisabled() && active(rule) && syncErrors().length === 0 ? { value: read() } : NONE));
    runInScope(scope, () =>
      effect(() => {
        const gate = gated();
        untracked(() => {
          if (gate === NONE) {
            pending.set(false);
            if (errors().length > 0) errors.set([]);
            return;
          }
          if (!subject) start();
          if (!subject) return;
          errors.set([]);
          pending.set(true);
          subject.next(gate.value);
        });
      }),
    );
    return { pending, errors };
  });

  const server = signal<{ value: unknown; errors: ErrorObject[] } | null>(null);
  const errors = computed(
    () => {
      if (isDisabled()) return [];
      const out = [...syncErrors()];
      for (const s of asyncStates) out.push(...s.errors());
      const remote = server();
      if (remote && Object.is(remote.value, read())) out.push(...remote.errors);
      return out;
    },
    { equal: sameErrors },
  );

  const children = (): Node[] => (self.kind === "group" ? [...groupChildren.values()] : self.kind === "array" ? arrayRows!() : []);
  const allErrors = computed(() => {
    const out: FieldError[] = [];
    const here = path();
    for (const error of errors()) out.push({ path: here, error });
    for (const child of children()) out.push(...child.allErrors());
    return out;
  });
  const ownTouched = signal(false);
  const touched = computed(() => ownTouched() || children().some((c) => c.touched()));
  const ownPending = computed(() => asyncStates.some((s) => s.pending()));
  const pending = computed(() => !isDisabled() && (ownPending() || children().some((c) => c.pending())));
  const valid = computed(() => !pending() && allErrors().length === 0);
  const dirty = computed(() => {
    const base = init.baseline();
    return base === NONE ? true : !deepEqual(read(), base);
  });

  const state: FieldState = {
    key: init.segment,
    errors,
    get errors$() {
      return observableOf(errors);
    },
    allErrors,
    touched,
    dirty,
    pending,
    valid,
    disabled: isDisabled,
    readonly: isReadonly,
    submitting: root.submitting,
    submitted: root.submitted,
    markTouched: () => ownTouched.set(true),
  };
  define("state", state);
  const observables = new Map<object, Observable<any>>();
  function observableOf<V>(source: ReadonlySignal<V>): Observable<V> {
    let o = observables.get(source);
    if (!o) observables.set(source, (o = runInScope(root.scope, () => toObservable(source))));
    return o;
  }
  Object.defineProperty(field, "value$", { get: () => observableOf(read), configurable: true, enumerable: true });

  // Children.
  Object.assign(self, {
    field: fn,
    key: () => pathSegment(),
    path,
    children,
    ownTouched,
    server,
    errors,
    allErrors,
    touched,
    pending,
    disabled: isDisabled,
    child: (segment: string) => (self.kind === "group" ? groupChildren.get(segment) : self.kind === "array" ? arrayRows!()[Number(segment)] : undefined),
    clearState() {
      ownTouched.set(false);
      server.set(null);
      for (const child of children()) child.clearState();
    },
    touchAll() {
      ownTouched.set(true);
      for (const child of children()) child.touchAll();
    },
  });

  if (kind === "group") {
    for (const key of Object.keys(init.shape as object)) {
      const child = createNode({
        root,
        parent: self,
        segment: key,
        pattern: [...init.pattern, key],
        read: () => (read() as Record<string, unknown> | null | undefined)?.[key],
        update: (f) => init.update((cur) => ({ ...cur, [key]: f(cur?.[key]) })),
        baseline: () => {
          const base = init.baseline();
          return base === NONE || base == null ? NONE : (base as Record<string, unknown>)[key];
        },
        shape: (init.shape as Record<string, unknown>)[key],
        scope: createScope(scope),
      });
      groupChildren.set(key, child);
      define(key, child.field);
    }
  } else if (kind === "array") {
    arrayRows = arrayMembers(self, init, read, define);
  }
  return self;
}

/** Row bookkeeping for an array node: stable generated keys, nodes cached by key, structural methods. */
function arrayMembers(self: Node, init: NodeInit, read: ReadonlySignal<unknown>, define: (name: string, value: unknown) => void): ReadonlySignal<Node[]> {
  const { root } = init;
  const length = computed(() => (read() as unknown[] | null | undefined)?.length ?? 0);
  const keys: string[] = [];
  const baselineByKey = new Map<string, unknown>();
  const nodes = new Map<string, Node>();
  const epoch = signal(0);
  let seeded = false;
  const bump = () => epoch.set(epoch() + 1);
  const newKey = () => `row-${++rowCounter}`;

  const seed = () => {
    const base = init.baseline();
    const items = untracked(read) as unknown[];
    keys.length = 0;
    baselineByKey.clear();
    for (let i = 0; i < items.length; i++) {
      const key = newKey();
      keys.push(key);
      const b = Array.isArray(base) ? base[i] : NONE;
      baselineByKey.set(key, Array.isArray(base) && i < base.length ? b : NONE);
    }
    seeded = true;
  };

  const order = computed(() => {
    epoch();
    const n = length();
    if (!seeded) seed();
    while (keys.length < n) keys.push(newKey());
    keys.length = n;
    // Rows that left the array drop their state with their scope.
    for (const [key, node] of nodes) {
      if (!keys.includes(key)) {
        node.scope.dispose();
        nodes.delete(key);
        baselineByKey.delete(key);
      }
    }
    return keys.slice();
  });

  const rowNode = (key: string): Node => {
    let node = nodes.get(key);
    if (!node) {
      const index = () => order().indexOf(key);
      const items = untracked(read) as unknown[];
      const shape = items[untracked(index)];
      assertModelKeys(shape, "", false);
      node = createNode({
        root,
        parent: self,
        segment: key,
        row: { index },
        pattern: [...init.pattern, "*"],
        read: () => (read() as unknown[] | null | undefined)?.[index()],
        update: (f) =>
          init.update((cur: unknown[]) => {
            const i = untracked(index);
            return i < 0 ? cur : cur.map((item, at) => (at === i ? f(item) : item));
          }),
        baseline: () => (baselineByKey.has(key) ? baselineByKey.get(key) : NONE),
        shape,
        scope: createScope(self.scope),
      });
      nodes.set(key, node);
    }
    return node;
  };

  const rows = computed(() => order().map(rowNode));
  const current = () => untracked(read) as unknown[];
  const write = (items: unknown[]) => {
    init.update(() => items);
    bump();
  };
  const settleOrder = () => {
    // Keep the key list in step with a structural change before the model changes.
    seeded ||= (seed(), true);
  };
  const fields = computed(() => rows().map((r) => r.field));
  define("rows", fields);
  define("push", (item: unknown) => {
    assertModelKeys(item, "", false);
    settleOrder();
    keys.push(newKey());
    write([...current(), item]);
  });
  define("insert", (index: number, item: unknown) => {
    assertModelKeys(item, "", false);
    settleOrder();
    const at = Math.max(0, Math.min(index, keys.length));
    keys.splice(at, 0, newKey());
    const items = [...current()];
    items.splice(at, 0, item);
    write(items);
  });
  define("remove", (target: number | { state: FieldState }) => {
    settleOrder();
    const index = typeof target === "number" ? target : keys.indexOf(target.state.key);
    if (index < 0 || index >= keys.length) return;
    keys.splice(index, 1);
    write(current().filter((_, i) => i !== index));
  });
  define("move", (from: number, to: number) => {
    settleOrder();
    if (from < 0 || from >= keys.length || to < 0 || to >= keys.length || from === to) return;
    const [key] = keys.splice(from, 1);
    keys.splice(to, 0, key!);
    const items = [...current()];
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    write(items);
  });
  // A reset replaces every row: drop the cached rows and re-seed keys from the new baseline.
  const clear = self.clearState;
  self.clearState = () => {
    clear();
    for (const node of nodes.values()) node.scope.dispose();
    nodes.clear();
    seeded = false;
    bump();
  };
  return rows;
}

// --- form() ----------------------------------------------------------------

function runSchema<T>(schema: Schema<T> | undefined): Rule[] {
  const rules: Rule[] = [];
  if (!schema) return rules;
  const previous = collecting;
  collecting = { rules, conds: [] };
  try {
    schema(makePath([]) as Path<T>);
  } finally {
    collecting = previous;
  }
  return rules;
}

const toArray = (r: ValidationResult): ErrorObject[] => (r ? ([] as ErrorObject[]).concat(r as ErrorObject | ErrorObject[]) : []);

/**
 * Derives a form from a writable model signal. Every field is a writable signal of its slice of the model
 * (`form()` is the whole value, `form.email()` one field); the model is canonical. Call it during setup: the
 * form's async subscriptions and effects are owned by the current scope (or `options.scope`). The schema
 * runs once, in the caller's injection context.
 *
 * @example
 * ```ts
 * export class SignupForm {
 *   static meta = {
 *     selector: "app-signup-form",
 *     template: html`
 *       <input type="email" [field]="signup.email" />
 *       @if (signup.email.state.touched() && signup.email.state.errors().length !== 0) {
 *         <p>Enter a valid email address.</p>
 *       }
 *       <button (click)="submit()">Sign up</button>
 *     `,
 *   };
 *
 *   model = signal({ email: "" });
 *   signup = form(this.model, (p) => {
 *     required(p.email);
 *     email(p.email);
 *   });
 *
 *   submit() {
 *     return this.signup.submit((value) => this.save(value));
 *   }
 *
 *   save(value: { email: string }) {
 *     console.log(value.email);
 *   }
 * }
 * ```
 */
export function form<T>(model: WritableSignal<T>, schema?: Schema<T>, options: FormOptions = {}): Form<T> {
  const owner = options.scope ?? currentScope();
  if (!owner) throw new Error("form() must be called during setup (a component or service field initialiser). Pass { scope } to call it elsewhere.");
  const initial = untracked(model);
  assertModelKeys(initial, "", true);
  const scope = createScope(owner);
  const rules = runSchema(schema);
  const baseline = signal<unknown>(initial);
  const root: Root = {
    scope,
    rules,
    model,
    baseline,
    submitting: signal(false),
    submitted: signal(false),
    node: undefined as unknown as Node,
  };
  const node = createNode({
    root,
    parent: null,
    segment: "",
    pattern: [],
    read: () => model(),
    update: (f) => model.set(f(untracked(model))),
    baseline: () => baseline(),
    shape: initial,
    scope: createScope(scope),
  });
  root.node = node;

  const resolve = (path: string): Node | undefined => {
    let at: Node | undefined = node;
    if (path === "") return at;
    for (const segment of path.split(".")) at = at?.child(segment);
    return at;
  };

  const run = async (action: SubmitAction<T>): Promise<SubmitResult> => {
    if (untracked(root.submitting)) return "busy";
    node.touchAll();
    root.submitted.set(true);
    if (!untracked(node.field.state.valid)) return "invalid";
    root.submitting.set(true);
    try {
      let result = action(untracked(model));
      if (result instanceof Observable) result = lastValueFrom(result, { defaultValue: undefined });
      const remote = (await result) as ServerErrors | void;
      if (!remote) return "ok";
      let attached = false;
      for (const [path, errors] of Object.entries(remote)) {
        const target = resolve(path);
        if (!target) {
          reportError(new Error(`submit() returned errors for "${path}", which is not a field of this form.`), "event", scope, "submit");
          continue;
        }
        const list = toArray(errors);
        if (list.length === 0) continue;
        target.server.set({ value: untracked(target.field), errors: list });
        attached = true;
      }
      return attached ? "serverErrors" : "ok";
    } catch (error) {
      reportError(error, "event", scope, "submit");
      return "failed";
    } finally {
      root.submitting.set(false);
    }
  };

  const f = node.field as unknown as Record<string, unknown>;
  Object.defineProperties(f, {
    submit: { value: run, configurable: true, enumerable: true },
    submit$: { value: (action: SubmitAction<T>) => new Observable<SubmitResult>((s) => void run(action).then((r) => (s.next(r), s.complete()))), configurable: true, enumerable: true },
    reset: {
      value(value?: T) {
        if (arguments.length > 0) baseline.set(value);
        model.set(arguments.length > 0 ? (value as T) : (untracked(baseline) as T));
        node.clearState();
        root.submitted.set(false);
      },
      configurable: true,
      enumerable: true,
    },
    [FORM_STATE]: {
      value: {
        /** Dev/HMR seam: the dirty baseline and the dotted paths of touched fields. */
        capture: (): FormSnapshot => ({ baseline: untracked(baseline), touched: touchedPaths(node) }),
        restore(snapshot: FormSnapshot) {
          baseline.set(snapshot.baseline);
          for (const path of snapshot.touched) resolve(path)?.ownTouched.set(true);
        },
      },
    },
  });
  scope.onDispose(() => void 0);
  return node.field as unknown as Form<T>;
}

/** The slice of a form's state that survives a hot update besides its model value. */
export interface FormSnapshot {
  baseline: unknown;
  touched: string[];
}
const FORM_STATE = Symbol.for("gable.form.state");

function touchedPaths(node: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (untracked(n.ownTouched)) out.push(untracked(n.path));
    for (const child of untracked(() => n.children())) walk(child);
  };
  walk(node);
  return out;
}

/** Internal seam for the HMR runtime: reads and restores what a form keeps beside its model. */
export function formStateOf(form: object): { capture(): FormSnapshot; restore(snapshot: FormSnapshot): void } | undefined {
  return (form as Record<symbol, never>)[FORM_STATE];
}
