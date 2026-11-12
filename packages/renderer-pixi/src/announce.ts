// announceOnChange (TASK-104.11): wires a signal to the app's LiveAnnouncer, throttled so a per-frame signal cannot flood
// a screen reader. The canvas package has no announcer of its own; this is the same one the router uses.
import { effect, inject, onCleanup, untracked } from "@gable/core";
import { LiveAnnouncer, type Politeness } from "@gable/core/renderer";

export interface AnnounceOptions {
  /** Default `polite`. */
  politeness?: Politeness;
  /** At most one message per this many milliseconds. Default 1000. */
  intervalMs?: number;
}

/**
 * Announces `format(value)` whenever `source` changes (not for its initial value). Messages are throttled: the first change
 * after a quiet period is spoken at once, and changes during the following `intervalMs` collapse into one message, the latest,
 * spoken when the window ends. A `format` that returns an empty string or `null` announces nothing. Call it in a component's
 * setup (it needs `LiveAnnouncer` from the injector and ends with the component). Returns a function that stops it early (the effect itself lives until its scope ends, and does nothing once stopped).
 */
export function announceOnChange<T>(source: () => T, format: (value: T) => string | null | undefined, options: AnnounceOptions = {}): () => void {
  const announcer = inject(LiveAnnouncer);
  const politeness = options.politeness ?? "polite";
  const interval = options.intervalMs ?? 1000;
  let lastSpoken = Number.NEGATIVE_INFINITY;
  let pending: { text: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let first = true;
  let stopped = false;

  const speak = (text: string) => {
    lastSpoken = Date.now();
    announcer.announce(text, politeness);
  };

  effect(() => {
    const value = source();
    if (stopped) return;
    if (first) {
      first = false;
      return;
    }
    untracked(() => {
      const text = format(value);
      if (!text) return;
      const wait = lastSpoken + interval - Date.now();
      if (wait <= 0 && timer === null) {
        speak(text);
        return;
      }
      pending = { text };
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          const p = pending;
          pending = null;
          if (p && !stopped) speak(p.text);
        }, Math.max(wait, 0));
      }
    });
  });

  const end = () => {
    stopped = true;
    pending = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  try {
    onCleanup(end);
  } catch {
    // Called outside a scope: it lives until the returned function is called.
  }
  return end;
}
