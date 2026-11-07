import { signal, type ReadonlySignal, type WritableSignal } from "./signals.js";
import { OutputEmitter } from "./output.js";
import { readPhase } from "./read-phase.js";
import { DEV, devtools } from "./dev-hooks.js";

const HANDLE = Symbol("gable.input");
const UNSET = Symbol("gable.unset");

/** What the framework needs to feed a value into an input or model. */
export interface InputHandle {
  name: string;
  owner: string;
  set(value: unknown): void;
  /** Present on a model: emits whenever the component writes it. */
  changes?: OutputEmitter<unknown>;
}

/** A read-only signal the parent feeds. Declare it as a field: `label = input('x')`. */
export interface InputSignal<T> extends ReadonlySignal<T> {}

/** A writable input with two-way binding: `[(name)]="parentSignal"`. */
export interface ModelSignal<T> extends WritableSignal<T> {
  readonly changes: OutputEmitter<T>;
}

function attach(read: object, handle: Partial<InputHandle>): void {
  Object.defineProperty(read, HANDLE, { value: { name: "", owner: "", set: () => {}, ...handle } });
}

/**
 * Declares a component input: a read-only signal that the parent's template feeds. Use it as a field initialiser.
 *
 * Call `input.required<T>()` for an input with no default; reading it before the parent has bound it throws a clear error.
 *
 * @remarks
 * Inputs are bound after setup, so do not read one in a field initialiser or in the first run of an effect created during setup. Read it from the template, a `computed` or an event handler instead.
 *
 * @param initial - The value before the parent binds anything. Omit it for `undefined`.
 * @returns A read-only signal holding the current input value.
 *
 * @example
 * ```ts
 * export class Greeting {
 *   static meta = {
 *     selector: "app-greeting",
 *     template: html`<p>Hello, {{ name() }}!</p>`,
 *   };
 *
 *   name = input("world");
 * }
 * ```
 */
export function input<T>(initial: T): InputSignal<T>;
export function input<T>(): InputSignal<T | undefined>;
export function input<T>(initial?: T): InputSignal<T | undefined> {
  const state = signal<T | undefined>(initial);
  const read = (() => state()) as InputSignal<T | undefined>;
  attach(read, { set: (v) => state.set(v as T) });
  if (DEV) devtools.current?.alias(read, state, "input");
  return read;
}

const WHERE = {
  setup: "in setup, in a field initialiser or an effect created there",
  "host binding": "in a meta.host binding",
  effect: "in an effect or template binding",
} as const;

function unsetMessage(name: string, owner: string): string {
  const phase = readPhase();
  const where = phase ? WHERE[phase] : "in a template, computed or other code";
  const hint =
    phase === "setup"
      ? " Effects run once as soon as they are created, so read the input in the template, a computed or an event handler instead."
      : "";
  const who = name ? `Required input "${name}" of ${owner}` : "A required input (not yet named during setup)";
  return `${who} was read before it was set (read ${where}). Inputs are bound after setup, so a required input cannot be read while the component is being set up.${hint} Make sure the parent template binds it.`;
}

input.required = function required<T>(): InputSignal<T> {
  const state = signal<T | typeof UNSET>(UNSET);
  const read = (() => {
    const v = state();
    if (v === UNSET) {
      const h = (read as unknown as Record<symbol, InputHandle>)[HANDLE]!;
      throw new Error(unsetMessage(h.name, h.owner));
    }
    return v;
  }) as InputSignal<T>;
  attach(read, { set: (v) => state.set(v as T) });
  if (DEV) devtools.current?.alias(read, state, "input");
  return read;
};

/**
 * Declares a two-way bound input: a writable signal the parent can bind with `[(name)]`. Writing it in the component also emits on `changes`, which is how the parent's signal stays in sync.
 *
 * @param initial - The value before the parent binds anything.
 * @returns A writable signal with a `changes` output.
 *
 * @example
 * ```ts
 * export class Toggle {
 *   static meta = {
 *     selector: "app-toggle",
 *     template: html`<button (click)="flip()">Toggle ({{ on() }})</button>`,
 *   };
 *
 *   on = model(false);
 *
 *   flip(): void {
 *     this.on.update((v) => !v);
 *   }
 * }
 * ```
 */
export function model<T>(initial: T): ModelSignal<T> {
  const state = signal(initial);
  const changes = new OutputEmitter<T>();
  const read = (() => state()) as ModelSignal<T>;
  read.set = (value) => {
    state.set(value);
    changes.emit(value);
  };
  read.update = (fn) => read.set(fn(state()));
  Object.defineProperty(read, "changes", { value: changes });
  attach(read, { set: (v) => state.set(v as T), changes: changes as OutputEmitter<unknown> });
  if (DEV) devtools.current?.alias(read, state, "model");
  return read;
}

/** Looks up an input or model field by name on an instance. */
export function inputOf(instance: object, name: string): InputHandle | undefined {
  const field = (instance as Record<string, unknown>)[name];
  return typeof field === "function" ? (field as unknown as Record<symbol, InputHandle>)[HANDLE] : undefined;
}

/** Names the inputs of a freshly constructed instance (for error messages) and returns its outputs for cleanup. */
export function describeFields(instance: object, owner: string): OutputEmitter<unknown>[] {
  const outputs: OutputEmitter<unknown>[] = [];
  for (const [key, value] of Object.entries(instance)) {
    if (value instanceof OutputEmitter) outputs.push(value);
    const handle = typeof value === "function" ? (value as unknown as Record<symbol, InputHandle>)[HANDLE] : undefined;
    if (handle) {
      handle.name = key;
      handle.owner = owner;
      if (handle.changes) outputs.push(handle.changes);
    }
  }
  return outputs;
}
