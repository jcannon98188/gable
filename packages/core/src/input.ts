import { signal, type ReadonlySignal, type WritableSignal } from "./signals.js";
import { OutputEmitter } from "./output.js";

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

export function input<T>(initial: T): InputSignal<T>;
export function input<T>(): InputSignal<T | undefined>;
export function input<T>(initial?: T): InputSignal<T | undefined> {
  const state = signal<T | undefined>(initial);
  const read = (() => state()) as InputSignal<T | undefined>;
  attach(read, { set: (v) => state.set(v as T) });
  return read;
}

input.required = function required<T>(): InputSignal<T> {
  const state = signal<T | typeof UNSET>(UNSET);
  const read = (() => {
    const v = state();
    if (v === UNSET) {
      const h = (read as unknown as Record<symbol, InputHandle>)[HANDLE]!;
      throw new Error(`Required input "${h.name}" of ${h.owner} was read before it was set. Bind it in the parent template.`);
    }
    return v;
  }) as InputSignal<T>;
  attach(read, { set: (v) => state.set(v as T) });
  return read;
};

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
