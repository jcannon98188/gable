// A Gable Renderer over Pixi 8 display objects (TASK-104.7). Nodes are plain Pixi objects, so a scene can be built
// synchronously before the (async) Application exists; `mount()` later attaches the scene root to an Application.
//
// Tags are the shared table in ./elements.ts. The tag registry is extensible with `registerTag`. An unregistered
// hyphenated tag is a component host and becomes a plain container; an unregistered unhyphenated tag is a dev error.
// Writes are retained-mode: a signal write sets one Pixi property (a dotted path sets one axis). Graphics shapes are
// lightweight records that mark their graphics dirty; `frame()` redraws each dirty graphics once.
import "pixi.js/events"; // installs eventMode, cursor, hitArea and interactiveChildren on Container
import { Application, BitmapText, Cache, Container, Graphics, NineSliceSprite, Rectangle, Sprite, Text, Texture, TilingSprite } from "pixi.js";
import { flushSync, type Provider } from "@gable/core";
import type { Renderer } from "@gable/core/renderer";
import { DEV } from "./dev.js";
import type { CanvasDebugOptions } from "./canvas-debug.js";
import { FrameOverlay, FrameStats, countObjects, registerSceneBoundary, type SceneNodeLike } from "./debug.js";
import { CanvasSize } from "./canvas-size.js";
import { Frame } from "./frame.js";
import { Gamepad, type GetGamepads } from "./gamepad.js";
import { Keyboard } from "./keyboard.js";
import { Pointer } from "./pointer.js";
import { A11yMirror, type A11yProps } from "./a11y.js";
import { DomA11ySink } from "./a11y-dom.js";
import { ReducedMotion, type MatchMedia } from "./reduced-motion.js";
import {
  SCENE_TAGS,
  SHAPE_TAGS,
  convertStaticAttribute,
  isSceneEvent,
  isSceneTag,
  isShapeTag,
  type PropSpec,
  type SceneTagName,
  type ShapeTagName,
} from "./elements.js";

/** Where animation frames come from. Default: `requestAnimationFrame`. Tests pass a manual one, so no real timer runs. */
export interface FrameScheduler {
  /** Calls `callback` once with a timestamp in milliseconds at the next frame; returns an id for `cancel`. */
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
}

/** The slice of Pixi's `Application` the renderer uses; tests (and exotic setups) may supply their own. */
export interface ApplicationLike {
  init(options: Record<string, unknown>): Promise<void>;
  readonly canvas: HTMLCanvasElement;
  readonly stage: Container;
  render(): void;
  readonly renderer: { resize(width: number, height: number, resolution?: number): void; events?: { autoPreventDefault: boolean } };
  destroy(removeView?: boolean, options?: { children?: boolean }): void;
}

export interface PixiRendererOptions {
  /** Background colour of the canvas. Default: transparent. */
  background?: string | number;
  antialias?: boolean;
  /** Device pixel ratio for the buffer. Default: `devicePixelRatio`. */
  resolution?: number;
  /** `webgl`, `webgpu` or both in order of preference. Default: Pixi's own choice. */
  preference?: "webgl" | "webgpu";
  /** Fallback canvas size in CSS pixels when the host has no layout size yet. Default 300 by 150. */
  width?: number;
  height?: number;
  /** Provide an Application (tests, or an app that wants to configure Pixi itself). Default: `new Application()`. */
  createApplication?: () => ApplicationLike;
  /** `always` (default) renders every frame; `on-demand` renders only after a hook or an effect wrote to the scene (or `invalidate()` was called). */
  renderMode?: "always" | "on-demand";
  /** Frame source for the loop. Default: `requestAnimationFrame`. */
  scheduler?: FrameScheduler;
  /** CSS `touch-action` of the canvas. Default `none`, so touch drags reach the scene instead of scrolling the page. */
  touchAction?: string;
  /** Where the Keyboard service listens: `host` (default) only while the canvas host has focus, `global` on the window. */
  keyboard?: "host" | "global";
  /** Source of gamepads, polled once per frame. Default: `navigator.getGamepads` where it exists. */
  getGamepads?: GetGamepads;
  /** Source of the `prefers-reduced-motion` media query for the ReducedMotion service. Default: `window.matchMedia` where it exists. */
  matchMedia?: MatchMedia;
  /**
   * Dev only (dropped from a production build): shows the frame overlay (per-phase milliseconds, rolling p50 and p95, dropped
   * frames, display-object count, bindings re-run in the last frame). `true` or the overlay's options.
   */
  debug?: boolean | CanvasDebugOptions;
  /** Extra tags registered before the scene is built. */
  tags?: Readonly<Record<string, TagRegistration>>;
}

export interface TagRegistration {
  /** Builds the node. */
  create(): Container;
  /** Properties beyond the container's, with their kinds (used for static attribute conversion and dev errors). */
  props?: Readonly<Record<string, PropSpec>>;
}

export interface PixiSceneRenderer extends Renderer<Container> {
  /** The node the scene is built into; `mount()` adds it to the stage. */
  readonly root: Container;
  readonly size: CanvasSize;
  /** The per-frame hooks of this boundary; provided to scene components as `Frame`. */
  readonly frames: Frame;
  /** Marks the scene dirty so an on-demand renderer draws at the next frame. Input handlers call this. */
  invalidate(): void;
  /** Input services of this boundary; provided to scene components. */
  readonly pointer: Pointer;
  readonly keyboard: Keyboard;
  readonly gamepad: Gamepad;
  /** The user's reduced-motion preference; provided to scene components. */
  readonly reducedMotion: ReducedMotion;
  /** The semantic mirror of `[a11y]` nodes (TASK-104.11). It renders into the DOM once the renderer is mounted. */
  readonly a11y: A11yMirror<Container>;
  /** Adds a tag. Registering an existing tag replaces it. */
  registerTag(tag: string, registration: TagRegistration): void;
  /** Redraws every graphics whose shapes changed since the last frame, once each. The loop calls this before each render. */
  frame(): void;
  /** Creates the Application (a dynamic, async init), puts its canvas into `element`, attaches the scene and starts the render loop. */
  mount(element: HTMLElement): Promise<void>;
  /** Dev HMR: moves the canvas and the resize observer to a replacement host element, keeping the Application, GL context and loop. Before the Application is ready it only retargets where `mount()` will put the canvas. */
  rehost(element: HTMLElement): void;
  /** Stops the loop, destroys the scene and the Application. Idempotent. */
  destroy(): void;
}

/** A graphics shape child (`<rect>`, `<circle>`, ...): a record that contributes to its parent's drawing, never a display object. */
class ShapeNode {
  readonly props: Record<string, unknown> = {};
  owner: Graphics | null = null;
  constructor(readonly tag: ShapeTagName) {}
}

/** Text under a text tag, or whitespace under any tag. Never a display object. */
class ContentNode {
  owner: Container | null = null;
  constructor(public text: string) {}
}

interface TagInfo {
  readonly tag: string;
  readonly table: Readonly<Record<string, PropSpec>>;
  readonly textContent: boolean;
}

const STYLE_FIELDS = new Set([
  "fontSize", "fontFamily", "fontWeight", "fontStyle", "fill", "stroke", "align", "wordWrap", "wordWrapWidth", "letterSpacing", "lineHeight",
]);

const CLASSES: Record<string, () => Container> = {
  Container: () => new Container(),
  Sprite: () => new Sprite(),
  Text: () => new Text({ text: "" }),
  BitmapText: () => new BitmapText({ text: "" }),
  Graphics: () => new Graphics(),
  TilingSprite: () => new TilingSprite({ texture: Texture.EMPTY }),
  NineSliceSprite: () => new NineSliceSprite({ texture: Texture.EMPTY }),
};

type Resolved = PropSpec | { readonly kind: "number"; readonly axis: "x" | "y"; readonly of: string };

/** A property name in a table: a plain property, or an axis (`scale.x`) of a point-like property. */
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

const spec = (r: Resolved): PropSpec => ({ kind: r.kind, ...("type" in r ? { type: r.type } : {}) });

/**
 * `options` may be a function, read when the Application is created (after the host's inputs are bound, which is not
 * yet true when a boundary is built). Tags in a function-form options are not registered; use `registerTag`.
 */
export function createPixiRenderer(given: PixiRendererOptions | (() => PixiRendererOptions) = {}): PixiSceneRenderer {
  const root = new Container({ label: "gable-scene-root" });
  const size = new CanvasSize();
  const frameService = new Frame();
  const pointer = new Pointer();
  const keyboard = new Keyboard();
  const gamepad = new Gamepad();
  const reducedMotion = new ReducedMotion();
  const mirror = new A11yMirror<Container>();
  let hostTabindexManaged = false;
  const detachInput: Array<() => void> = [];
  let touched = true; // the scene changed since the last render; the first frame always draws
  const detachReducedMotion = reducedMotion.attach(
    (typeof given === "function" ? undefined : given.matchMedia) ?? (typeof matchMedia === "function" ? (q) => matchMedia(q) : null),
  );
  const registry = new Map<string, TagRegistration & { info: TagInfo }>();
  const infos = new WeakMap<Container, TagInfo>();
  const shapeLists = new WeakMap<Graphics, ShapeNode[]>();
  const textParts = new WeakMap<Container, ContentNode[]>();
  const layouts = new WeakMap<Container, unknown[]>();
  const layoutParent = new WeakMap<object, Container>();
  /** Records `node` in `parent`'s order list, before `before` (or last), leaving any earlier place. */
  const place = (parent: Container, node: unknown, before: unknown): void => {
    unplace(node);
    const order = layouts.get(parent) ?? (layouts.set(parent, []), layouts.get(parent)!);
    const at = before ? order.indexOf(before) : -1;
    if (at === -1) order.push(node);
    else order.splice(at, 0, node);
    layoutParent.set(node as object, parent);
  };
  const unplace = (node: unknown): void => {
    const old = layoutParent.get(node as object);
    if (!old) return;
    const order = layouts.get(old);
    const at = order ? order.indexOf(node) : -1;
    if (order && at !== -1) order.splice(at, 1);
    layoutParent.delete(node as object);
  };
  const dirty = new Set<Graphics>();
  let destroyed = false;
  let app: ApplicationLike | null = null;
  let appReady = false;
  let stopLoop: (() => void) | null = null;
  let hostElement: HTMLElement | null = null;
  let moveHost: ((element: HTMLElement) => void) | null = null;
  let stopDebug: (() => void) | null = null;

  const containerProps = SCENE_TAGS.container.props;

  function registerTag(tag: string, reg: TagRegistration) {
    registry.set(tag, { ...reg, info: { tag, table: reg.props ? { ...containerProps, ...reg.props } : containerProps, textContent: false } });
  }
  for (const [tag, reg] of Object.entries(typeof given === "function" ? {} : (given.tags ?? {}))) registerTag(tag, reg);

  const builtIn = new Map<string, TagInfo>();
  for (const [tag, def] of Object.entries(SCENE_TAGS) as [SceneTagName, (typeof SCENE_TAGS)[SceneTagName]][]) {
    builtIn.set(tag, { tag, table: def.props, textContent: def.textContent === true });
  }
  const hostInfo = (tag: string): TagInfo => ({ tag, table: containerProps, textContent: false });

  function markDirty(g: Graphics | null) {
    if (g) dirty.add(g);
  }

  function infoOf(node: Container): TagInfo {
    return infos.get(node) ?? (infos.set(node, hostInfo(node.label)), infos.get(node)!);
  }

  function unknownProperty(tag: string, name: string): never {
    throw new Error(`Unknown property "${name}" on <${tag}> in the "pixi" renderer. Scene properties use Pixi's own names; dotted paths address one axis of a point-like property (e.g. [scale.x]).`);
  }

  function redraw(g: Graphics) {
    g.clear();
    for (const s of shapeLists.get(g) ?? []) {
      const p = s.props;
      const n = (k: string) => (p[k] as number | undefined) ?? 0;
      switch (s.tag) {
        case "rect":
          g.rect(n("x"), n("y"), n("width"), n("height"));
          break;
        case "rounded-rect":
          g.roundRect(n("x"), n("y"), n("width"), n("height"), n("radius"));
          break;
        case "circle":
          g.circle(n("x"), n("y"), n("radius"));
          break;
        case "ellipse":
          g.ellipse(n("x"), n("y"), n("halfWidth"), n("halfHeight"));
          break;
        case "polygon": {
          const pts = p.points as number[] | undefined;
          if (!pts || pts.length < 6) continue;
          g.poly(pts);
          break;
        }
      }
      const fill = p.fill as string | number | undefined;
      const stroke = p.stroke as string | number | undefined;
      // No paint given: a visible default beats an invisible shape.
      if (fill !== undefined || stroke === undefined) g.fill(fill ?? 0xffffff);
      if (stroke !== undefined) g.stroke({ color: stroke, width: (p.strokeWidth as number | undefined) ?? 1 });
    }
  }

  function writeText(parent: Container) {
    (parent as Text).text = (textParts.get(parent) ?? []).map((c) => c.text).join("");
  }

  /** A string `[texture]` is looked up synchronously in Pixi's asset cache; it never starts a load (TASK-104.9). */
  function textureFromCache(alias: string, tag: string): Texture {
    const found: unknown = Cache.has(alias) ? Cache.get(alias) : undefined;
    if (found instanceof Texture) return found;
    if (DEV) {
      console.warn(found === undefined
        ? `<${tag} texture="${alias}"> in the "pixi" renderer: "${alias}" is not loaded, so the node shows an empty texture. Load its bundle first (inject(Assets).bundle(...).load()) and guard the node with @if (bundle.ready()).`
        : `<${tag} texture="${alias}"> in the "pixi" renderer: "${alias}" is cached but is not a texture, so the node shows an empty texture.`);
    }
    return Texture.EMPTY;
  }

  function setProperty(node: Container, name: string, value: unknown): void {
    touched = true;
    if ((node as unknown) instanceof ShapeNode) {
      const shape = node as unknown as ShapeNode;
      if (!lookup(SHAPE_TAGS[shape.tag].props, name)) unknownProperty(shape.tag, name);
      shape.props[name] = value;
      markDirty(shape.owner);
      return;
    }
    const info = infoOf(node);
    const resolved = lookup(info.table, name);
    if (!resolved) unknownProperty(info.tag, name);
    if (name === "a11y") {
      mirror.set(node, value as A11yProps | null | undefined);
      return;
    }
    const target = node as unknown as Record<string, any>;
    if (name === "texture" && typeof value === "string") value = textureFromCache(value, info.tag);
    const dot = name.indexOf(".");
    if (dot !== -1) {
      target[name.slice(0, dot)][name.slice(dot + 1)] = value;
      return;
    }
    if (STYLE_FIELDS.has(name) && "style" in node) {
      (target.style as Record<string, unknown>)[name] = value;
      return;
    }
    if (resolved.kind === "point") {
      const point = target[name] as { set(x: number, y?: number): void };
      if (typeof value === "number") point.set(value);
      else {
        const v = value as { x: number; y: number };
        point.set(v.x, v.y);
      }
      return;
    }
    target[name] = value;
  }

  const renderer: PixiSceneRenderer = {
    name: "pixi",
    root,
    size,
    frames: frameService,
    pointer,
    keyboard,
    gamepad,
    reducedMotion,
    a11y: mirror,
    invalidate() {
      touched = true;
    },
    warnRawTimers: DEV,
    providers: [{ provide: CanvasSize, useValue: size } as Provider, { provide: Frame, useValue: frameService } as Provider,
      { provide: Pointer, useValue: pointer } as Provider,
      { provide: Keyboard, useValue: keyboard } as Provider,
      { provide: Gamepad, useValue: gamepad } as Provider,
      { provide: ReducedMotion, useValue: reducedMotion } as Provider,
    ],
    registerTag,
    createElement(tag) {
      if (isShapeTag(tag)) return new ShapeNode(tag) as unknown as Container;
      const custom = registry.get(tag);
      if (custom) {
        const node = custom.create();
        infos.set(node, custom.info);
        node.sortableChildren = true;
        return node;
      }
      if (isSceneTag(tag)) {
        const node = CLASSES[SCENE_TAGS[tag].pixiClass]!();
        infos.set(node, builtIn.get(tag)!);
        node.sortableChildren = true;
        return node;
      }
      if (tag.includes("-")) {
        const node = new Container({ label: tag });
        node.sortableChildren = true;
        infos.set(node, hostInfo(tag));
        return node;
      }
      throw new Error(`Unknown scene tag <${tag}> in the "pixi" renderer. Scene tags: ${[...Object.keys(SCENE_TAGS), ...Object.keys(SHAPE_TAGS), ...registry.keys()].join(", ")}. A component is used by its hyphenated selector.`);
    },
    createText: (text) => new ContentNode(text) as unknown as Container,
    createAnchor: () => new Container({ label: "#anchor" }),
    setProperty,
    setAttribute(node, name, value) {
      if (value === null) return;
      const table = (node as unknown) instanceof ShapeNode ? SHAPE_TAGS[(node as unknown as ShapeNode).tag].props : infoOf(node).table;
      const tag = (node as unknown) instanceof ShapeNode ? (node as unknown as ShapeNode).tag : infoOf(node).tag;
      const resolved = lookup(table, name);
      if (!resolved) unknownProperty(tag, name);
      if (name === "texture" && !(node as unknown instanceof ShapeNode)) {
        setProperty(node, name, value);
        return;
      }
      const converted = convertStaticAttribute(spec(resolved), value);
      if (!converted.ok) throw new Error(`Attribute "${name}" on <${tag}>: ${converted.message}`);
      setProperty(node, name, converted.value);
    },
    // There are no CSS classes on a canvas.
    setClass() {},
    setStyle(_node, name) {
      throw new Error(`[style.${name}] is a CSS style and means nothing in a scene. Text style fields are written flat, e.g. [fontSize]="..." or [fill]="...".`);
    },
    setText(node, text) {
      touched = true;
      const content = node as unknown as ContentNode;
      content.text = text;
      if (content.owner) writeText(content.owner);
    },
    insert(parent, node, before) {
      touched = true;
      // Every inserted node, ignored whitespace text and shapes included, keeps its place in an order list, because the
      // core may name one of those as `before` and a Pixi container does not hold them.
      place(parent, node, before);
      if ((node as unknown) instanceof ShapeNode) {
        const shape = node as unknown as ShapeNode;
        if (!(parent instanceof Graphics)) throw new Error(`<${shape.tag}> can only be a child of <graphics>.`);
        const list = shapeLists.get(parent) ?? (shapeLists.set(parent, []), shapeLists.get(parent)!);
        const old = shape.owner ? shapeLists.get(shape.owner) : undefined;
        if (old) old.splice(old.indexOf(shape), 1);
        const at = before ? list.indexOf(before as unknown as ShapeNode) : -1;
        if (at === -1) list.push(shape);
        else list.splice(at, 0, shape);
        if (shape.owner && shape.owner !== parent) markDirty(shape.owner);
        shape.owner = parent;
        markDirty(parent);
        return;
      }
      if ((node as unknown) instanceof ContentNode) {
        const content = node as unknown as ContentNode;
        if (!infoOf(parent).textContent) {
          if (content.text.trim() === "") return;
          throw new Error(`Text content is only allowed in <text> and <bitmap-text>, not <${infoOf(parent).tag}>: "${content.text.trim().slice(0, 30)}". Bind [text] on a <text> instead.`);
        }
        const list = textParts.get(parent) ?? (textParts.set(parent, []), textParts.get(parent)!);
        const at = before ? list.indexOf(before as unknown as ContentNode) : -1;
        if (at === -1) list.push(content);
        else list.splice(at, 0, content);
        content.owner = parent;
        writeText(parent);
        return;
      }
      const order = layouts.get(parent)!;
      let next: Container | undefined;
      for (let i = order.indexOf(node) + 1; i < order.length && !next; i++) {
        const candidate = order[i] as Container;
        if (candidate.parent === parent) next = candidate;
      }
      node.removeFromParent();
      if (next) parent.addChildAt(node, parent.getChildIndex(next));
      else parent.addChild(node);
    },
    remove(node) {
      touched = true;
      unplace(node);
      if ((node as unknown) instanceof ShapeNode) {
        const shape = node as unknown as ShapeNode;
        const list = shape.owner ? shapeLists.get(shape.owner) : undefined;
        if (list) list.splice(list.indexOf(shape), 1);
        markDirty(shape.owner);
        shape.owner = null;
        return;
      }
      if ((node as unknown) instanceof ContentNode) {
        const content = node as unknown as ContentNode;
        const owner = content.owner;
        if (owner) {
          const list = textParts.get(owner)!;
          list.splice(list.indexOf(content), 1);
          content.owner = null;
          if (!owner.destroyed) writeText(owner);
        }
        return;
      }
      // remove() means gone for good here; a moved node goes through insert().
      node.removeFromParent();
      mirror.remove(node);
      if (node instanceof Graphics) dirty.delete(node);
      node.destroy({ children: true });
    },
    listen(node, name, handler) {
      if ((node as unknown) instanceof ShapeNode || (node as unknown) instanceof ContentNode) {
        throw new Error(`Events can only be listened to on display nodes; ${name} was given to a shape or text content.`);
      }
      if (!isSceneEvent(name)) throw new Error(`Unknown scene event "${name}" on <${infoOf(node).tag}>.`);
      if (node.eventMode === undefined || node.eventMode === "passive" || node.eventMode === "auto") node.eventMode = "static"; // undefined: no EventSystem yet (the scene is built before the Application)
      node.on(name as never, handler as never);
      return () => node.off(name as never, handler as never);
    },
    resolveTarget(target) {
      if (target instanceof Container) return target;
      throw new Error("The pixi renderer can only be bootstrapped into a Pixi Container.");
    },
    frame() {
      for (const g of dirty) if (!g.destroyed) redraw(g);
      dirty.clear();
      mirror.sync(root);
    },
    async mount(element) {
      function mountInput(created: ApplicationLike, element: HTMLElement, options: PixiRendererOptions, first: { w: number; h: number }) {
        const stage = created.stage;
        // The stage is a pointer target covering the canvas, so moves over empty space reach the Pointer service.
        stage.eventMode = "static";
        stage.hitArea = new Rectangle(0, 0, first.w, first.h);
        detachInput.push(pointer.attach(stage as never, (p) => root.toLocal(p)));
        // The scene never prevents the default of the DOM event by itself (Pixi would for legacy mouse and touch events).
        if (created.renderer.events) created.renderer.events.autoPreventDefault = false;
        created.canvas.style.touchAction = options.touchAction ?? "none";
        // Keyboard: focus-scoped on the host unless asked for the window.
        if (options.keyboard === "global") {
          detachInput.push(keyboard.attach(window, "global"));
        } else {
          if (!element.hasAttribute("tabindex")) {
            element.tabIndex = 0;
            hostTabindexManaged = true;
          }
          detachInput.push(keyboard.attach(element, "host"));
          const focusHost = () => element.focus({ preventScroll: true });
          created.canvas.addEventListener("pointerdown", focusHost);
          detachInput.push(() => created.canvas.removeEventListener("pointerdown", focusHost));
        }
        const getGamepads = options.getGamepads ?? (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function" ? () => navigator.getGamepads() : null);
        gamepad.attach(getGamepads as GetGamepads | null);
      }

      if (destroyed) return;
      hostElement = element;
      const options = typeof given === "function" ? given() : given;
      // Dev only: the scene is visible to the devtools (the Scene panel, the Designer) from the moment it mounts.
      if (DEV) {
        stopDebug = registerSceneBoundary({
          label: element.getAttribute("aria-label") || "canvas scene",
          root,
          describe: (node) => ({ tag: node === root ? "scene" : (infos.get(node as Container)?.tag ?? "container"), kind: node.constructor?.name ?? "Container" }),
          host: () => hostElement,
        });
      }
      const created = (options.createApplication ?? (() => new Application() as unknown as ApplicationLike))();
      app = created;
      const ratio = options.resolution ?? (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1;
      const measure = () => ({ w: hostElement!.clientWidth || options.width || 300, h: hostElement!.clientHeight || options.height || 150 });
      const first = measure();
      await created.init({
        width: first.w,
        height: first.h,
        resolution: ratio,
        autoDensity: true,
        antialias: options.antialias ?? false,
        ...(options.background === undefined ? { backgroundAlpha: 0 } : { background: options.background }),
        ...(options.preference ? { preference: options.preference } : {}),
        autoStart: false, // Pixi's ticker stays off: Gable drives rendering
        sharedTicker: false,
      });
      if (destroyed) {
        created.destroy(true, { children: false });
        return;
      }
      appReady = true;
      created.canvas.style.display = "block";
      hostElement!.appendChild(created.canvas);
      created.stage.addChild(root);
      size.pixelRatio.set(ratio);
      size.width.set(first.w);
      size.height.set(first.h);
      mountInput(created, element, options, first);
      // The mirror elements become the tab stops while there are any; the host is the one stop otherwise.
      mirror.attach(new DomA11ySink<Container>(element, (node, event) => {
        if (mirror.activate(node, event)) touched = true;
      }, (count) => {
        if (hostTabindexManaged) element.tabIndex = count > 0 ? -1 : 0;
      }));
      detachInput.push(() => mirror.detach());

      const resize = () => {
        const { w, h } = measure();
        if (w === size.width() && h === size.height()) return;
        created.renderer.resize(w, h, ratio);
        touched = true;
        created.stage.hitArea = new Rectangle(0, 0, w, h);
        size.width.set(w);
        size.height.set(h);
      };
      const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
      observer?.observe(hostElement!);
      moveHost = (next) => {
        observer?.disconnect();
        next.appendChild(created.canvas);
        observer?.observe(next);
        resize();
      };

      // One loop per boundary. Per frame: hooks, then a synchronous effect flush, then one render (ADR 0020).
      const scheduler = options.scheduler ?? defaultScheduler;
      const onDemand = options.renderMode === "on-demand";
      let raf = 0;
      let running = true;
      let last: number | null = null;
      // Dev only: frame statistics and the overlay. `dbg` is null unless the `debug` option asked for them.
      const dbg = DEV && options.debug ? debugSession(options.debug === true ? {} : options.debug, element, root) : null;
      if (dbg) {
        const stopSession = stopDebug;
        stopDebug = () => (dbg.overlay.destroy(), stopSession?.());
      }
      const tick = (time: number) => {
        if (!running) return;
        raf = scheduler.request(tick);
        const seconds = last === null ? 0 : (time - last) / 1000;
        last = time;
        try {
          const t0 = dbg ? dbg.now() : 0;
          keyboard.beginFrame();
          gamepad.beginFrame();
          frameService.advance(seconds);
          const t1 = dbg ? dbg.now() : 0;
          const ran = flushSync(); // apply signal writes to Pixi nodes
          const t2 = dbg ? dbg.now() : 0;
          if (!(onDemand && !touched)) {
            touched = false;
            renderer.frame();
            created.render();
          }
          if (dbg) dbg.frame(time, t1 - t0, t2 - t1, dbg.now() - t2, ran);
        } catch (error) {
          console.error("[gable] error in the canvas frame loop", error);
        }
      };
      raf = scheduler.request(tick);
      stopLoop = () => {
        running = false;
        scheduler.cancel(raf);
        observer?.disconnect();
        while (detachInput.length) detachInput.pop()!();
      };
    },
    rehost(element) {
      if (destroyed) return;
      hostElement = element;
      moveHost?.(element);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopDebug?.();
      stopDebug = null;
      stopLoop?.();
      stopLoop = null;
      detachReducedMotion();
      mirror.detach();
      dirty.clear();
      if (!root.destroyed) root.destroy({ children: true });
      if (app) {
        // The scene root is already destroyed; the Application owns the canvas and the GL context.
        // If init is still pending, mount() tears the Application down when it resumes.
        const a = app;
        app = null;
        if (appReady) a.destroy(true, { children: false });
      }
    },
  };
  return renderer;
}

/** Dev only: the statistics and overlay of one canvas boundary. */
function debugSession(options: CanvasDebugOptions, host: HTMLElement, root: SceneNodeLike) {
  const stats = new FrameStats(options);
  const overlay = new FrameOverlay(host);
  const now = options.now ?? (() => performance.now());
  const every = Math.max(1, options.every ?? 10);
  let frames = 0;
  let objects = 0;
  return {
    overlay,
    now,
    /** Records one frame; the object count and the overlay refresh every `every` frames (and on the first). */
    frame(at: number, hooks: number, flush: number, render: number, bindings: number) {
      const refresh = frames++ % every === 0;
      if (refresh) objects = countObjects(root);
      stats.record({ at, hooks, flush, render, objects, bindings });
      if (refresh) overlay.update(stats.snapshot());
    },
  };
}

const defaultScheduler: FrameScheduler = {
  request: (cb) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : (setTimeout(() => cb(Date.now()), 16) as unknown as number)),
  cancel: (id) => (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id)),
};

/**
 * The renderer boundary factory for `meta.renderer`: `renderer: pixiRenderer({ background: "#000" })`. The scene is built
 * into a Pixi container right away; the Application is created asynchronously inside the host element and the scene is
 * attached to its stage. Destroying the host calls the renderer's `destroy()`, which releases the scene and the Application.
 */
export function pixiRenderer(
  options: PixiRendererOptions | (() => PixiRendererOptions) = {},
): (instance: unknown, parent: { host: unknown }) => { renderer: PixiSceneRenderer; root: Container } {
  return (_instance, parent) => {
    const renderer = createPixiRenderer(options);
    const host = parent.host as HTMLElement;
    Promise.resolve()
      .then(() => renderer.mount(host))
      .catch((error) => console.error("[gable] the Pixi canvas failed to start", error));
    return { renderer, root: renderer.root };
  };
}
