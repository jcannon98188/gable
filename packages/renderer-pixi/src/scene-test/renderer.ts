// createSceneTestRenderer (TASK-105.8): an in-memory scene with the real scene tags and Pixi's property semantics, no
// Pixi and no WebGL. The real Frame, Pointer, Keyboard, Gamepad and CanvasSize services run on top of it, driven by a
// deterministic frame step and simulated input.
import { flushSync, type Provider } from "@gable/core";
import type { Renderer } from "@gable/core/renderer";
import { A11yMirror, type A11yEntry, type A11yProps } from "../a11y.js";
import { A11yRecorder, type TabOptions } from "../a11y-testing.js";
import { CanvasSize } from "../canvas-size.js";
import {
  SCENE_TAGS,
  HIT_TAGS,
  SHAPE_TAGS,
  convertStaticAttribute,
  isHitTag,
  isSceneEvent,
  isSceneTag,
  isShapeTag,
  type PropSpec,
  type SceneTagName,
} from "../elements.js";
import { Frame } from "../frame.js";
import { Gamepad } from "../gamepad.js";
import { Keyboard } from "../keyboard.js";
import { Pointer } from "../pointer.js";
import { createInputSimulators, type GamepadSimulator, type KeyboardSimulator, type PointerSimulator } from "./input.js";
import { SceneNode, apply, attachParticleHost, isStyleField, paintOrder, tagInfoFor, toData, worldMatrix, type Point, type SceneNodeData, type StubTexture, type TagInfo } from "./node.js";
import { findAll as selectAll } from "./select.js";

export interface SceneTestOptions {
  /** CSS pixel size of the canvas the scene sees through `CanvasSize`. Default 300 by 150, like the real renderer's fallback. */
  width?: number;
  height?: number;
  /** `always` (default) records a render every frame; `on-demand` only after the scene changed. */
  renderMode?: "always" | "on-demand";
  /** Extra tags, as in the Pixi renderer's `tags` option: the tag name and the properties it adds to a container's. */
  tags?: Readonly<Record<string, { props?: Readonly<Record<string, PropSpec>> }>>;
  /**
   * Contract mode, for the Renderer conformance suite only: DOM-flavoured vocabulary is accepted and recorded (any tag
   * is a container, any attribute, class, style or property is stored, text may sit under any node). A real scene is strict.
   */
  lenient?: boolean;
}

/** The loaded textures by alias; the Assets double fills it, and a `texture="alias"` binding reads it, as Pixi's cache. */
export type StubTextures = Map<string, StubTexture>;

export interface SceneTestRenderer {
  /** The Renderer for the contract suite or for `createComponent(..., { renderer })`. */
  readonly renderer: Renderer<SceneNode>;
  /** The scene root node. Everything a boundary builds is under it. */
  readonly root: SceneNode;
  /** A `meta.renderer` factory: `static meta = { ..., renderer: scene.boundary }` makes a component's template build into this scene. */
  readonly boundary: () => { renderer: Renderer<SceneNode>; root: SceneNode };
  /** The first node under the root matching `selector` (tag, `#label`, `[prop=value]`, descendant and `>` combinators), as plain data; `null` when none. */
  find(selector: string): SceneNodeData | null;
  findAll(selector: string): SceneNodeData[];
  /** The whole scene as plain data. */
  snapshot(): SceneNodeData;
  /** Every node in paint order, back to front (depth first, children by `zIndex` then insertion). */
  drawOrder(): SceneNodeData[];
  /** The topmost node a pointer at (x, y) would hit, or `null`. */
  hitTest(x: number, y: number): SceneNodeData | null;
  /** The world rectangle of a node's author-supplied size (`width` and `height`, or its texture's stub size). No text measurement. */
  bounds(selector: string): { x: number; y: number; width: number; height: number } | null;
  /** Simulated input: the same Pointer, Keyboard and Gamepad services scene components inject receive it. */
  readonly pointer: PointerSimulator;
  readonly keyboard: KeyboardSimulator;
  readonly gamepad: GamepadSimulator;
  /** The real services of this boundary, for assertions. */
  readonly services: { readonly frame: Frame; readonly pointer: Pointer; readonly keyboard: Keyboard; readonly gamepad: Gamepad; readonly size: CanvasSize };
  /** The semantic mirror (TASK-105.9): what `[a11y]` nodes would put in the DOM, in tab order, as of the last frame. */
  a11y(): readonly A11yEntry<SceneNode>[];
  /** Focuses the node's mirror element (a node, its data, or a selector). False when it has no focusable mirror. */
  focus(node: SceneNode | SceneNodeData | string): boolean;
  /** Tab (or Shift+Tab) through the mirror: the new focus (a node, `"host"`, or `null` once focus left the canvas). */
  tab(options?: TabOptions): SceneNode | "host" | null;
  /** A key on the focused mirror element; Enter and Space activate it. */
  press(key: string): boolean;
  /** Activates the node's mirror element, as a screen reader would: its `pointertap` handler runs with `pointerType: "a11y"`. */
  click(node: SceneNode | SceneNodeData | string): boolean;
  /** The focused node, `"host"`, or `null`. */
  readonly focused: SceneNode | "host" | null;
  /** One deterministic loop step of ADR 0020: keyboard and gamepad snapshot, frame hooks, a synchronous effect flush, then a recorded render. */
  frame(dtMs?: number): void;
  frames(count: number, dtMs?: number): void;
  /** How many renders the loop recorded. */
  readonly renders: number;
  /** Textures `texture="alias"` resolves from. */
  readonly textures: StubTextures;
  readonly destroyed: boolean;
}

type Resolved = PropSpec | { readonly kind: "number"; readonly axis: "x" | "y"; readonly of: string };

function lookup(table: Readonly<Record<string, PropSpec>>, name: string): Resolved | undefined {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(table, k);
  const dot = name.indexOf(".");
  if (dot === -1) return has(name) ? table[name] : undefined;
  const of = name.slice(0, dot);
  const axis = name.slice(dot + 1);
  if (axis !== "x" && axis !== "y") return undefined;
  if (!has(of) || table[of]!.kind !== "point") return undefined;
  return { kind: "number", axis, of };
}

/** Pixi's Color for the notations the property table accepts; other strings (CSS names) are kept as written. */
function colorValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t);
  if (hex3) return parseInt(hex3[1]! + hex3[1]! + hex3[2]! + hex3[2]! + hex3[3]! + hex3[3]!, 16);
  if (/^#[0-9a-f]{6}$/i.test(t)) return parseInt(t.slice(1), 16);
  if (/^0x[0-9a-f]{1,6}$/i.test(t)) return parseInt(t.slice(2), 16);
  return value;
}

export function createSceneTestRenderer(options: SceneTestOptions = {}): SceneTestRenderer {
  const lenient = options.lenient === true;
  const textures: StubTextures = new Map();
  const size = new CanvasSize();
  size.width.set(options.width ?? 300);
  size.height.set(options.height ?? 150);
  const frames = new Frame();
  const pointerService = new Pointer();
  const keyboardService = new Keyboard();
  const gamepadService = new Gamepad();

  const containerProps = SCENE_TAGS.container.props;
  const hostInfo = (tag: string): TagInfo => ({ tag, table: containerProps, textContent: false, label: tag });
  const custom = new Map<string, TagInfo>();
  for (const [tag, reg] of Object.entries(options.tags ?? {})) {
    custom.set(tag, { tag, table: reg.props ? { ...containerProps, ...reg.props } : containerProps, textContent: false, label: null });
  }
  const root = new SceneNode("node", "container", { ...tagInfoFor("container"), label: "gable-scene-root" });
  let touched = true;
  let renders = 0;
  let destroyed = false;
  let rootDestroyed = false;

  const unknownProperty = (tag: string, name: string): never => {
    throw new Error(`Unknown property "${name}" on <${tag}> in the "pixi" renderer. Scene properties use Pixi's own names; dotted paths address one axis of a point-like property (e.g. [scale.x]).`);
  };

  const mirror = new A11yMirror<SceneNode>();
  const recorder = new A11yRecorder<SceneNode>(mirror);

  function writeText(owner: SceneNode) {
    owner.values.text = owner.joinedText();
  }

  function textureFromAlias(alias: string): StubTexture | null {
    return textures.get(alias) ?? null;
  }

  function setProperty(node: SceneNode, name: string, value: unknown): void {
    touched = true;
    if (node.kind === "hit") {
      if (!lookup(HIT_TAGS[node.tag as keyof typeof HIT_TAGS].props, name)) unknownProperty(node.tag, name);
      node.values[name] = value;
      return;
    }
    if (name === "a11y" && node.kind !== "shape" && (lenient || lookup(node.info!.table, name))) {
      mirror.set(node, value as A11yProps | null | undefined);
      return;
    }
    if (node.kind === "shape") {
      if (!lookup(SHAPE_TAGS[node.tag as keyof typeof SHAPE_TAGS].props, name)) unknownProperty(node.tag, name);
      node.values[name] = value;
      return;
    }
    const info = node.info!;
    const resolved = lookup(info.table, name);
    if (!resolved) {
      if (!lenient) return unknownProperty(info.tag, name);
      node.values[name] = value;
      return;
    }
    if (name === "texture" && typeof value === "string") value = textureFromAlias(value);
    const dot = name.indexOf(".");
    if (dot !== -1) {
      (node.values[name.slice(0, dot)] as Point)[name.slice(dot + 1) as "x" | "y"] = value as number;
      return;
    }
    if (name === "x" || name === "y") {
      (node.values.position as Point)[name] = value as number;
      return;
    }
    if (name === "angle") {
      node.values.rotation = ((value as number) * Math.PI) / 180;
      return;
    }
    if (isStyleField(name) && info.textContent) {
      node.style[name] = name === "fill" ? colorValue(value) : value;
      return;
    }
    if (resolved.kind === "point") {
      const point = node.values[name] as Point;
      if (typeof value === "number") {
        point.x = value;
        point.y = value;
      } else {
        const v = value as Point;
        point.x = v.x;
        point.y = v.y;
      }
      return;
    }
    if (resolved.kind === "color") value = colorValue(value);
    node.values[name] = value;
  }

  const isDisplay = (n: SceneNode) => n.kind === "node" || n.kind === "anchor" || (lenient && n.kind === "text");

  function unlayout(node: SceneNode) {
    const p = node.layoutParent;
    if (!p) return;
    p.layout.splice(p.layout.indexOf(node), 1);
    node.layoutParent = null;
  }

  /** Records the node in markup order and returns the display sibling it must go before (null: append). */
  function layOut(parent: SceneNode, node: SceneNode, before: SceneNode | null | undefined): SceneNode | null {
    unlayout(node);
    const at = before ? parent.layout.indexOf(before) : -1;
    if (at === -1) parent.layout.push(node);
    else parent.layout.splice(at, 0, node);
    node.layoutParent = parent;
    return parent.layout.slice(parent.layout.indexOf(node) + 1).find(isDisplay) ?? null;
  }

  function insertDisplay(parent: SceneNode, node: SceneNode, before: SceneNode | null | undefined) {
    detach(node);
    const at = before ? parent.children.indexOf(before) : -1;
    if (at === -1) parent.children.push(node);
    else parent.children.splice(at, 0, node);
    node.parent = parent;
  }

  function detach(node: SceneNode) {
    const p = node.parent;
    if (!p) return;
    p.children.splice(p.children.indexOf(node), 1);
    node.parent = null;
  }

  function destroyNode(node: SceneNode) {
    mirror.remove(node);
    node.destroyed = true;
    for (const child of node.children) destroyNode(child);
    node.children.length = 0;
    for (const key of Object.keys(node.listeners)) delete node.listeners[key];
  }

  const renderer: Renderer<SceneNode> = {
    name: "pixi-test",
    knowsElement: (tag) => isShapeTag(tag) || isSceneTag(tag) || isHitTag(tag) || custom.has(tag),
    providers: [
      { provide: CanvasSize, useValue: size } as Provider,
      { provide: Frame, useValue: frames } as Provider,
      { provide: Pointer, useValue: pointerService } as Provider,
      { provide: Keyboard, useValue: keyboardService } as Provider,
      { provide: Gamepad, useValue: gamepadService } as Provider,
    ],
    createElement(tag) {
      if (isShapeTag(tag)) return new SceneNode("shape", tag, null);
      if (isHitTag(tag)) return new SceneNode("hit", tag, null);
      const extra = custom.get(tag);
      if (extra) return new SceneNode("node", tag, extra);
      if (isSceneTag(tag)) {
        const node = new SceneNode("node", tag, tagInfoFor(tag));
        if (tag === "particle-container") attachParticleHost(node);
        return node;
      }
      if (tag.includes("-")) return new SceneNode("node", tag, hostInfo(tag));
      if (lenient) return new SceneNode("node", tag, { tag, table: containerProps, textContent: false, label: null });
      throw new Error(`Unknown scene tag <${tag}> in the "pixi" renderer. Scene tags: ${[...Object.keys(SCENE_TAGS), ...Object.keys(SHAPE_TAGS), ...Object.keys(HIT_TAGS), ...custom.keys()].join(", ")}. A component is used by its hyphenated selector.`);
    },
    createText: (text) => new SceneNode("text", "#text", null, text),
    createAnchor: () => new SceneNode("anchor", "#anchor", null),
    setProperty,
    setAttribute(node, name, value) {
      if (lenient && !(node.kind !== "shape" && node.info && lookup(node.info.table, name))) {
        if (value === null) delete node.attrs[name];
        else node.attrs[name] = value;
        return;
      }
      if (value === null) return;
      const table = node.kind === "hit" ? HIT_TAGS[node.tag as keyof typeof HIT_TAGS].props : node.kind === "shape" ? SHAPE_TAGS[node.tag as keyof typeof SHAPE_TAGS].props : node.info!.table;
      const resolved = lookup(table, name);
      if (!resolved) return unknownProperty(node.tag, name);
      if (name === "texture" && node.kind !== "shape" && node.kind !== "hit") return setProperty(node, name, value);
      const converted = convertStaticAttribute({ kind: resolved.kind, ...("type" in resolved ? { type: resolved.type } : {}) }, value);
      if (!converted.ok) throw new Error(`Attribute "${name}" on <${node.tag}>: ${converted.message}`);
      setProperty(node, name, converted.value);
    },
    // There are no CSS classes on a canvas.
    setClass(node, name, on) {
      if (!lenient) return;
      const i = node.classes.indexOf(name);
      if (on && i < 0) node.classes.push(name);
      else if (!on && i >= 0) node.classes.splice(i, 1);
    },
    setStyle(node, name, value) {
      if (!lenient) throw new Error(`[style.${name}] is a CSS style and means nothing in a scene. Text style fields are written flat, e.g. [fontSize]="..." or [fill]="...".`);
      if (value === null) delete node.styles[name];
      else node.styles[name] = value;
    },
    setText(node, text) {
      touched = true;
      node.text = text;
      if (node.owner) writeText(node.owner);
    },
    insert(parent, node, before) {
      touched = true;
      if (node.kind === "hit") {
        layOut(parent, node, before);
        if (node.owner) node.owner.hitShapes.splice(node.owner.hitShapes.indexOf(node), 1);
        const at = before ? parent.hitShapes.indexOf(before) : -1;
        if (at === -1) parent.hitShapes.push(node);
        else parent.hitShapes.splice(at, 0, node);
        node.owner = parent;
        return;
      }
      if (node.kind === "shape") {
        if (parent.tag !== "graphics") throw new Error(`<${node.tag}> can only be a child of <graphics>.`);
        if (node.owner) node.owner.shapes.splice(node.owner.shapes.indexOf(node), 1);
        const at = before ? parent.shapes.indexOf(before) : -1;
        if (at === -1) parent.shapes.push(node);
        else parent.shapes.splice(at, 0, node);
        node.owner = parent;
        return;
      }
      const next = layOut(parent, node, before);
      if (node.kind === "text" && !lenient) {
        if (!parent.info?.textContent) {
          if (node.text.trim() === "") return;
          throw new Error(`Text content is only allowed in <text> and <bitmap-text>, not <${parent.tag}>: "${node.text.trim().slice(0, 30)}". Bind [text] on a <text> instead.`);
        }
        const at = before ? parent.textParts.indexOf(before) : -1;
        if (at === -1) parent.textParts.push(node);
        else parent.textParts.splice(at, 0, node);
        node.owner = parent;
        writeText(parent);
        return;
      }
      if (parent.tag === "particle-container" && !lenient) {
        throw new Error("<particle-container> takes no child tags: particles are not display objects. Create them with particles(ref) on a #ref to the container.");
      }
      insertDisplay(parent, node, next);
    },
    remove(node) {
      touched = true;
      unlayout(node);
      if (node.kind === "hit") {
        node.owner?.hitShapes.splice(node.owner.hitShapes.indexOf(node), 1);
        node.owner = null;
        return;
      }
      if (node.kind === "shape") {
        node.owner?.shapes.splice(node.owner.shapes.indexOf(node), 1);
        node.owner = null;
        return;
      }
      if (node.kind === "text" && node.owner) {
        const owner = node.owner;
        owner.textParts.splice(owner.textParts.indexOf(node), 1);
        node.owner = null;
        if (!owner.destroyed) writeText(owner);
        return;
      }
      detach(node);
      destroyNode(node);
    },
    listen(node, name, handler) {
      if (node.kind === "shape" || node.kind === "hit" || node.kind === "text") {
        throw new Error(`Events can only be listened to on display nodes; ${name} was given to a shape, a hit shape or text content.`);
      }
      if (!lenient && !isSceneEvent(name)) throw new Error(`Unknown scene event "${name}" on <${node.tag}>.`);
      const mode = node.values.eventMode;
      if (!lenient && (mode === undefined || mode === "passive" || mode === "auto")) node.values.eventMode = "static";
      (node.listeners[name] ??= []).push(handler);
      return () => {
        const list = node.listeners[name];
        const i = list?.indexOf(handler) ?? -1;
        if (i >= 0) list!.splice(i, 1);
      };
    },
    compare(a, b) {
      const path = (n: SceneNode) => {
        const out: SceneNode[] = [];
        for (let p: SceneNode | null = n; p; p = p.parent) out.unshift(p);
        return out;
      };
      const pa = path(a);
      const pb = path(b);
      if (pa[0] !== pb[0]) return 0;
      let i = 0;
      while (pa[i] && pa[i] === pb[i]) i++;
      if (!pa[i] || !pb[i]) return pa[i] ? 1 : pb[i] ? -1 : 0;
      const kids = pa[i - 1]!.children;
      return kids.indexOf(pa[i]!) < kids.indexOf(pb[i]!) ? -1 : 1;
    },
    resolveTarget(target) {
      if (target instanceof SceneNode) return target;
      throw new Error("The scene test renderer can only be bootstrapped into a scene node (its `root`).");
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      input.detach();
      if (!rootDestroyed) {
        rootDestroyed = true;
        for (const child of [...root.children]) destroyNode(child);
        root.children.length = 0;
      }
    },
  };
  if (lenient) {
    // The contract suite needs scoping tokens; a canvas has no CSS, so only the lenient mode answers.
    const tokens = new Map<string, string>();
    renderer.registerStyles = (id, _css, opts) => {
      if (opts?.scoped === false) return "";
      if (!tokens.has(id)) tokens.set(id, `g-${id}`);
      return tokens.get(id)!;
    };
  }

  const input = createInputSimulators({
    root,
    pointerService,
    keyboardService,
    gamepadService,
    touch: () => {
      touched = true;
    },
  });

  const dataOf = (n: SceneNode) => toData(n);

  function worldBounds(n: SceneNode) {
    const box = input.localBox(n);
    if (!box) return null;
    const m = worldMatrix(n);
    const pts = [apply(m, { x: box.x, y: box.y }), apply(m, { x: box.x + box.width, y: box.y }), apply(m, { x: box.x, y: box.y + box.height }), apply(m, { x: box.x + box.width, y: box.y + box.height })];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  SceneNode.measure = worldBounds;

  function nodeOf(ref: SceneNode | SceneNodeData | string): SceneNode | null {
    if (typeof ref === "string") return selectAll(root, ref)[0] ?? null;
    return ref instanceof SceneNode ? ref : ref.node;
  }

  const scene: SceneTestRenderer = {
    renderer,
    root,
    boundary: () => ({ renderer, root }),
    find: (selector) => {
      const n = selectAll(root, selector)[0];
      return n ? dataOf(n) : null;
    },
    findAll: (selector) => selectAll(root, selector).map(dataOf),
    snapshot: () => dataOf(root),
    drawOrder() {
      const out: SceneNode[] = [];
      const walk = (n: SceneNode) => {
        for (const c of paintOrder(n)) {
          out.push(c);
          walk(c);
        }
      };
      walk(root);
      return out.map(dataOf);
    },
    hitTest(x, y) {
      const n = input.hit(x, y);
      return n ? dataOf(n) : null;
    },
    bounds(selector) {
      const n = selectAll(root, selector)[0];
      return n ? worldBounds(n) : null;
    },
    a11y: () => recorder.a11y(),
    focus: (node) => {
      const n = nodeOf(node);
      return n ? recorder.focus(n) : false;
    },
    tab: (opts) => recorder.tab(opts),
    press: (key) => recorder.press(key),
    click: (node) => {
      const n = nodeOf(node);
      return n ? recorder.click(n) : false;
    },
    get focused() {
      return recorder.focused;
    },
    pointer: input.pointer,
    keyboard: input.keyboard,
    gamepad: input.gamepad,
    services: { frame: frames, pointer: pointerService, keyboard: keyboardService, gamepad: gamepadService, size },
    frame(dtMs = 16) {
      // The order of the production loop (ADR 0020): input snapshots, hooks, a synchronous flush, then one render.
      keyboardService.beginFrame();
      gamepadService.beginFrame();
      frames.advance(dtMs / 1000);
      flushSync();
      mirror.sync(root);
      if (options.renderMode === "on-demand" && !touched) return;
      touched = false;
      renders++;
    },
    frames(count, dtMs = 16) {
      for (let i = 0; i < count; i++) scene.frame(dtMs);
    },
    get renders() {
      return renders;
    },
    textures,
    get destroyed() {
      return destroyed;
    },
  };
  return scene;
}
