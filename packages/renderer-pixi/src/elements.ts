// The shared tag and property table for Gable's Pixi scene (TASK-104.7, TASK-104.8).
// One source of truth for the Pixi renderer, the scene test renderer and the language-service
// element map. This module must stay free of any pixi.js import (runtime or type), so tooling can
// load it without pulling Pixi in. Pixi class and event names appear as strings only.

/**
 * The marker a scene component puts in `static meta` (`elements: pixiElements`) so its template is
 * type-checked against the Pixi element map. Boundary components (`meta.renderer`) need no marker.
 */
export const pixiElements = "pixi" as const;
export type PixiElements = typeof pixiElements;

/** How a property's value is typed and how a static attribute string is converted. */
export type PropKind = "number" | "boolean" | "string" | "color" | "point" | "object";

/** TypeScript type text for each kind, used by the language service to emit element maps. */
export const PROP_KIND_TS: Readonly<Record<PropKind, string>> = {
  number: "number",
  boolean: "boolean",
  string: "string",
  color: "number | string",
  point: "number | { x: number; y: number }",
  object: "unknown",
};

export interface PropSpec {
  readonly kind: PropKind;
  /** For `object` properties: the Pixi type the value should have (documentation, and the language service's emitted type). */
  readonly type?: string;
}

/** A resolved dotted-axis property such as `scale.x`. */
export interface AxisPropSpec extends PropSpec {
  readonly kind: "number";
  readonly axis: "x" | "y";
  readonly of: PointPropName;
}

export type PointPropName = "position" | "scale" | "pivot" | "skew" | "anchor" | "tilePosition" | "tileScale";

export type SceneEventName =
  | "pointerdown"
  | "pointerup"
  | "pointerupoutside"
  | "pointermove"
  | "pointertap"
  | "pointerover"
  | "pointerout"
  | "pointerenter"
  | "pointerleave"
  | "pointercancel"
  | "globalpointermove"
  | "click"
  | "contextmenu"
  | "tap"
  | "rightdown"
  | "rightup"
  | "rightupoutside"
  | "rightclick"
  | "mousedown"
  | "mouseup"
  | "mouseupoutside"
  | "mousemove"
  | "mouseover"
  | "mouseout"
  | "mouseenter"
  | "mouseleave"
  | "globalmousemove"
  | "touchstart"
  | "touchend"
  | "touchendoutside"
  | "touchmove"
  | "touchcancel"
  | "globaltouchmove"
  | "wheel";

/** Pixi event class a handler receives as `$event`, unwrapped. */
export type SceneEventType = "FederatedPointerEvent" | "FederatedWheelEvent";

/** Event name to the Pixi event class its handler receives. */
export const SCENE_EVENTS = {
  pointerdown: "FederatedPointerEvent",
  pointerup: "FederatedPointerEvent",
  pointerupoutside: "FederatedPointerEvent",
  pointermove: "FederatedPointerEvent",
  pointertap: "FederatedPointerEvent",
  pointerover: "FederatedPointerEvent",
  pointerout: "FederatedPointerEvent",
  pointerenter: "FederatedPointerEvent",
  pointerleave: "FederatedPointerEvent",
  pointercancel: "FederatedPointerEvent",
  globalpointermove: "FederatedPointerEvent",
  click: "FederatedPointerEvent",
  contextmenu: "FederatedPointerEvent",
  tap: "FederatedPointerEvent",
  rightdown: "FederatedPointerEvent",
  rightup: "FederatedPointerEvent",
  rightupoutside: "FederatedPointerEvent",
  rightclick: "FederatedPointerEvent",
  mousedown: "FederatedPointerEvent",
  mouseup: "FederatedPointerEvent",
  mouseupoutside: "FederatedPointerEvent",
  mousemove: "FederatedPointerEvent",
  mouseover: "FederatedPointerEvent",
  mouseout: "FederatedPointerEvent",
  mouseenter: "FederatedPointerEvent",
  mouseleave: "FederatedPointerEvent",
  globalmousemove: "FederatedPointerEvent",
  touchstart: "FederatedPointerEvent",
  touchend: "FederatedPointerEvent",
  touchendoutside: "FederatedPointerEvent",
  touchmove: "FederatedPointerEvent",
  touchcancel: "FederatedPointerEvent",
  globaltouchmove: "FederatedPointerEvent",
  wheel: "FederatedWheelEvent",
} as const satisfies Record<SceneEventName, SceneEventType>;

export type SceneTagName =
  | "container"
  | "sprite"
  | "text"
  | "bitmap-text"
  | "graphics"
  | "tiling-sprite"
  | "nine-slice-sprite"
  | "particle-container";

export type ShapeTagName = "rect" | "rounded-rect" | "circle" | "ellipse" | "polygon";

/** Declarative hit-shape children (TASK-105.11): the shape tags with a `hit-` prefix. Any scene tag accepts them. */
export type HitTagName = "hit-rect" | "hit-rounded-rect" | "hit-circle" | "hit-ellipse" | "hit-polygon";

export interface TagSpec {
  /** Pixi class the renderer instantiates (a name, never an import). */
  readonly pixiClass: string;
  readonly props: Readonly<Record<string, PropSpec>>;
  /** Declarative attachment children this tag accepts (graphics shapes). Every scene tag also accepts the `hit-*` children. */
  readonly children?: readonly ShapeTagName[];
  /** True when element content / `[text]` supplies the node's text. */
  readonly textContent?: boolean;
}

export interface HitSpec {
  /** The Pixi shape class the geometry maps onto (the node's hitArea is built from it). */
  readonly pixiShape: string;
  /** The graphics shape tag with the same geometry. */
  readonly shape: ShapeTagName;
  readonly props: Readonly<Record<string, PropSpec>>;
}

export interface ShapeSpec {
  /** The Pixi shape class the geometry maps onto. */
  readonly pixiShape: string;
  readonly props: Readonly<Record<string, PropSpec>>;
}

const num: PropSpec = { kind: "number" };
const bool: PropSpec = { kind: "boolean" };
const str: PropSpec = { kind: "string" };
const color: PropSpec = { kind: "color" };
const point: PropSpec = { kind: "point" };
const obj = (type: string): PropSpec => ({ kind: "object", type });

const CONTAINER_PROPS = {
  x: num,
  y: num,
  position: point,
  scale: point,
  pivot: point,
  skew: point,
  rotation: num,
  angle: num,
  alpha: num,
  visible: bool,
  renderable: bool,
  tint: color,
  zIndex: num,
  label: str,
  // Gable-level: the opt-in accessibility mirror (TASK-104.11). The type text names no Pixi class: tooling qualifies every capitalised word as a Pixi export.
  a11y: obj("{ role: string; label: string; description?: string; focusable?: boolean; order?: number }"),
  width: num,
  height: num,
  sortableChildren: bool,
  interactiveChildren: bool,
  eventMode: str,
  cursor: str,
  hitArea: obj("IHitArea"),
  mask: obj("Container"),
  filters: obj("Filter[]"),
} as const satisfies Record<string, PropSpec>;

/** Flat Pixi TextStyle fields, written directly on `text` and `bitmap-text` (TASK-104.7 item 7). */
const TEXT_PROPS = {
  text: str,
  style: obj("TextStyle"),
  anchor: point,
  roundPixels: bool,
  fontSize: num,
  fontFamily: str,
  fontWeight: str,
  fontStyle: str,
  fill: color,
  stroke: obj("StrokeStyle"),
  align: str,
  wordWrap: bool,
  wordWrapWidth: num,
  letterSpacing: num,
  lineHeight: num,
} as const satisfies Record<string, PropSpec>;

export const SCENE_TAGS: Readonly<Record<SceneTagName, TagSpec>> = {
  container: { pixiClass: "Container", props: CONTAINER_PROPS },
  sprite: {
    pixiClass: "Sprite",
    props: { ...CONTAINER_PROPS, texture: obj("Texture"), anchor: point, roundPixels: bool },
  },
  text: { pixiClass: "Text", props: { ...CONTAINER_PROPS, ...TEXT_PROPS }, textContent: true },
  "bitmap-text": { pixiClass: "BitmapText", props: { ...CONTAINER_PROPS, ...TEXT_PROPS }, textContent: true },
  graphics: {
    pixiClass: "Graphics",
    props: { ...CONTAINER_PROPS, context: obj("GraphicsContext"), roundPixels: bool },
    children: ["rect", "rounded-rect", "circle", "ellipse", "polygon"],
  },
  "tiling-sprite": {
    pixiClass: "TilingSprite",
    props: {
      ...CONTAINER_PROPS,
      texture: obj("Texture"),
      anchor: point,
      tilePosition: point,
      tileScale: point,
      tileRotation: num,
      roundPixels: bool,
    },
  },
  "nine-slice-sprite": {
    pixiClass: "NineSliceSprite",
    props: {
      ...CONTAINER_PROPS,
      texture: obj("Texture"),
      leftWidth: num,
      topHeight: num,
      rightWidth: num,
      bottomHeight: num,
      roundPixels: bool,
    },
  },
  // The high-count tier (TASK-104.14). Particles are not display objects: no child tags, they are made through the particles() ref helper.
  "particle-container": {
    pixiClass: "ParticleContainer",
    props: { ...CONTAINER_PROPS, texture: obj("Texture"), dynamicProperties: obj("ParticleProperties"), roundPixels: bool },
  },
};

const PAINT = { fill: color, stroke: color, strokeWidth: num } as const;

/**
 * Graphics shape children. Geometry names are Pixi's own shape fields (so `ellipse` takes
 * `halfWidth` and `halfHeight`); `fill`, `stroke` and `strokeWidth` are Gable's painting
 * properties, applied when the parent graphics redraws.
 */
export const SHAPE_TAGS: Readonly<Record<ShapeTagName, ShapeSpec>> = {
  rect: { pixiShape: "Rectangle", props: { x: num, y: num, width: num, height: num, ...PAINT } },
  "rounded-rect": {
    pixiShape: "RoundedRectangle",
    props: { x: num, y: num, width: num, height: num, radius: num, ...PAINT },
  },
  circle: { pixiShape: "Circle", props: { x: num, y: num, radius: num, ...PAINT } },
  ellipse: { pixiShape: "Ellipse", props: { x: num, y: num, halfWidth: num, halfHeight: num, ...PAINT } },
  polygon: { pixiShape: "Polygon", props: { points: obj("number[]"), ...PAINT } },
};

/**
 * Hit-shape children: the geometry of the matching shape tag, without painting. A node with one or more of them gets
 * a `hitArea` that is the shape (or the union of the shapes), updating as their properties change. While a node has
 * hit children they win over a bound `[hitArea]`.
 */
export const HIT_TAGS: Readonly<Record<HitTagName, HitSpec>> = Object.fromEntries(
  (Object.keys(SHAPE_TAGS) as ShapeTagName[]).map((shape) => {
    const { fill: _fill, stroke: _stroke, strokeWidth: _width, ...geometry } = SHAPE_TAGS[shape].props;
    return [`hit-${shape}`, { pixiShape: SHAPE_TAGS[shape].pixiShape, shape, props: geometry }];
  }),
) as Record<HitTagName, HitSpec>;

export function isHitTag(name: string): name is HitTagName {
  return Object.prototype.hasOwnProperty.call(HIT_TAGS, name);
}

export function isSceneTag(name: string): name is SceneTagName {
  return Object.prototype.hasOwnProperty.call(SCENE_TAGS, name);
}

export function isShapeTag(name: string): name is ShapeTagName {
  return Object.prototype.hasOwnProperty.call(SHAPE_TAGS, name);
}

export function isSceneEvent(name: string): name is SceneEventName {
  return Object.prototype.hasOwnProperty.call(SCENE_EVENTS, name);
}

/**
 * The scene events that mean "the user activated this node" (press, release, tap, click). A listener for one of these makes a node
 * an action target, so it needs `[a11y]` (lint rule `scene-pointer-a11y`) and the mirror's activation (click, Enter, Space) fires
 * the same events: `pointerup`, `pointertap`, `click` and `tap`. Hover and tracking events (over, out, enter, leave, move) are not activation.
 */
export const ACTIVATION_EVENTS: ReadonlySet<string> = new Set([
  "pointerdown", "pointerup", "pointertap", "click", "tap", "contextmenu",
  "rightdown", "rightup", "rightclick",
  "mousedown", "mouseup", "touchstart", "touchend",
]);

/** Every property a scene tag accepts, by Pixi's own name. */
export function propertiesOf(tag: SceneTagName | ShapeTagName | HitTagName): Readonly<Record<string, PropSpec>> {
  return isSceneTag(tag) ? SCENE_TAGS[tag].props : isHitTag(tag) ? HIT_TAGS[tag].props : SHAPE_TAGS[tag as ShapeTagName].props;
}

/**
 * Resolve a property name on a tag: a plain property, or a dotted axis (`scale.x`) of a point-like
 * property. Deep paths, non-point parents and unknown names resolve to undefined.
 */
export function resolveProperty(tag: SceneTagName | ShapeTagName | HitTagName, name: string): PropSpec | AxisPropSpec | undefined {
  const props = propertiesOf(tag);
  const dot = name.indexOf(".");
  if (dot === -1) return Object.prototype.hasOwnProperty.call(props, name) ? props[name] : undefined;
  const of = name.slice(0, dot);
  const axis = name.slice(dot + 1);
  if (axis !== "x" && axis !== "y") return undefined;
  if (!Object.prototype.hasOwnProperty.call(props, of) || props[of]!.kind !== "point") return undefined;
  return { kind: "number", axis, of: of as PointPropName };
}

export type StaticConversion = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string };

const fail = (message: string): StaticConversion => ({ ok: false, message });

function toNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Convert a static attribute string by the property's kind, never by guessing from the string:
 * `text="123"` stays a string. `object` properties cannot be written statically.
 */
export function convertStaticAttribute(spec: PropSpec, raw: string): StaticConversion {
  switch (spec.kind) {
    case "number": {
      const n = toNumber(raw);
      return n === undefined ? fail(`expected a number, got "${raw}"`) : { ok: true, value: n };
    }
    case "boolean":
      if (raw === "" || raw === "true") return { ok: true, value: true };
      if (raw === "false") return { ok: true, value: false };
      return fail(`expected a boolean ("true" or "false"), got "${raw}"`);
    case "string":
      return { ok: true, value: raw };
    case "color": {
      const t = raw.trim();
      const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t);
      if (hex3) return { ok: true, value: parseInt(hex3[1]! + hex3[1]! + hex3[2]! + hex3[2]! + hex3[3]! + hex3[3]!, 16) };
      if (/^#[0-9a-f]{6}$/i.test(t)) return { ok: true, value: parseInt(t.slice(1), 16) };
      if (/^0x[0-9a-f]{1,6}$/i.test(t)) return { ok: true, value: parseInt(t.slice(2), 16) };
      if (/^#/.test(t)) return fail(`expected a color (#rgb, #rrggbb or 0xrrggbb), got "${raw}"`);
      // Anything else (a CSS color name) is handed to Pixi's Color, which validates it.
      return t === "" ? fail("expected a color, got an empty value") : { ok: true, value: t };
    }
    case "point": {
      const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
      const nums = parts.map(toNumber);
      if (nums.length === 1 && nums[0] !== undefined) return { ok: true, value: nums[0] };
      if (nums.length === 2 && nums[0] !== undefined && nums[1] !== undefined) {
        return { ok: true, value: { x: nums[0], y: nums[1] } };
      }
      return fail(`expected a number or "x, y", got "${raw}"`);
    }
    case "object":
      return fail(`cannot be set statically; bind it with [prop]="..." (expects ${spec.type ?? "an object"})`);
  }
}

/** Shape of an element map entry: what the language service emits per tag. */
export interface ElementMapEntry {
  readonly tag: string;
  readonly node: string;
  readonly props: Readonly<Record<string, string>>;
  readonly events: Readonly<Record<string, SceneEventType>>;
}

/** The Pixi element map as plain data: tag to node class, property TS types and event types. */
export type SceneElementMap = Readonly<Record<SceneTagName | ShapeTagName | HitTagName, ElementMapEntry>>;

/** Build the element map from the table. Cheap and pure; tooling may call it once. */
export function buildElementMap(): SceneElementMap {
  const out: Record<string, ElementMapEntry> = {};
  for (const tag of Object.keys(SCENE_TAGS) as SceneTagName[]) {
    out[tag] = entry(tag, SCENE_TAGS[tag].pixiClass, SCENE_TAGS[tag].props, SCENE_EVENTS);
  }
  for (const tag of Object.keys(SHAPE_TAGS) as ShapeTagName[]) {
    out[tag] = entry(tag, SHAPE_TAGS[tag].pixiShape, SHAPE_TAGS[tag].props, {});
  }
  for (const tag of Object.keys(HIT_TAGS) as HitTagName[]) {
    out[tag] = entry(tag, HIT_TAGS[tag].pixiShape, HIT_TAGS[tag].props, {});
  }
  return out as SceneElementMap;
}

function entry(
  tag: string,
  node: string,
  props: Readonly<Record<string, PropSpec>>,
  events: Readonly<Record<string, SceneEventType>>,
): ElementMapEntry {
  const types: Record<string, string> = {};
  for (const [name, spec] of Object.entries(props)) types[name] = spec.kind === "object" ? (spec.type ?? "unknown") : PROP_KIND_TS[spec.kind];
  return { tag, node, props: types, events };
}
