import { describe, expect, it } from "vitest";
import { createComponent, createInjector, html, inject, onCleanup, signal } from "@gablejs/core";
import { Frame, Gamepad, Keyboard, Pointer } from "../index.js";
import { createSceneTestRenderer } from "../testing.js";

function build(template: ReturnType<typeof html>, setup: (self: any) => void = () => {}, options = {}) {
  const scene = createSceneTestRenderer(options);
  class Scene {
    static meta = { selector: "game-scene", template };
    _init = setup(this);
  }
  const ref = createComponent(Scene as never, { renderer: scene.renderer, parent: scene.root, injector: createInjector([...scene.renderer.providers!]) });
  return { scene, ref };
}

describe("scene.pointer", () => {
  it("hit-tests declared sizes and fires the template event path with a Pixi-shaped $event, bubbling", () => {
    const log: string[] = [];
    const { scene } = build(
      html`<container label="panel" (pointerdown)="onPanel($event)"><sprite label="btn" x="10" y="10" width="20" height="20" (pointerdown)="onBtn($event)" (pointertap)="tapped()" /></container>`,
      (self) => {
        self.onBtn = (e: any) => log.push(`btn ${e.type} ${e.global.x},${e.global.y} ${e.target.label} ${e.currentTarget.label}`);
        self.onPanel = (e: any) => log.push(`panel ${e.target.label}`);
        self.tapped = () => log.push("tap");
      },
    );
    scene.pointer.down(15, 15);
    expect(log).toEqual(["btn pointerdown 15,15 btn btn", "panel btn"]);
    log.length = 0;
    scene.pointer.down(100, 100);
    expect(log).toEqual([]);
    scene.pointer.tap(12, 12);
    expect(log).toContain("tap");
  });

  it("respects hitArea, zIndex stacking, visibility and eventMode none", () => {
    const hits: string[] = [];
    const area = signal({ x: 0, y: 0, width: 50, height: 50 });
    const { scene } = build(
      html`<container label="back" width="100" height="100" (pointerdown)="hit('back')" /><container label="front" zIndex="1" [hitArea]="area()" (pointerdown)="hit('front')" /><container label="ghost" zIndex="2" visible="false" width="100" height="100" (pointerdown)="hit('ghost')" />`,
      (self) => {
        self.hit = (n: string) => hits.push(n);
        self.area = area;
      },
    );
    scene.pointer.down(10, 10);
    scene.pointer.down(80, 80);
    expect(hits).toEqual(["front", "back"]);
    expect(scene.hitTest(80, 80)?.label).toBe("back");
  });

  it("fires pointerupoutside on the pressed node when released elsewhere, and no tap", () => {
    const log: string[] = [];
    const { scene } = build(html`<container label="a" width="10" height="10" (pointerup)="log('up')" (pointerupoutside)="log('outside')" (pointertap)="log('tap')" />`, (self) => {
      self.log = (s: string) => log.push(s);
    });
    scene.pointer.down(5, 5);
    scene.pointer.up(200, 200);
    expect(log).toEqual(["outside"]);
  });

  it("reaches the real Pointer service: position, buttons and overCanvas", () => {
    let pointer!: Pointer;
    const { scene } = build(html``, () => {
      pointer = inject(Pointer);
    });
    scene.pointer.move(30, 40);
    expect(pointer.position()).toEqual({ x: 30, y: 40 });
    expect(pointer.overCanvas()).toBe(true);
    scene.pointer.down(30, 40);
    expect(pointer.buttons()).toBe(1);
    scene.pointer.down(30, 40, 2);
    expect(pointer.buttons()).toBe(3);
    scene.pointer.up(30, 40);
    scene.pointer.up(30, 40, 2);
    expect(pointer.buttons()).toBe(0);
    scene.pointer.leave();
    expect(pointer.overCanvas()).toBe(false);
  });

  it("fires hover transitions", () => {
    const log: string[] = [];
    const { scene } = build(html`<container label="a" width="10" height="10" (pointerover)="log('over')" (pointerout)="log('out')" (pointerenter)="log('enter')" (pointerleave)="log('leave')" />`, (self) => {
      self.log = (s: string) => log.push(s);
    });
    scene.pointer.move(5, 5);
    scene.pointer.move(6, 6);
    scene.pointer.move(50, 50);
    expect(log).toEqual(["over", "enter", "out", "leave"]);
  });
});

describe("scene.keyboard", () => {
  it("drives the real Keyboard service: isDown live, justPressed and justReleased per frame", () => {
    const seen: string[] = [];
    let keys!: Keyboard;
    const { scene } = build(html``, (self) => {
      keys = inject(Keyboard);
      inject(Frame).onFrame(() => {
        if (keys.justPressed("Space")) seen.push("pressed");
        if (keys.justReleased("Space")) seen.push("released");
      });
      void self;
    });
    scene.keyboard.press("Space");
    expect(keys.isDown("Space")).toBe(true);
    expect(keys.keys().has("Space")).toBe(true);
    scene.frame();
    scene.frame();
    scene.keyboard.release("Space");
    scene.frame();
    scene.frame();
    expect(seen).toEqual(["pressed", "released"]);
    scene.keyboard.press("KeyA");
    scene.keyboard.blur();
    expect(keys.isDown("KeyA")).toBe(false);
  });
});

describe("scene.gamepad", () => {
  it("connects, moves axes and buttons, and disconnects through the real Gamepad service at frame boundaries", () => {
    let pad!: Gamepad;
    const { scene } = build(html``, () => {
      pad = inject(Gamepad);
    });
    scene.gamepad.connect(0, { id: "Test Pad" });
    expect(pad.pads()).toEqual([]);
    scene.frame();
    expect(pad.pads()[0]).toMatchObject({ index: 0, id: "Test Pad" });
    expect(pad.connected()?.id).toBe("Test Pad");
    scene.gamepad.setAxis(0, 0, -0.75);
    scene.gamepad.setButton(0, 0, true);
    scene.frame();
    expect(pad.pads()[0]!.axes[0]).toBe(-0.75);
    expect(pad.pads()[0]!.buttons[0]).toMatchObject({ pressed: true, value: 1 });
    scene.gamepad.disconnect(0);
    scene.frame();
    expect(pad.pads()).toEqual([]);
    expect(pad.disconnected()?.index).toBe(0);
    expect(() => scene.gamepad.setAxis(3, 0, 1)).toThrow(/No simulated gamepad/);
  });
});

describe("scene.frame", () => {
  it("runs hooks, flushes effects synchronously, then records a render, per step", () => {
    const x = signal(0);
    const order: string[] = [];
    const { scene } = build(html`<sprite label="s" [x]="x()" />`, (self) => {
      self.x = x;
      inject(Frame).onFrame((dt) => {
        order.push(`hook ${dt}`);
        x.update((n) => n + 1);
      });
    });
    expect(scene.find("sprite#s")!.x).toBe(0);
    scene.frame(16);
    expect(scene.find("sprite#s")!.x).toBe(1); // the hook's write was flushed before the frame ended
    expect(scene.renders).toBe(1);
    scene.frames(3, 16);
    expect(scene.find("sprite#s")!.x).toBe(4);
    expect(scene.renders).toBe(4);
    expect(order[0]).toBe("hook 0.016");
  });

  it("advances onFixedStep by accumulated time, 60 Hz in 100 ms being six steps", () => {
    let steps = 0;
    build(html``, () => {
      inject(Frame).onFixedStep(60, () => steps++);
    }).scene.frames(2, 50);
    expect(steps).toBe(6);
  });

  it("clamps one frame's dt like production (a 500 ms stall is one 50 ms frame)", () => {
    const dts: number[] = [];
    const { scene } = build(html``, () => {
      inject(Frame).onFrame((dt) => dts.push(dt));
    });
    scene.frame(500);
    expect(dts).toEqual([0.05]);
  });

  it("renders only after a change in on-demand mode", () => {
    const x = signal(0);
    const { scene } = build(html`<sprite [x]="x()" />`, (self) => (self.x = x), { renderMode: "on-demand" });
    scene.frame();
    expect(scene.renders).toBe(1);
    scene.frame();
    expect(scene.renders).toBe(1);
    x.set(5);
    scene.frame();
    expect(scene.renders).toBe(2);
  });

  it("removes frame hooks when the component's scope ends and releases the scene on destroy", () => {
    let runs = 0;
    const { scene, ref } = build(html`<sprite label="s" />`, () => {
      inject(Frame).onFrame(() => runs++);
      onCleanup(() => {});
    });
    scene.frame();
    expect(runs).toBe(1);
    ref.destroy();
    scene.frame();
    expect(runs).toBe(1);
    expect(scene.find("sprite")).toBeNull();
    scene.renderer.destroy!();
    expect(scene.destroyed).toBe(true);
    scene.renderer.destroy!();
  });
});
