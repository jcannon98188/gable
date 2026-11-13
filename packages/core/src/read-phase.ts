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

/** Sets the phase and returns the one it replaced; the caller restores that one, in a `finally`. The hot-path form of {@link inReadPhase}: no closure. */
export function swapReadPhase(phase: ReadPhase | null): ReadPhase | null {
  const previous = current;
  current = phase;
  return previous;
}
