// The ReducedMotion service (canvas/116): the user's `prefers-reduced-motion` setting as a signal. The framework has no
// motion of its own to respect; scenes read this to tone down their own (shake, parallax, particles). Free of any pixi.js import.
import { signal, type WritableSignal } from "@gablejs/core";

/** The slice of `window.matchMedia` the service uses. */
export type MatchMedia = (query: string) => MediaQueryListLike;

/** The slice of `MediaQueryList` the `ReducedMotion` service uses: the current match and change listeners. */
export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
}

const QUERY = "(prefers-reduced-motion: reduce)";

/** Provided at every canvas boundary. `reduced()` is true while the user asks for reduced motion, and follows changes to the setting. False where there is no `matchMedia`. */
export class ReducedMotion {
  readonly reduced: WritableSignal<boolean> = signal(false);

  /** Called by the renderer. `null` means no media query source. Returns the detach function. */
  attach(matchMedia: MatchMedia | null): () => void {
    if (!matchMedia) {
      this.reduced.set(false);
      return () => {};
    }
    const mql = matchMedia(QUERY);
    const onChange = (event: { matches: boolean }) => this.reduced.set(event.matches);
    this.reduced.set(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
}
