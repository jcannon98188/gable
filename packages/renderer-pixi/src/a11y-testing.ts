// The recorded twin of the DOM mirror, for the scene test renderer (canvas/115, canvas/116): the same A11yMirror, but
// its sink only records, and focus movement is simulated. Free of any pixi.js or DOM import.
import type { A11yEntry, A11yMirror, A11yNode, A11ySink } from "./a11y.js";

export type TabOptions = { shift?: boolean };

/**
 * Attaches itself to `mirror` as its sink. `a11y()` is what the DOM mirror would hold (role, label, bounds, order); `focus`,
 * `tab`, `press` and `click` simulate what a user does there. Focus is `"host"` when the host itself is the tab stop (no
 * focusable mirror elements), the focused node, or `null` when focus is outside the canvas. There is no trap: `tab()` past the
 * last stop leaves, and `press` never consumes Tab or Escape.
 */
export class A11yRecorder<N extends A11yNode = A11yNode> implements A11ySink<N> {
  #entries: readonly A11yEntry<N>[] = [];
  #focused: N | "host" | null = null;

  constructor(readonly mirror: A11yMirror<N>) {
    mirror.attach(this);
  }

  render(entries: readonly A11yEntry<N>[]): void {
    this.#entries = entries;
    if (this.#focused !== null && this.#focused !== "host" && !entries.some((e) => e.node === this.#focused && e.focusable)) this.#focused = null;
  }

  destroy(): void {
    this.#entries = [];
    this.#focused = null;
  }

  /** The mirror elements, in tab order. */
  a11y(): readonly A11yEntry<N>[] {
    return this.#entries;
  }

  get focused(): N | "host" | null {
    return this.#focused;
  }

  /** Focuses the node's mirror element. False when the node has no focusable mirror. */
  focus(node: N): boolean {
    if (!this.#entries.some((e) => e.node === node && e.focusable)) return false;
    this.#focused = node;
    return true;
  }

  /** Moves focus with Tab (or Shift+Tab). Returns the new focus: a node, `"host"`, or `null` once focus has left the canvas. */
  tab(options: TabOptions = {}): N | "host" | null {
    const stops = this.#entries.filter((e) => e.focusable).map((e) => e.node);
    const forward = !options.shift;
    if (stops.length === 0) {
      this.#focused = this.#focused === null ? "host" : null;
      return this.#focused;
    }
    const at = this.#focused === null || this.#focused === "host" ? -1 : stops.indexOf(this.#focused);
    if (this.#focused === null) this.#focused = forward ? stops[0]! : stops[stops.length - 1]!;
    else if (this.#focused === "host") this.#focused = null;
    else this.#focused = stops[at + (forward ? 1 : -1)] ?? null;
    return this.#focused;
  }

  /** A key pressed on the focused element. Enter and Space activate it; true when something was activated. Tab and Escape are never consumed. */
  press(key: string): boolean {
    if (key !== "Enter" && key !== "Space" && key !== " ") return false;
    const node = this.#focused;
    return node !== null && node !== "host" && this.mirror.activate(node);
  }

  /** A click on the node's mirror element (what a screen reader's "activate" does). */
  click(node: N): boolean {
    return this.#entries.some((e) => e.node === node) && this.mirror.activate(node);
  }
}
