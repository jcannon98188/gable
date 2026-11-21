// The Gamepad service (canvas/113): the connected pads as a per-frame snapshot, polled once per frame in the Gable-owned
// loop, plus connect and disconnect signals. No remapping layer. Free of any pixi.js import.
import { signal, type WritableSignal } from "@gable/core";

/** A copy of one gamepad button as of the polled frame: whether it is pressed or touched, and its analogue value. */
export interface GamepadButtonSnapshot {
  readonly pressed: boolean;
  readonly touched: boolean;
  readonly value: number;
}

/** A copy of one pad's state as of the frame it was polled. */
export interface GamepadSnapshot {
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonSnapshot[];
}

/** What `navigator.getGamepads()` returns, structurally (so tests can supply their own). */
export interface GamepadSource {
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
  readonly connected?: boolean;
  readonly axes: ArrayLike<number>;
  readonly buttons: ArrayLike<{ readonly pressed: boolean; readonly touched?: boolean; readonly value: number }>;
}
/** A function returning the current gamepads, like `navigator.getGamepads`; disconnected slots are `null`. Pass one as the `getGamepads` renderer option to supply your own source. */
export type GetGamepads = () => ArrayLike<GamepadSource | null>;

/**
 * Provided at every canvas boundary. `pads` is replaced each frame a pad is connected; `connected` and `disconnected`
 * hold the most recent pad that appeared or went away (null until it happens).
 */
export class Gamepad {
  readonly pads: WritableSignal<readonly GamepadSnapshot[]> = signal<readonly GamepadSnapshot[]>([]);
  readonly connected: WritableSignal<GamepadSnapshot | null> = signal<GamepadSnapshot | null>(null);
  readonly disconnected: WritableSignal<GamepadSnapshot | null> = signal<GamepadSnapshot | null>(null);
  #source: GetGamepads | null = null;

  /** Called by the renderer with the platform's `getGamepads` (absent where there is no Gamepad API). */
  attach(source: GetGamepads | null): void {
    this.#source = source;
  }

  /** Polls the platform once. The boundary's loop calls this at the start of every frame. */
  beginFrame(): void {
    if (!this.#source) return;
    const previous = this.pads();
    const now: GamepadSnapshot[] = [];
    const list = this.#source();
    for (let i = 0; i < list.length; i++) {
      const pad = list[i];
      if (!pad || pad.connected === false) continue;
      now.push({
        index: pad.index,
        id: pad.id,
        mapping: pad.mapping,
        axes: Array.from(pad.axes),
        buttons: Array.from(pad.buttons, (b) => ({ pressed: b.pressed, touched: b.touched ?? b.pressed, value: b.value })),
      });
    }
    if (previous.length === 0 && now.length === 0) return;
    for (const pad of now) if (!previous.some((p) => p.index === pad.index)) this.connected.set(pad);
    for (const pad of previous) if (!now.some((p) => p.index === pad.index)) this.disconnected.set(pad);
    this.pads.set(now);
  }
}
