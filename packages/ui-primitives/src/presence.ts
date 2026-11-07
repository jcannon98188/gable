import { InjectionToken, effect, inject, input, signal, untracked, type InputSignal, type ReadonlySignal } from "@gable/core";
import { computedExitDuration, currentScope, holdRemoval, injectHost } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";

/**
 * How presence asks "does leaving play an animation or transition?" without assuming a DOM. Under a DOM renderer
 * nothing is needed (computed style). Other renderers (the in-memory test renderer) provide `PRESENCE_ENV`.
 */
export interface PresenceEnv {
  /**
   * Milliseconds the host's exit animation or transition takes, measured after `data-state` became "closed".
   * `null` means none: the node is released at once. `Infinity` means an animation with no known end (waits for its event only).
   */
  exitDuration(host: unknown): number | null;
}

/** Injection token that supplies a `PresenceEnv`. Provide it under a non-DOM renderer so `usePresence` can learn how long an exit animation runs; under a DOM renderer it falls back to computed style. */
export const PRESENCE_ENV = new InjectionToken<PresenceEnv>("PresenceEnv");

const END_EVENTS = ["animationend", "animationcancel", "transitionend", "transitioncancel"] as const;
/** Reads the animation and transition styles of the host (computed style). */
const domEnv: PresenceEnv = { exitDuration: computedExitDuration };

/** Slack added to the computed duration before giving up on an end event that never came (a transition that did not run). */
const FALLBACK_SLACK_MS = 100;

/** Zag prop getters set `hidden` the instant something closes. Delays it until presence has finished the exit. */
export function delayHidden<B extends Record<string, unknown> | null>(bag: B, presence: Presence): B {
  if (!bag || !bag.hidden) return bag;
  return { ...bag, hidden: presence.exited() };
}

/** What `usePresence` returns: the exit state of the host element, for delaying `hidden` or unmounting until an exit animation ends. */
export interface Presence {
  /** True once the host may be unmounted or hidden: it is closed and any exit animation has finished. */
  readonly exited: ReadonlySignal<boolean>;
}

/**
 * Presence for the element of the component whose Setup is running (call it in a field initialiser).
 *
 * - Sets `data-state` to "open" or "closed" on the host; style the exit with `[data-state=closed] { animation: ... }`.
 * - When `present` turns false, waits for the host's `animationend` / `transitionend` (listened on the host itself)
 *   and then sets `exited`; with no animation or transition `exited` is true at once. Use it to delay `hidden`.
 * - When the component is destroyed by `@if`, `@switch` or `@for` while present, the nodes stay mounted until the
 *   exit finishes (core `holdRemoval`). Destroyed during an exit already running, the same wait is kept.
 */
export function usePresence<N = unknown>(present: () => boolean, target: { renderer: Renderer<N>; host: N } = injectHost<N>()): Presence {
  const { renderer, host } = target;
  const env = inject(PRESENCE_ENV, { optional: true }) ?? domEnv;
  const exited = signal(!untracked(present));
  let wait: Promise<void> | null = null;
  let finishWait: () => void = () => {};

  const state = (open: boolean) => renderer.setAttribute(host, "data-state", open ? "open" : "closed");

  /** Begins waiting for the exit animation; null when there is none. */
  const startExit = (): Promise<void> | null => {
    if (wait) return wait;
    const ms = env.exitDuration(host);
    if (ms === null) return null;
    wait = new Promise<void>((resolve) => {
      const offs = END_EVENTS.map((name) =>
        renderer.listen(host, name, (event) => {
          const from = (event as { target?: unknown } | null)?.target;
          // animationend bubbles: only the host's own animation counts.
          if (from == null || from === host || (from as { node?: unknown }).node === host) finishWait();
        }),
      );
      const timer = Number.isFinite(ms) ? setTimeout(() => finishWait(), ms + FALLBACK_SLACK_MS) : undefined;
      finishWait = () => {
        for (const off of offs) off();
        if (timer !== undefined) clearTimeout(timer);
        wait = null;
        finishWait = () => {};
        resolve();
      };
    });
    return wait;
  };

  effect(() => {
    const open = present();
    untracked(() => {
      state(open);
      if (open) {
        finishWait(); // re-opened mid-exit
        exited.set(false);
      } else if (!exited()) {
        const pending = startExit();
        if (pending) void pending.then(() => untracked(present) || exited.set(true));
        else exited.set(true);
      }
    });
  });

  currentScope()?.onDispose(() => {
    if (!wait && untracked(present)) {
      state(false);
      startExit();
    }
    // Control flow is removing the nodes: keep them until the exit is over. Anything else (a teardown) has nothing to wait for.
    if (!(wait && holdRemoval(wait))) finishWait();
  });

  return { exited };
}

/**
 * Attribute directive form of `usePresence`: `<div uiPresence [present]="open()">`. Sets `data-state` and, when its
 * `@if`/`@switch` branch or `@for` row is removed, keeps that branch mounted until the exit animation has finished.
 * Note: a `present` bound to false from the start counts as closing once, which only plays an animation when the
 * closed state declares one while the element is still visible.
 */
export class UiPresence {
  static meta = { selector: "[uiPresence]" };
  present: InputSignal<boolean> = input(true);
  presence = usePresence(() => this.present());
}
