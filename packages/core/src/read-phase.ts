/** Where code is running, so a premature required-input read can say where it happened (dev diagnostics only). */
export type ReadPhase = "setup" | "host binding" | "effect";

let current: ReadPhase | null = null;

export function inReadPhase<T>(phase: ReadPhase, fn: () => T): T {
  const previous = current;
  current = phase;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

export function readPhase(): ReadPhase | null {
  return current;
}
