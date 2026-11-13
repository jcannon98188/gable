import { describe, expect, it } from "vitest";
import { createComponent, createInjector, flushSync, html } from "@gable/core";
import { createSceneTestRenderer } from "./testing.js";
import { createDrag, createLongPress, type DragEvent, type DragHandle, type LongPressEvent, type LongPressHandle } from "./gestures.js";

type Setup = (self: any) => void;

function build(template: ReturnType<typeof html>, setup: Setup) {
  const scene = createSceneTestRenderer();
  class Scene {
    static meta = { selector: "game-scene", template };
    _init = setup(this);
  }
  const ref = createComponent(Scene as never, { renderer: scene.renderer, parent: scene.root, injector: createInjector([...scene.renderer.providers!]) });
  return { scene, ref };
}

const dragTemplate = html`<sprite label="card" x="0" y="0" width="40" height="40" (pointerdown)="drag.down($event)" />`;
const pressTemplate = html`<sprite label="card" x="0" y="0" width="40" height="40" (pointerdown)="press.down($event)" />`;

describe("createDrag", () => {
  function setupDrag(log: string[], options: { threshold?: number } = {}) {
    let handle!: DragHandle;
    const { scene, ref } = build(dragTemplate, (self) => {
      self.drag = handle = createDrag({
        threshold: options.threshold,
        onStart: (e: DragEvent) => log.push(`start ${e.start.x},${e.start.y}`),
        onMove: (e: DragEvent) => log.push(`move ${e.position.x},${e.position.y} d${e.delta.x},${e.delta.y} s${e.step.x},${e.step.y}`),
        onEnd: (e: DragEvent) => log.push(`end ${e.position.x},${e.position.y} d${e.delta.x},${e.delta.y} cancelled=${e.cancelled}`),
      });
    });
    return { scene, ref, handle };
  }

  it("starts after the threshold, reports scene-space position, delta and step, and ends on release", () => {
    const log: string[] = [];
    const { scene, handle } = setupDrag(log, { threshold: 4 });
    scene.pointer.down(10, 10);
    scene.frame();
    expect(handle.dragging()).toBe(false);
    scene.pointer.move(12, 10);
    scene.frame();
    expect(log).toEqual([]);
    scene.pointer.move(20, 15);
    scene.frame();
    expect(log).toEqual(["start 10,10", "move 20,15 d10,5 s10,5"]);
    expect(handle.dragging()).toBe(true);
    scene.pointer.move(25, 15);
    scene.frame();
    expect(log[2]).toBe("move 25,15 d15,5 s5,0");
    scene.pointer.up(25, 15);
    scene.frame();
    expect(log[3]).toBe("end 25,15 d15,5 cancelled=false");
    expect(handle.dragging()).toBe(false);
  });

  it("a press that never leaves the threshold is a tap, not a drag", () => {
    const log: string[] = [];
    const { scene } = setupDrag(log);
    scene.pointer.down(10, 10);
    scene.frame();
    scene.pointer.move(11, 10);
    scene.pointer.up(11, 10);
    scene.frame();
    expect(log).toEqual([]);
  });

  it("ends when the pointer is released outside the node and outside the canvas", () => {
    const log: string[] = [];
    const { scene } = setupDrag(log, { threshold: 0 });
    scene.pointer.down(10, 10);
    scene.frame();
    scene.pointer.move(300, 300);
    scene.frame();
    scene.pointer.up(300, 300);
    scene.frame();
    expect(log.at(-1)).toBe("end 300,300 d290,290 cancelled=false");
  });

  it("only the left button drags by default; other buttons are ignored", () => {
    const log: string[] = [];
    const { scene } = setupDrag(log, { threshold: 0 });
    scene.pointer.down(10, 10, 2);
    scene.frame();
    scene.pointer.move(30, 30);
    scene.frame();
    expect(log).toEqual([]);
  });

  it("cancel() ends the drag with cancelled=true", () => {
    const log: string[] = [];
    const { scene, handle } = setupDrag(log, { threshold: 0 });
    scene.pointer.down(10, 10);
    scene.frame();
    scene.pointer.move(20, 10);
    scene.frame();
    handle.cancel();
    expect(log.at(-1)).toBe("end 20,10 d10,0 cancelled=true");
    scene.pointer.move(40, 10);
    scene.frame();
    expect(log.length).toBe(3);
  });

  it("cleans up with its scope: a drag in flight ends cancelled and later input is ignored", () => {
    const log: string[] = [];
    const { scene, ref } = setupDrag(log, { threshold: 0 });
    scene.pointer.down(10, 10);
    scene.frame();
    scene.pointer.move(20, 10);
    scene.frame();
    ref.destroy();
    expect(log.at(-1)).toBe("end 20,10 d10,0 cancelled=true");
    const n = log.length;
    scene.pointer.move(50, 50);
    scene.pointer.up(50, 50);
    scene.frame();
    flushSync();
    expect(log.length).toBe(n);
  });
});

describe("createLongPress", () => {
  function setupPress(log: string[], options: { delayMs?: number; tolerance?: number } = {}) {
    let handle!: LongPressHandle;
    const { scene, ref } = build(pressTemplate, (self) => {
      self.press = handle = createLongPress({
        delayMs: options.delayMs,
        tolerance: options.tolerance,
        onLongPress: (e: LongPressEvent) => log.push(`long ${e.position.x},${e.position.y}`),
      });
    });
    return { scene, ref, handle };
  }

  it("fires once after the delay while the pointer is held still (frame time, so tests are deterministic)", () => {
    const log: string[] = [];
    const { scene, handle } = setupPress(log, { delayMs: 500 });
    scene.pointer.down(10, 10);
    scene.frames(20, 16); // 320 ms
    expect(log).toEqual([]);
    expect(handle.pressing()).toBe(true);
    scene.frames(20, 16); // 640 ms
    expect(log).toEqual(["long 10,10"]);
    scene.frames(60, 16);
    expect(log).toEqual(["long 10,10"]);
  });

  it("is cancelled by release before the delay", () => {
    const log: string[] = [];
    const { scene, handle } = setupPress(log, { delayMs: 500 });
    scene.pointer.down(10, 10);
    scene.frames(10, 16);
    scene.pointer.up(10, 10);
    scene.frames(60, 16);
    expect(log).toEqual([]);
    expect(handle.pressing()).toBe(false);
  });

  it("is cancelled by moving beyond the tolerance, but not by a small wobble", () => {
    const log: string[] = [];
    const { scene } = setupPress(log, { delayMs: 300, tolerance: 8 });
    scene.pointer.down(10, 10);
    scene.frame();
    scene.pointer.move(14, 10);
    scene.frames(30, 16);
    expect(log).toEqual(["long 14,10"]);
    const log2: string[] = [];
    const b = setupPress(log2, { delayMs: 300, tolerance: 8 });
    b.scene.pointer.down(10, 10);
    b.scene.frame();
    b.scene.pointer.move(30, 10);
    b.scene.frames(30, 16);
    expect(log2).toEqual([]);
  });

  it("cleans up with its scope: a pending press never fires after the component is destroyed", () => {
    const log: string[] = [];
    const { scene, ref, handle } = setupPress(log, { delayMs: 300 });
    scene.pointer.down(10, 10);
    scene.frames(5, 16);
    ref.destroy();
    expect(handle.pressing()).toBe(false);
    scene.frames(60, 16);
    expect(log).toEqual([]);
  });
});
