import { inputOf } from "./input.js";
import { OutputEmitter } from "./output.js";
import { untracked } from "./signals.js";

// Dev only. State transfer between two instances of (versions of) the same class, by field name and kind.

export type FieldKind = "signal" | "model" | "input" | "output" | "computed" | "stream" | "service" | "data";

export function kindOf(instance: object, name: string, isService: (value: object) => boolean): FieldKind {
  const value = (instance as Record<string, unknown>)[name];
  if (typeof value === "function") {
    const handle = inputOf(instance, name);
    if (handle) return handle.changes ? "model" : "input";
    const sig = value as { set?: unknown; update?: unknown };
    return typeof sig.set === "function" && typeof sig.update === "function" ? "signal" : "computed";
  }
  if (value instanceof OutputEmitter) return "output";
  if (value && typeof value === "object") {
    if (typeof (value as { subscribe?: unknown }).subscribe === "function") return "stream";
    if (isService(value)) return "service";
  }
  return "data";
}

/** Copies writable signals, models and plain data from `from` to `to` where name and kind both match. */
export function transferState(from: object, to: object, isService: (value: object) => boolean): void {
  for (const name of Object.keys(from)) {
    if (!Object.hasOwn(to, name)) continue;
    const kind = kindOf(from, name, isService);
    if (kind !== kindOf(to, name, isService)) continue;
    const old = (from as Record<string, unknown>)[name];
    const target = (to as Record<string, unknown>)[name];
    try {
      if (kind === "signal") (target as { set(v: unknown): void }).set(untracked(old as () => unknown));
      else if (kind === "model") inputOf(to, name)!.set(untracked(old as () => unknown));
      else if (kind === "data") (to as Record<string, unknown>)[name] = old;
    } catch {
      // a field that cannot take the old value keeps its new initial value
    }
  }
}
