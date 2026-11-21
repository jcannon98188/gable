// The Pointer service (canvas/113): where the pointer is, which buttons are down and whether it is over the canvas, as
// signals. Driven by the stage's federated pointer events. Free of any pixi.js import.
import { signal, type WritableSignal } from "@gablejs/core";

/** A point in scene coordinates. */
export interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

/** The slice of a Pixi event the service reads. */
interface PointerEventLike {
  readonly global: PointerPoint;
  readonly buttons: number;
}

/** The slice of the stage the service listens on. */
export interface PointerStage {
  on(name: string, handler: (event: PointerEventLike) => void): unknown;
  off(name: string, handler: (event: PointerEventLike) => void): unknown;
}

/**
 * Provided at every canvas boundary. `position` is in scene coordinates (the scene root's space, so it follows a scene
 * that is moved or scaled), `buttons` is the DOM `PointerEvent.buttons` bitmask (1 left, 2 right, 4 middle) and
 * `overCanvas` is true while the pointer is inside the canvas. Drag and long-press compose these with scene events.
 */
export class Pointer {
  readonly position: WritableSignal<PointerPoint> = signal({ x: 0, y: 0 });
  readonly buttons: WritableSignal<number> = signal(0);
  readonly overCanvas: WritableSignal<boolean> = signal(false);

  /** Called by the renderer once the stage exists. `toScene` maps a stage (canvas) point into scene coordinates. Returns the detach function. */
  attach(stage: PointerStage, toScene: (point: PointerPoint) => PointerPoint): () => void {
    const move = (e: PointerEventLike) => {
      const p = toScene(e.global);
      this.position.set({ x: p.x, y: p.y });
      this.buttons.set(e.buttons);
    };
    const buttons = (e: PointerEventLike) => {
      this.buttons.set(e.buttons);
      const p = toScene(e.global);
      this.position.set({ x: p.x, y: p.y });
    };
    const enter = () => this.overCanvas.set(true);
    const leave = () => this.overCanvas.set(false);
    const handlers: Array<[string, (e: PointerEventLike) => void]> = [
      ["pointermove", move],
      ["pointerdown", buttons],
      ["pointerup", buttons],
      ["pointerupoutside", buttons],
      ["pointercancel", buttons],
      ["pointerenter", enter],
      ["pointerleave", leave],
    ];
    for (const [name, fn] of handlers) stage.on(name, fn);
    return () => {
      for (const [name, fn] of handlers) stage.off(name, fn);
    };
  }
}
