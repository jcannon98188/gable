import { bootstrap, computed, html, signal, untracked, type ComponentClass, type ComponentRef } from "@gable/core";
import { applyUpdate, registerModule, type HotResult } from "@gable/core/hmr";
import type { Renderer } from "@gable/core/renderer";
import { INITIAL_SOURCE } from "./source.js";

// The page side of the live HMR demo. It runs the real `@gable/core/hmr` runtime, the same module a Vite dev server
// drives: the first evaluation of the source is registered with `registerModule`, every Save evaluates the new source
// and hands it to `applyUpdate`. Nothing here is simulated; the readout is computed from the live component instances.

export type FieldKind = "signal" | "computed" | "data";

export interface FieldInfo {
  name: string;
  kind: FieldKind;
  /** A short display string of the current value (read without tracking). */
  value: string;
}

export interface Outcome {
  /** What `applyUpdate` returned, or `invalid` when the new source could not be evaluated and was handed over as a failure. */
  status: HotResult["status"] | "invalid";
  /** The first error, when there was one. */
  error: string | null;
  /** Writable fields (signals and plain data) whose value was carried into the new instance, with the live value. */
  carried: FieldInfo[];
  /** Computed fields that exist in both versions: re-derived from the carried state, not copied. */
  rederived: FieldInfo[];
  /** Fields only the new class has: initialised by their own initialisers. */
  added: FieldInfo[];
  /** Fields only the old class had: gone. */
  dropped: FieldInfo[];
  /** True when the live instance is the same object as before (a template or method edit; nothing was re-created). */
  sameInstance: boolean;
  /** What the runtime says it did to each changed class (`patch`, `view` or `resetup`), when the devtools hook is installed. */
  changes: Array<{ name: string; kind: string }>;
}

interface Hook {
  call(method: string, params?: unknown): unknown;
}
interface LogEntry {
  seq: number;
  changes: Array<{ name: string; kind: string }>;
}
const hmrLog = (): LogEntry[] => {
  try {
    return ((globalThis as { __GABLE_DEVTOOLS_HOOK__?: Hook }).__GABLE_DEVTOOLS_HOOK__?.call("hmrLog") as LogEntry[] | undefined) ?? [];
  } catch {
    return [];
  }
};

/**
 * Evaluates the module source with the three Gable helpers as parameters and returns its exports. This runs the
 * visitor's own text, typed in their own browser, in their own page: the same trust as pasting code into the
 * devtools console. It is not a sandbox and nothing is sent anywhere. The page's origin serves only this site.
 */
export function evaluate(source: string): Record<string, unknown> {
  const factory = new Function("html", "signal", "computed", `"use strict";\n${source}\n;return { Counter };`);
  return factory(html, signal, computed) as Record<string, unknown>;
}

const preview = (value: unknown): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") return "fn";
  try {
    return String(JSON.stringify(value) ?? value);
  } catch {
    return String(value);
  }
};

function kindOf(value: unknown): FieldKind {
  if (typeof value !== "function") return "data";
  const sig = value as { set?: unknown; update?: unknown };
  return typeof sig.set === "function" && typeof sig.update === "function" ? "signal" : "computed";
}

/** The own fields of a component instance (methods live on the prototype and are not listed). */
export function fieldsOf(instance: object): FieldInfo[] {
  return Object.keys(instance).map((name) => {
    const value = (instance as Record<string, unknown>)[name];
    const kind = kindOf(value);
    let shown: string;
    try {
      shown = kind === "data" ? preview(value) : preview(untracked(value as () => unknown));
    } catch {
      shown = "(throws)";
    }
    return { name, kind, value: shown };
  });
}

export interface SessionOptions {
  renderer: Renderer<any>;
  /** The element (or node) the live component is mounted into. */
  target: unknown;
}

/** The runtime keys classes by module URL for the life of the page, so every start needs a URL no earlier start used. */
let runs = 0;

export class DemoSession {
  #run = 0;
  #ref: ComponentRef<object, unknown> | null = null;

  constructor(private readonly options: SessionOptions) {}

  /** The live component instance (it is replaced when an edit re-creates it). */
  get instance(): object | null {
    return this.#ref?.instance ?? null;
  }

  fields(): FieldInfo[] {
    return this.#ref ? fieldsOf(this.#ref.instance) : [];
  }

  /** Mounts `source` as a fresh app. Each start uses its own module URL, so the runtime registers it as a first evaluation. */
  start(source: string = INITIAL_SOURCE): void {
    this.destroy();
    this.#run = ++runs;
    const exports = evaluate(source);
    registerModule(this.#url(), exports);
    this.#ref = bootstrap(exports.Counter as ComponentClass<object>, { renderer: this.options.renderer, target: this.options.target });
  }

  /** Back to the original source with fresh state. */
  reset(): void {
    this.start(INITIAL_SOURCE);
  }

  destroy(): void {
    this.#ref?.destroy();
    this.#ref = null;
  }

  #url(): string {
    return `demo://counter/${this.#run}`;
  }

  /** Evaluates `source` and applies it to the running component with the real runtime. */
  save(source: string): Outcome {
    const ref = this.#ref;
    if (!ref) throw new Error("The demo is not running.");
    const before = ref.instance;
    const beforeFields = fieldsOf(before);
    const seq = hmrLog().at(-1)?.seq ?? 0;

    let result: HotResult;
    let invalid = false;
    try {
      result = applyUpdate([{ url: this.#url(), exports: evaluate(source) }]);
    } catch (error) {
      // The new module did not evaluate: hand it over as a failed module, the way the Vite client reports one.
      invalid = true;
      result = applyUpdate([], [error]);
    }

    const after = ref.instance;
    const afterFields = fieldsOf(after);
    const entry = hmrLog().at(-1);
    const changes = entry && entry.seq > seq ? entry.changes : [];
    const out: Outcome = {
      status: invalid ? "invalid" : result.status,
      error: result.errors[0] === undefined ? null : result.errors[0] instanceof Error ? result.errors[0].message : String(result.errors[0]),
      carried: [],
      rederived: [],
      added: [],
      dropped: [],
      sameInstance: before === after,
      changes,
    };
    if (result.status !== "applied" && result.status !== "unchanged") {
      // Nothing changed: the same instance with the same fields is still live.
      out.carried = afterFields.filter((f) => f.kind !== "computed");
      out.rederived = afterFields.filter((f) => f.kind === "computed");
      return out;
    }
    for (const field of afterFields) {
      const old = beforeFields.find((f) => f.name === field.name);
      if (!old || old.kind !== field.kind) out.added.push(field);
      else if (field.kind === "computed") out.rederived.push(field);
      else out.carried.push(field);
    }
    out.dropped = beforeFields.filter((old) => !afterFields.some((f) => f.name === old.name && f.kind === old.kind));
    return out;
  }
}
