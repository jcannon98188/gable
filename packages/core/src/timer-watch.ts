// Dev only: counts raw setInterval / setTimeout calls made while a component's Setup runs, so a renderer that asks for it
// (`Renderer.warnRawTimers`) can warn about timers nothing will clear. Services the Setup injects are not counted: they own
// their timers. Every call site is behind `DEV`, so a production build drops all of it.
import { DEV } from "./dev-hooks.js";

/** Bumped by `onCleanup`, so a Setup that registered one can be told from one that did not. */
export const cleanupCalls = { count: 0 };

/** One raw timer a Setup started. `settled` once it was cleared (or, for a setTimeout, fired). */
export interface WatchedTimer {
  kind: "setInterval" | "setTimeout";
  id: unknown;
  settled: boolean;
}

interface Watch {
  setInterval: number;
  setTimeout: number;
  paused: number;
  timers: WatchedTimer[];
}

let active: Watch | null = null;

/** Runs `setup`; returns what it returned and how many raw timers of each kind it started (services it constructed excluded). */
export function watchTimers<T>(setup: () => T): { value: T; setInterval: number; setTimeout: number; timers: WatchedTimer[] } {
  if (!DEV) return { value: setup(), setInterval: 0, setTimeout: 0, timers: [] };
  const watch: Watch = { setInterval: 0, setTimeout: 0, paused: 0, timers: [] };
  const outer = active;
  const g = globalThis as { setInterval: Function; setTimeout: Function };
  const original = { setInterval: g.setInterval, setTimeout: g.setTimeout };
  const wrap = (kind: "setInterval" | "setTimeout") =>
    function (this: unknown, ...args: unknown[]) {
      if (!(active === watch && watch.paused === 0)) return original[kind].apply(this, args);
      watch[kind]++;
      const timer: WatchedTimer = { kind, id: undefined, settled: false };
      // A one-shot that already fired needs no clearing.
      if (kind === "setTimeout" && typeof args[0] === "function") {
        const handler = args[0] as Function;
        args[0] = function (this: unknown, ...rest: unknown[]) {
          timer.settled = true;
          return handler.apply(this, rest);
        };
      }
      timer.id = original[kind].apply(this, args);
      watch.timers.push(timer);
      return timer.id;
    };
  g.setInterval = wrap("setInterval");
  g.setTimeout = wrap("setTimeout");
  active = watch;
  try {
    const value = setup();
    return { value, setInterval: watch.setInterval, setTimeout: watch.setTimeout, timers: watch.timers };
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

/**
 * Watches `clearInterval` / `clearTimeout` until the returned function is called, marking matching timers settled. The component
 * installs it when its scope starts to dispose and calls the returned function a microtask later, so the cleanups in between are seen.
 */
export function observeClears(timers: WatchedTimer[]): () => void {
  const g = globalThis as unknown as Record<string, Function>;
  const names = ["clearInterval", "clearTimeout"] as const;
  const original = { clearInterval: g.clearInterval, clearTimeout: g.clearTimeout };
  const installed: Record<string, Function> = {};
  for (const name of names) {
    installed[name] = g[name] = function (this: unknown, id: unknown) {
      for (const timer of timers) if (timer.id === id) timer.settled = true;
      return original[name].apply(this, [id]);
    };
  }
  return () => {
    for (const name of names) if (g[name] === installed[name]) g[name] = original[name];
  };
}
