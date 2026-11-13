// Drag and long-press helpers (TASK-105.12, TASK-104.8): gestures composed from a scene `pointerdown` and the Pointer
// service, not template syntax. Call them in a component's setup (they inject Pointer and Frame) and forward the
// event from the template: `<sprite (pointerdown)="drag.down($event)" />`. Everything they start is tied to the
// component's scope: when it is destroyed a drag in flight ends cancelled and a pending long-press never fires.
//
// The Pointer service is read through an effect, so a gesture sees the pointer as of the last effect flush (once per
// frame): moves within a frame coalesce to the latest position, which is what a per-frame game wants.
import { effect, inject, onCleanup, signal, untracked, type ReadonlySignal } from "@gable/core";
import { Frame } from "./frame.js";
import { Pointer, type PointerPoint } from "./pointer.js";

/** The slice of a scene `pointerdown` event the helpers read. */
export interface PressEventLike {
  /** 0 left, 1 middle, 2 right, as the DOM `PointerEvent.button`. */
  readonly button?: number;
}

// DOM `PointerEvent.buttons` bit of each `button` (0 left, 1 middle, 2 right).
const BUTTON_MASK = [1, 4, 2];
const maskOf = (button: number | undefined) => BUTTON_MASK[button ?? 0] ?? 1;
const distance = (a: PointerPoint, b: PointerPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export interface DragEvent {
  /** Where the press happened, in scene coordinates. */
  readonly start: PointerPoint;
  /** The pointer now, in scene coordinates. */
  readonly position: PointerPoint;
  /** `position - start`. */
  readonly delta: PointerPoint;
  /** Movement since the previous drag event (the first one is measured from `start`). */
  readonly step: PointerPoint;
  /** On `onEnd`: true when the drag was cancelled (`cancel()` or its scope ending) rather than released. */
  readonly cancelled: boolean;
}

export interface DragOptions {
  /** Distance in scene units the pointer must travel from the press before it is a drag. Default 4. A press that stays within it is a tap. */
  threshold?: number;
  /** Which button drags: 0 left (default), 1 middle, 2 right. */
  button?: number;
  onStart?(event: DragEvent): void;
  onMove?(event: DragEvent): void;
  onEnd?(event: DragEvent): void;
}

export interface DragHandle {
  /** Forward the node's `pointerdown` event here. */
  down(event?: PressEventLike): void;
  /** True between `onStart` and `onEnd`. */
  readonly dragging: ReadonlySignal<boolean>;
  /** Ends the gesture now (`onEnd` with `cancelled: true` if a drag was under way). */
  cancel(): void;
}

/** Drag from a node's `pointerdown`. Ends on release wherever the pointer is, including off the node and off the canvas. */
export function createDrag(options: DragOptions = {}): DragHandle {
  const pointer = inject(Pointer);
  const threshold = options.threshold ?? 4;
  const dragging = signal(false);
  let mask = 0;
  let pending = false; // pressed; the start point is taken at the next flush, once the Pointer service has seen the press
  let start: PointerPoint | null = null;
  let last: PointerPoint = { x: 0, y: 0 };
  let started = false;

  const event = (position: PointerPoint, cancelled: boolean): DragEvent => ({
    start: start!,
    position,
    delta: { x: position.x - start!.x, y: position.y - start!.y },
    step: { x: position.x - last.x, y: position.y - last.y },
    cancelled,
  });

  const finish = (cancelled: boolean) => {
    const wasStarted = started;
    if (wasStarted) {
      const e = event(last, cancelled);
      pending = false;
      started = false;
      dragging.set(false);
      start = null;
      options.onEnd?.(e);
    }
    pending = false;
    started = false;
    start = null;
    mask = 0;
  };

  effect(() => {
    const position = pointer.position();
    const buttons = pointer.buttons();
    untracked(() => {
      if (!mask) return;
      if (!(buttons & mask)) return finish(false);
      if (pending) {
        pending = false;
        start = position;
        last = position;
        return;
      }
      if (!start) return;
      if (!started) {
        if (distance(position, start) <= threshold) return;
        started = true;
        dragging.set(true);
        options.onStart?.(event(position, false));
      }
      const e = event(position, false);
      last = position;
      options.onMove?.(e);
    });
  });
  onCleanup(() => {
    finish(true);
  });

  return {
    down(e) {
      if (maskOf(e?.button ?? options.button) !== maskOf(options.button)) return;
      finish(true);
      mask = maskOf(options.button);
      pending = true;
    },
    dragging,
    cancel: () => finish(true),
  };
}

export interface LongPressEvent {
  /** Where the press happened, in scene coordinates. */
  readonly start: PointerPoint;
  /** The pointer when the delay elapsed, in scene coordinates. */
  readonly position: PointerPoint;
}

export interface LongPressOptions {
  /** How long the pointer must be held, in milliseconds of frame time. Default 500. */
  delayMs?: number;
  /** How far in scene units the pointer may drift before the press stops being a long-press. Default 10. */
  tolerance?: number;
  /** Which button: 0 left (default), 1 middle, 2 right. */
  button?: number;
  onLongPress(event: LongPressEvent): void;
}

export interface LongPressHandle {
  /** Forward the node's `pointerdown` event here. */
  down(event?: PressEventLike): void;
  /** True while a press is held and could still become a long-press. */
  readonly pressing: ReadonlySignal<boolean>;
  cancel(): void;
}

/**
 * Long-press from a node's `pointerdown`: `onLongPress` fires once if the pointer is held within `tolerance` for
 * `delayMs`. Time is counted in Frame dt, so it is deterministic under the scene test renderer.
 */
export function createLongPress(options: LongPressOptions): LongPressHandle {
  const pointer = inject(Pointer);
  const frame = inject(Frame);
  const delay = options.delayMs ?? 500;
  const tolerance = options.tolerance ?? 10;
  const mask = maskOf(options.button);
  const pressing = signal(false);
  let pending = false;
  let start: PointerPoint | null = null;
  let elapsed = 0;

  const cancel = () => {
    pending = false;
    start = null;
    elapsed = 0;
    if (untracked(pressing)) pressing.set(false);
  };

  effect(() => {
    const position = pointer.position();
    const buttons = pointer.buttons();
    untracked(() => {
      if (!untracked(pressing)) return;
      if (!(buttons & mask)) return cancel();
      if (pending) {
        pending = false;
        start = position;
        return;
      }
      if (start && distance(position, start) > tolerance) cancel();
    });
  });
  const offFrame = frame.onFrame((dt) => {
    if (!untracked(pressing) || pending || !start) return;
    elapsed += dt * 1000;
    if (elapsed < delay) return;
    const e: LongPressEvent = { start, position: untracked(() => pointer.position()) };
    cancel();
    options.onLongPress(e);
  });
  onCleanup(() => {
    offFrame();
    cancel();
  });

  return {
    down(e) {
      if (maskOf(e?.button) !== mask) return;
      cancel();
      pending = true;
      pressing.set(true);
    },
    pressing,
    cancel,
  };
}
