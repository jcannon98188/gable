// Simulated input for the scene test renderer (canvas/127). The real Pointer, Keyboard and Gamepad services are attached
// exactly as the Pixi renderer attaches them (a stage with federated pointer events, a focused host element, a
// `getGamepads` source), so a test exercises the production code path; only the event source is simulated.
import type { Gamepad, GamepadSource } from "../gamepad.js";
import type { Keyboard } from "../keyboard.js";
import type { Pointer } from "../pointer.js";
import { SceneNode, apply, invert, paintOrder, worldMatrix, type Point, type StubTexture } from "./node.js";

/** Simulated pointer input for the scene test renderer, in scene coordinates. It drives the real Pointer service and fires the scene events on the hit node as the Pixi renderer would. */
export interface PointerSimulator {
  /** Moves the pointer to scene (x, y): hover transitions (`pointerover`, `pointerout`, enter and leave), then `pointermove`. */
  move(x: number, y: number): void;
  /** Presses a button (0 left, 1 middle, 2 right) at (x, y): `pointerdown` and `mousedown` (`rightdown` for the right button) on the hit node, bubbling. */
  down(x: number, y: number, button?: number): void;
  /** Releases at (x, y): `pointerup`, or `pointerupoutside` on the pressed node when released elsewhere; a release on the pressed node also fires `pointertap` and `click`. */
  up(x: number, y: number, button?: number): void;
  /** `down` then `up` at the same point. */
  tap(x: number, y: number, button?: number): void;
  /** The pointer leaves the canvas: `pointerleave` and `overCanvas` false. */
  leave(): void;
}

/** Simulated keyboard input for the scene test renderer. It drives the real Keyboard service. */
export interface KeyboardSimulator {
  /** Holds a key (a `KeyboardEvent.code`). Pressing a held key does nothing, as in the browser's auto-repeat filter. */
  press(code: string): void;
  release(code: string): void;
  /** The host loses focus: every held key is released. */
  blur(): void;
}

/** Simulated gamepads for the scene test renderer. State reaches the Gamepad service at the next frame, as with a polled device. */
export interface GamepadSimulator {
  /** Plugs a pad in at `index` (default 0). Its state reaches `Gamepad.pads` at the next frame. */
  connect(index?: number, options?: { id?: string; axes?: number; buttons?: number }): void;
  disconnect(index?: number): void;
  setAxis(index: number, axis: number, value: number): void;
  /** `true` or `false`, or an analogue value (pressed from 0.5 up). */
  setButton(index: number, button: number, state: boolean | number): void;
}

interface Pad {
  id: string;
  axes: number[];
  buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
}

/** A Pixi-shaped federated event, the `$event` of a scene event binding. */
class SceneEvent {
  readonly bubbles = true;
  readonly pointerId = 1;
  readonly pointerType = "mouse";
  readonly isPrimary = true;
  readonly global: Point;
  readonly screen: Point;
  readonly client: Point;
  readonly page: Point;
  target: unknown;
  currentTarget: unknown = null;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(
    readonly type: string,
    point: Point,
    readonly buttons: number,
    readonly button: number,
  ) {
    this.global = { ...point };
    this.screen = { ...point };
    this.client = { ...point };
    this.page = { ...point };
  }
  get x() {
    return this.client.x;
  }
  get y() {
    return this.client.y;
  }
  getLocalPosition(node: SceneNode): Point {
    const inv = invert(worldMatrix(node));
    return inv ? apply(inv, this.global) : { x: NaN, y: NaN };
  }
  stopPropagation() {
    this.propagationStopped = true;
  }
  stopImmediatePropagation() {
    this.propagationStopped = true;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
}

type Rect = { x: number; y: number; width: number; height: number };

/** A node's local size as the author gave it: `width` and `height`, else a sprite's stub texture, else its graphics shapes. */
export function localBox(node: SceneNode): Rect | null {
  if (node.kind !== "node") return null;
  const v = node.values;
  const texture = v.texture as StubTexture | null | undefined;
  const width = (v.width as number | undefined) ?? texture?.width;
  const height = (v.height as number | undefined) ?? texture?.height;
  if (width !== undefined && height !== undefined) {
    const anchor = (v.anchor as Point | undefined) ?? { x: 0, y: 0 };
    return { x: -anchor.x * width, y: -anchor.y * height, width, height };
  }
  if (node.tag === "graphics" && node.shapes.length) {
    let box: Rect | null = null;
    for (const s of node.shapes) {
      const r = shapeBox(s);
      if (!r) continue;
      box = box ? union(box, r) : r;
    }
    return box;
  }
  return null;
}

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

function shapeBox(s: SceneNode): Rect | null {
  const n = (k: string) => (s.values[k] as number | undefined) ?? 0;
  switch (s.tag.replace(/^hit-/, "")) {
    case "rect":
    case "rounded-rect":
      return { x: n("x"), y: n("y"), width: n("width"), height: n("height") };
    case "circle":
      return { x: n("x") - n("radius"), y: n("y") - n("radius"), width: n("radius") * 2, height: n("radius") * 2 };
    case "ellipse":
      return { x: n("x") - n("halfWidth"), y: n("y") - n("halfHeight"), width: n("halfWidth") * 2, height: n("halfHeight") * 2 };
    case "polygon": {
      const pts = (s.values.points as number[] | undefined) ?? [];
      if (pts.length < 2) return null;
      const xs = pts.filter((_, i) => i % 2 === 0);
      const ys = pts.filter((_, i) => i % 2 === 1);
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }
    default:
      return null;
  }
}

function shapeContains(s: SceneNode, p: Point): boolean {
  const n = (k: string) => (s.values[k] as number | undefined) ?? 0;
  switch (s.tag.replace(/^hit-/, "")) {
    case "circle":
      return (p.x - n("x")) ** 2 + (p.y - n("y")) ** 2 <= n("radius") ** 2;
    case "ellipse": {
      const hw = n("halfWidth");
      const hh = n("halfHeight");
      return hw > 0 && hh > 0 && ((p.x - n("x")) / hw) ** 2 + ((p.y - n("y")) / hh) ** 2 <= 1;
    }
    case "polygon": {
      const pts = (s.values.points as number[] | undefined) ?? [];
      let inside = false;
      for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
        const xi = pts[i]!, yi = pts[i + 1]!, xj = pts[j]!, yj = pts[j + 1]!;
        if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    default: {
      const r = shapeBox(s);
      return !!r && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
    }
  }
}

/** Whether a point in the node's local space is inside its hit shapes, its `hitArea`, its graphics, or its declared size. */
function contains(node: SceneNode, p: Point): boolean {
  if (node.hitShapes.length) return node.hitShapes.some((s) => shapeContains(s, p));
  const area = node.values.hitArea as Record<string, any> | null | undefined;
  if (area) {
    if (typeof area.contains === "function") return !!area.contains(p.x, p.y);
    if (typeof area.radius === "number") return (p.x - (area.x ?? 0)) ** 2 + (p.y - (area.y ?? 0)) ** 2 <= area.radius ** 2;
    if (typeof area.width === "number" && typeof area.height === "number") {
      const x = area.x ?? 0;
      const y = area.y ?? 0;
      return p.x >= x && p.x <= x + area.width && p.y >= y && p.y <= y + area.height;
    }
    return false;
  }
  if (node.tag === "graphics" && node.shapes.length) return node.shapes.some((s) => shapeContains(s, p));
  const box = localBox(node);
  return !!box && p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

interface Options {
  root: SceneNode;
  pointerService: Pointer;
  keyboardService: Keyboard;
  gamepadService: Gamepad;
  touch(): void;
}

export function createInputSimulators({ root, pointerService, keyboardService, gamepadService, touch }: Options) {
  // --- hit testing -----------------------------------------------------------------------------------------------
  const interactive = (n: SceneNode) => n.values.eventMode === "static" || n.values.eventMode === "dynamic";

  function hitIn(node: SceneNode, x: number, y: number): SceneNode | null {
    if (node.values.visible === false || node.values.eventMode === "none") return null;
    if (node.values.interactiveChildren !== false) {
      const kids = paintOrder(node);
      for (let i = kids.length - 1; i >= 0; i--) {
        const found = hitIn(kids[i]!, x, y);
        if (found) return found;
      }
    }
    if (!interactive(node) || node === root) return null;
    const inv = invert(worldMatrix(node));
    return inv && contains(node, apply(inv, { x, y })) ? node : null;
  }
  const hit = (x: number, y: number) => hitIn(root, x, y);

  // --- pointer ---------------------------------------------------------------------------------------------------
  const stageListeners = new Map<string, Array<(event: any) => void>>();
  const stage = {
    on(name: string, handler: (event: any) => void) {
      (stageListeners.get(name) ?? stageListeners.set(name, []).get(name)!).push(handler);
      return stage;
    },
    off(name: string, handler: (event: any) => void) {
      const list = stageListeners.get(name);
      const i = list?.indexOf(handler) ?? -1;
      if (i >= 0) list!.splice(i, 1);
      return stage;
    },
  };
  const detachPointer = pointerService.attach(stage, (p) => p);

  let buttons = 0;
  let pressed: SceneNode | null = null;
  let hovered: SceneNode | null = null;
  let inside = false;

  const chain = (n: SceneNode | null) => {
    const out: SceneNode[] = [];
    for (let p: SceneNode | null = n; p; p = p.parent) out.push(p);
    return out;
  };

  /** Delivers to the target and up its ancestors (stopPropagation honoured), then to the stage. */
  function bubble(target: SceneNode | null, event: SceneEvent) {
    event.target = target ?? stage;
    for (const node of chain(target)) {
      event.currentTarget = node;
      node.emit(event.type, event);
      if (event.propagationStopped) return;
    }
    event.currentTarget = stage;
    for (const h of [...(stageListeners.get(event.type) ?? [])]) h(event);
  }

  /** Delivers to one node only (enter and leave do not bubble). */
  function direct(node: SceneNode | null, event: SceneEvent) {
    event.target = node ?? stage;
    event.currentTarget = node ?? stage;
    if (node) node.emit(event.type, event);
    else for (const h of [...(stageListeners.get(event.type) ?? [])]) h(event);
  }

  const make = (type: string, x: number, y: number, button = 0) => new SceneEvent(type, { x, y }, buttons, button);

  function enterCanvas(x: number, y: number) {
    if (inside) return;
    inside = true;
    direct(null, make("pointerenter", x, y));
  }

  function transition(next: SceneNode | null, x: number, y: number) {
    if (next === hovered) return;
    const was = chain(hovered);
    const now = chain(next);
    if (hovered) bubble(hovered, make("pointerout", x, y));
    if (next) bubble(next, make("pointerover", x, y));
    for (const n of was) if (!now.includes(n)) direct(n, make("pointerleave", x, y));
    for (const n of [...now].reverse()) if (!was.includes(n)) direct(n, make("pointerenter", x, y));
    hovered = next;
  }

  const MASK = [1, 4, 2]; // DOM `buttons` bit of button 0 (left), 1 (middle), 2 (right)
  const downName = (b: number) => (b === 2 ? "rightdown" : "mousedown");
  const upName = (b: number) => (b === 2 ? "rightup" : "mouseup");

  const pointer: PointerSimulator = {
    move(x, y) {
      enterCanvas(x, y);
      const target = hit(x, y);
      transition(target, x, y);
      bubble(target, make("pointermove", x, y));
      bubble(target, make("mousemove", x, y));
      touch();
    },
    down(x, y, button = 0) {
      enterCanvas(x, y);
      const target = hit(x, y);
      transition(target, x, y);
      buttons |= MASK[button] ?? 1;
      pressed = target;
      bubble(target, make("pointerdown", x, y, button));
      bubble(target, make(downName(button), x, y, button));
      touch();
    },
    up(x, y, button = 0) {
      const target = hit(x, y);
      transition(target, x, y);
      buttons &= ~(MASK[button] ?? 1);
      const down = pressed;
      pressed = null;
      const onPressed = down !== null && target !== null && chain(target).includes(down);
      if (down && !onPressed) {
        bubble(down, make("pointerupoutside", x, y, button));
        bubble(down, make(upName(button) + "outside", x, y, button));
      }
      bubble(target, make("pointerup", x, y, button));
      bubble(target, make(upName(button), x, y, button));
      if (onPressed || (down === null && target === null)) {
        // Pixi reports a tap on the node under both press and release; with nothing under either, the stage is the target.
        bubble(down ?? target, make("pointertap", x, y, button));
        bubble(down ?? target, make(button === 2 ? "rightclick" : "click", x, y, button));
      }
      touch();
    },
    tap(x, y, button = 0) {
      pointer.down(x, y, button);
      pointer.up(x, y, button);
    },
    leave() {
      if (!inside) return;
      inside = false;
      if (hovered) transition(null, 0, 0);
      direct(null, make("pointerleave", 0, 0));
      touch();
    },
  };

  // --- keyboard --------------------------------------------------------------------------------------------------
  const keyTarget = new EventTarget();
  const detachKeyboard = keyboardService.attach(keyTarget, "host");
  const keyEvent = (type: string, code: string) => Object.assign(new Event(type), { code, key: code, repeat: false });
  const keyboard: KeyboardSimulator = {
    press(code) {
      keyTarget.dispatchEvent(keyEvent("keydown", code));
      touch();
    },
    release(code) {
      keyTarget.dispatchEvent(keyEvent("keyup", code));
      touch();
    },
    blur() {
      keyTarget.dispatchEvent(new Event("focusout"));
      touch();
    },
  };

  // --- gamepad ---------------------------------------------------------------------------------------------------
  const pads = new Map<number, Pad>();
  gamepadService.attach(() => {
    const list: Array<GamepadSource | null> = [];
    for (const [index, pad] of pads) {
      list[index] = { index, id: pad.id, mapping: "standard", connected: true, axes: [...pad.axes], buttons: pad.buttons.map((b) => ({ ...b })) };
    }
    for (let i = 0; i < list.length; i++) list[i] ??= null;
    return list;
  });
  const padAt = (index: number): Pad => {
    const pad = pads.get(index);
    if (!pad) throw new Error(`No simulated gamepad at index ${index}; call connect(${index}) first.`);
    return pad;
  };
  const gamepad: GamepadSimulator = {
    connect(index = 0, options = {}) {
      pads.set(index, {
        id: options.id ?? "Simulated Gamepad",
        axes: Array.from({ length: options.axes ?? 4 }, () => 0),
        buttons: Array.from({ length: options.buttons ?? 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      });
    },
    disconnect(index = 0) {
      pads.delete(index);
    },
    setAxis(index, axis, value) {
      const pad = padAt(index);
      if (axis < 0 || axis >= pad.axes.length) throw new RangeError(`Gamepad ${index} has ${pad.axes.length} axes; axis ${axis} does not exist.`);
      pad.axes[axis] = value;
    },
    setButton(index, button, state) {
      const pad = padAt(index);
      if (button < 0 || button >= pad.buttons.length) throw new RangeError(`Gamepad ${index} has ${pad.buttons.length} buttons; button ${button} does not exist.`);
      const value = typeof state === "number" ? state : state ? 1 : 0;
      pad.buttons[button] = { pressed: typeof state === "number" ? state >= 0.5 : state, touched: value > 0, value };
    },
  };

  return {
    pointer,
    keyboard,
    gamepad,
    hit,
    localBox,
    detach() {
      detachPointer();
      detachKeyboard();
      gamepadService.attach(null);
    },
  };
}
