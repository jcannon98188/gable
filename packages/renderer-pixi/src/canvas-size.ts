import { signal, type WritableSignal } from "@gable/core";

/**
 * What a scene sees of its host's canvas: the CSS size in CSS pixels and the device pixel ratio the buffer uses.
 * Signals, so scenes lay themselves out reactively. Injectable anywhere inside a `<gable-canvas>`.
 * Kept free of any pixi.js import so reading it never loads Pixi.
 */
export class CanvasSize {
  readonly width: WritableSignal<number> = signal(0);
  readonly height: WritableSignal<number> = signal(0);
  readonly pixelRatio: WritableSignal<number> = signal(1);
}
