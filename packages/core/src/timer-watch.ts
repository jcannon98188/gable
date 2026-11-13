// Dev only: counts raw setInterval / setTimeout calls made while a component's Setup runs, so a renderer that asks for it
// (`Renderer.warnRawTimers`) can warn about timers nothing will clear. Services the Setup injects are not counted: they own
// their timers. Every call site is behind `DEV`, so a production build drops all of it.
import { DEV } from "./dev-hooks.js";

/** Bumped by `onCleanup`, so a Setup that registered one can be told from one that did not. */
export const cleanupCalls = { count: 0 };

interface Watch {
  setInterval: number;
  setTimeout: number;
  paused: number;
}

let active: Watch | null = null;

/** Runs `setup`; returns what it returned and how many raw timers of each kind it started (services it constructed excluded). */
export function watchTimers<T>(setup: () => T): { value: T; setInterval: number; setTimeout: number } {
  if (!DEV) return { value: setup(), setInterval: 0, setTimeout: 0 };
  const watch: Watch = { setInterval: 0, setTimeout: 0, paused: 0 };
  const outer = active;
  const g = globalThis as { setInterval: Function; setTimeout: Function };
  const original = { setInterval: g.setInterval, setTimeout: g.setTimeout };
  const wrap = (kind: "setInterval" | "setTimeout") =>
    function (this: unknown, ...args: unknown[]) {
      if (active === watch && watch.paused === 0) watch[kind]++;
      return original[kind].apply(this, args);
    };
  g.setInterval = wrap("setInterval");
  g.setTimeout = wrap("setTimeout");
  active = watch;
  try {
    const value = setup();
    return { value, setInterval: watch.setInterval, setTimeout: watch.setTimeout };
  } finally {
    active = outer;
    g.setInterval = original.setInterval;
    g.setTimeout = original.setTimeout;
  }
}

/** Runs `construct` (a service's constructor) with the watch paused, so its timers are not blamed on the component. */
export function unwatchTimers<T>(construct: () => T): T {
  if (!DEV || !active) return construct();
  const watch = active;
  watch.paused++;
  try {
    return construct();
  } finally {
    watch.paused--;
  }
}
