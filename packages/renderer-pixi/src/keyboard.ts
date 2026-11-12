// The Keyboard service (TASK-104.8): polled per-frame key state for frame hooks plus a signal for templates. Keys are
// `KeyboardEvent.code` values (layout independent). Free of any pixi.js import.
import { signal, type WritableSignal } from "@gable/core";

/**
 * Provided at every canvas boundary. By default it listens on the canvas host, so it is active only while the host has
 * focus (the host takes a tab index and pointer down focuses it); `keyboard: "global"` listens on the window instead.
 * Losing focus releases every held key. It never calls `preventDefault`; discrete handling stays an ordinary `(keydown)` binding on the DOM host.
 *
 * `isDown` is live. `justPressed` and `justReleased` describe the changes since the previous frame and hold for exactly
 * the frame the boundary's loop is running (read them from `Frame` hooks).
 */
export class Keyboard {
  /** The codes currently held, as a signal for templates. */
  readonly keys: WritableSignal<ReadonlySet<string>> = signal<ReadonlySet<string>>(new Set());
  #pressed = new Set<string>();
  #released = new Set<string>();
  #justPressed: ReadonlySet<string> = new Set();
  #justReleased: ReadonlySet<string> = new Set();

  isDown(code: string): boolean {
    return this.keys().has(code);
  }
  justPressed(code: string): boolean {
    return this.#justPressed.has(code);
  }
  justReleased(code: string): boolean {
    return this.#justReleased.has(code);
  }

  /** Latches the changes since the previous frame. The boundary's loop calls this at the start of every frame; tests and doubles call it to step a frame. */
  beginFrame(): void {
    this.#justPressed = this.#pressed;
    this.#justReleased = this.#released;
    this.#pressed = new Set();
    this.#released = new Set();
  }

  /** Called by the renderer. Returns the detach function. */
  attach(target: EventTarget, scope: "host" | "global"): () => void {
    const down = (e: Event) => {
      const event = e as KeyboardEvent;
      if (event.repeat || this.keys().has(event.code)) return;
      this.#pressed.add(event.code);
      this.keys.set(new Set(this.keys()).add(event.code));
    };
    const up = (e: Event) => {
      const code = (e as KeyboardEvent).code;
      if (!this.keys().has(code)) return;
      const next = new Set(this.keys());
      next.delete(code);
      this.#released.add(code);
      this.keys.set(next);
    };
    const releaseAll = () => {
      if (this.keys().size === 0) return;
      for (const code of this.keys()) this.#released.add(code);
      this.keys.set(new Set());
    };
    const loseName = scope === "host" ? "focusout" : "blur";
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    target.addEventListener(loseName, releaseAll);
    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener(loseName, releaseAll);
    };
  }
}
