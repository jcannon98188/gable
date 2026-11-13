// The in-memory scene node of the scene test renderer (TASK-105.8): Pixi's property semantics with no Pixi.
// Free of any pixi.js import. `toData` turns a node into plain data for assertions.
import { SCENE_TAGS, type HitTagName, type PropSpec, type SceneTagName, type ShapeTagName } from "../elements.js";

export interface Point {
  x: number;
  y: number;
}

/** What a loaded texture is in the double: its alias and an author-settable size (never read from a file). */
export interface StubTexture {
  alias: string;
  width: number;
  height: number;
}

export type NodeKind = "node" | "anchor" | "text" | "shape" | "hit";

/** How a tag behaves: its property table, whether text content feeds `text`, and Pixi's default label. */
export interface TagInfo {
  readonly tag: string;
  readonly table: Readonly<Record<string, PropSpec>>;
  readonly textContent: boolean;
  readonly label: string | null;
}

const POINT_NAMES = ["position", "scale", "pivot", "skew", "anchor", "tilePosition", "tileScale"] as const;
const STYLE_FIELDS = new Set(["fontSize", "fontFamily", "fontWeight", "fontStyle", "fill", "stroke", "align", "wordWrap", "wordWrapWidth", "letterSpacing", "lineHeight"]);
export const isStyleField = (name: string) => STYLE_FIELDS.has(name);

const POINT_DEFAULTS: Record<string, Point> = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  pivot: { x: 0, y: 0 },
  skew: { x: 0, y: 0 },
  anchor: { x: 0, y: 0 },
  tilePosition: { x: 0, y: 0 },
  tileScale: { x: 1, y: 1 },
};

/** Pixi's initial value of each property of a tag (the ones Pixi initialises; the rest start unset). */
function defaultsFor(info: TagInfo): Record<string, unknown> {
  const out: Record<string, unknown> = {
    rotation: 0,
    alpha: 1,
    visible: true,
    renderable: true,
    tint: 0xffffff,
    zIndex: 0,
    sortableChildren: true, // the renderer turns it on for every node it creates
    interactiveChildren: true,
    hitArea: null,
    label: info.label,
  };
  for (const name of Object.keys(info.table)) {
    if ((POINT_NAMES as readonly string[]).includes(name)) out[name] = { ...POINT_DEFAULTS[name]! };
  }
  if (!("position" in out)) out.position = { x: 0, y: 0 };
  if ("texture" in info.table) out.texture = null;
  if ("dynamicProperties" in info.table) out.dynamicProperties = {};
  if ("roundPixels" in info.table) out.roundPixels = false;
  if ("tileRotation" in info.table) out.tileRotation = 0;
  if ("leftWidth" in info.table) Object.assign(out, { leftWidth: 10, topHeight: 10, rightWidth: 10, bottomHeight: 10 });
  if (info.textContent) out.text = "";
  return out;
}

export function tagInfoFor(tag: SceneTagName): TagInfo {
  const def = SCENE_TAGS[tag];
  return { tag, table: def.props, textContent: def.textContent === true, label: def.pixiClass === "Container" ? null : def.pixiClass };
}

/** A particle in the double: the plain fields of Pixi's Particle with its defaults. */
export interface StubParticle {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  anchorX: number;
  anchorY: number;
  rotation: number;
  tint: number;
  alpha: number;
  texture: unknown;
}

/** Gives a `particle-container` node the particles() helper protocol (see ../particles.ts), with Pixi's Particle defaults. */
export function attachParticleHost(node: SceneNode): void {
  const host = node as unknown as Record<string, unknown>;
  host.particleChildren = [] as StubParticle[];
  const list = () => host.particleChildren as StubParticle[];
  host.newParticle = (o: Partial<StubParticle> & { tint?: number | string }): StubParticle => ({
    x: o.x ?? 0,
    y: o.y ?? 0,
    scaleX: o.scaleX ?? 1,
    scaleY: o.scaleY ?? 1,
    anchorX: o.anchorX ?? 0,
    anchorY: o.anchorY ?? 0,
    rotation: o.rotation ?? 0,
    tint: (o.tint as number | undefined) ?? 0xffffff,
    alpha: o.alpha ?? 1,
    texture: o.texture ?? node.values.texture ?? null,
  });
  host.addParticle = (...ps: StubParticle[]) => void list().push(...ps);
  host.removeParticle = (...ps: StubParticle[]) => {
    for (const p of ps) {
      const i = list().indexOf(p);
      if (i >= 0) list().splice(i, 1);
    }
  };
  host.removeParticles = () => void (list().length = 0);
  host.update = () => {};
}

type Listener = (event: unknown) => void;

/**
 * A node of the scene tree. Read it freely in tests; change it through the renderer. `children` holds display children
 * in insertion order (anchors included); a graphics node's shapes are in `shapes`, text content is in `textParts`.
 */
export class SceneNode {
  parent: SceneNode | null = null;
  readonly children: SceneNode[] = [];
  readonly shapes: SceneNode[] = [];
  /** Declarative hit-shape children (`<hit-rect>`, ...) in order; with any, they are the node's hit area. */
  readonly hitShapes: SceneNode[] = [];
  /** Text parts of a text node (a `<text>` or `<bitmap-text>`), or the text of a `text` content node. */
  readonly textParts: SceneNode[] = [];
  owner: SceneNode | null = null;
  /** Every non-shape child in markup order, including text the scene ignores: the place `before` is resolved against (as Pixi cannot hold text nodes). */
  readonly layout: SceneNode[] = [];
  layoutParent: SceneNode | null = null;
  destroyed = false;
  readonly attrs: Record<string, string> = {};
  readonly classes: string[] = [];
  readonly styles: Record<string, string> = {};
  readonly listeners: Record<string, Listener[]> = {};
  /** Flat text style fields, merged over `style` on read. */
  readonly style: Record<string, unknown> = {};
  readonly values: Record<string, unknown>;

  constructor(
    readonly kind: NodeKind,
    readonly tag: string,
    readonly info: TagInfo | null,
    public text = "",
  ) {
    this.values = info ? defaultsFor(info) : {};
  }

  /** Measures a node in scene coordinates (set by the renderer; the A11yMirror reads it through `getBounds`). */
  static measure: ((node: SceneNode) => { x: number; y: number; width: number; height: number } | null) | null = null;

  /** The slice of a display node the A11yMirror reads (TASK-105.9): visibility, and bounds from the author-supplied size. */
  get visible(): boolean {
    return this.values.visible !== false;
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return SceneNode.measure?.(this) ?? { x: 0, y: 0, width: 0, height: 0 };
  }

  get label(): string | null {
    return (this.values.label as string | null | undefined) ?? null;
  }

  /** The value as it reads back from Pixi: axis and derived names resolved. */
  rawProperty(name: string): unknown {
    const dot = name.indexOf(".");
    if (dot !== -1) return (this.values[name.slice(0, dot)] as Point | undefined)?.[name.slice(dot + 1) as "x" | "y"];
    if (name === "x") return (this.values.position as Point).x;
    if (name === "y") return (this.values.position as Point).y;
    if (name === "angle") return ((this.values.rotation as number) * 180) / Math.PI;
    if (isStyleField(name) && name in this.style) return this.style[name];
    return this.values[name];
  }

  /** Calls the listeners of `name` with `event`; returns whether any existed. */
  emit(name: string, event: unknown): boolean {
    const list = this.listeners[name];
    if (!list?.length) return false;
    for (const l of [...list]) l(event);
    return true;
  }

  textContent(): string {
    if (this.kind === "text") return this.text;
    if (this.kind === "anchor") return "";
    return this.children.map((c) => c.textContent()).join("");
  }

  /** The text of a text node: its parts joined (what Pixi's `text` holds). */
  joinedText(): string {
    return this.textParts.map((p) => p.text).join("");
  }
}

// --- transforms ---------------------------------------------------------------------------------------------------

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

function multiply(p: Matrix, l: Matrix): Matrix {
  return {
    a: p.a * l.a + p.c * l.b,
    b: p.b * l.a + p.d * l.b,
    c: p.a * l.c + p.c * l.d,
    d: p.b * l.c + p.d * l.d,
    tx: p.a * l.tx + p.c * l.ty + p.tx,
    ty: p.b * l.tx + p.d * l.ty + p.ty,
  };
}

/** Pixi's local transform: position, pivot, scale, skew and rotation. */
export function localMatrix(node: SceneNode): Matrix {
  const v = node.values;
  const pos = v.position as Point;
  const scale = (v.scale as Point | undefined) ?? { x: 1, y: 1 };
  const pivot = (v.pivot as Point | undefined) ?? { x: 0, y: 0 };
  const skew = (v.skew as Point | undefined) ?? { x: 0, y: 0 };
  const rotation = (v.rotation as number | undefined) ?? 0;
  const a = Math.cos(rotation + skew.y) * scale.x;
  const b = Math.sin(rotation + skew.y) * scale.x;
  const c = -Math.sin(rotation - skew.x) * scale.y;
  const d = Math.cos(rotation - skew.x) * scale.y;
  return { a, b, c, d, tx: pos.x - (pivot.x * a + pivot.y * c), ty: pos.y - (pivot.x * b + pivot.y * d) };
}

export function worldMatrix(node: SceneNode): Matrix {
  const chain: SceneNode[] = [];
  for (let n: SceneNode | null = node; n; n = n.parent) if (n.kind === "node") chain.unshift(n);
  return chain.reduce((m, n) => multiply(m, localMatrix(n)), IDENTITY);
}

export function apply(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty };
}

export function invert(m: Matrix): Matrix | null {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    tx: (m.c * m.ty - m.d * m.tx) / det,
    ty: (m.b * m.tx - m.a * m.ty) / det,
  };
}

/** Child nodes in paint order: stable by `zIndex` (Pixi's `sortableChildren`), later children on top. Anchors are skipped. */
export function paintOrder(node: SceneNode): SceneNode[] {
  const kids = node.children.filter((c) => c.kind === "node");
  if (node.values.sortableChildren === false) return kids;
  return kids.map((c, i) => [c, i] as const).sort((p, q) => (((p[0].values.zIndex as number) ?? 0) - ((q[0].values.zIndex as number) ?? 0)) || p[1] - q[1]).map(([c]) => c);
}

// --- plain data ----------------------------------------------------------------------------------------------------

export interface ShapeData {
  tag: ShapeTagName | HitTagName;
  [prop: string]: unknown;
}

/** A node as plain data: every property of its tag that is set, the world position, children in insertion order and in paint order. */
export interface SceneNodeData {
  tag: string;
  label: string | null;
  x: number;
  y: number;
  position: Point;
  scale: Point;
  pivot: Point;
  skew: Point;
  rotation: number;
  angle: number;
  alpha: number;
  visible: boolean;
  renderable: boolean;
  tint: unknown;
  zIndex: number;
  /** The node's origin in scene coordinates, through the parent chain. */
  world: Point;
  /** The loaded texture (alias and stub size), or `null` when none or not loaded. */
  texture: StubTexture | null;
  /** Text of a `<text>` or `<bitmap-text>`. */
  text?: string;
  /** Children in insertion order, anchors skipped. */
  children: SceneNodeData[];
  /** The same children in paint order (`zIndex`, then insertion), later on top. */
  drawChildren: SceneNodeData[];
  /** Particles of a `<particle-container>` in order, as copies. */
  particles?: StubParticle[];
  /** Graphics shapes in order. */
  shapes?: ShapeData[];
  /** Declarative hit-shape children in order (`hit-rect`, ...); empty when the node has none. */
  hitShapes: ShapeData[];
  /** Every property of the node by name (the same values as above, plus tag-specific ones such as `anchor` or `fontSize`). */
  props: Record<string, unknown>;
  /** The node itself, for tests that need the handle. */
  node: SceneNode;
  [prop: string]: unknown;
}

const copyPoint = (p: Point): Point => ({ x: p.x, y: p.y });

export function toData(node: SceneNode): SceneNodeData {
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node.values)) {
    props[name] = (POINT_NAMES as readonly string[]).includes(name) ? copyPoint(value as Point) : value;
  }
  props.x = node.rawProperty("x");
  props.y = node.rawProperty("y");
  props.angle = node.rawProperty("angle");
  for (const [name, value] of Object.entries(node.style)) props[name] = value;
  if (node.info?.textContent) props.text = node.joinedText();
  const kids = node.children.filter((c) => c.kind === "node");
  const kidData = new Map(kids.map((k) => [k, toData(k)] as const));
  const data: SceneNodeData = {
    ...props,
    tag: node.tag,
    label: node.label,
    x: props.x as number,
    y: props.y as number,
    position: copyPoint(node.values.position as Point),
    scale: copyPoint((node.values.scale as Point | undefined) ?? { x: 1, y: 1 }),
    pivot: copyPoint((node.values.pivot as Point | undefined) ?? { x: 0, y: 0 }),
    skew: copyPoint((node.values.skew as Point | undefined) ?? { x: 0, y: 0 }),
    rotation: node.values.rotation as number,
    angle: props.angle as number,
    alpha: node.values.alpha as number,
    visible: node.values.visible as boolean,
    renderable: node.values.renderable as boolean,
    tint: node.values.tint,
    zIndex: node.values.zIndex as number,
    world: apply(worldMatrix(node), { x: 0, y: 0 }),
    texture: (node.values.texture as StubTexture | null | undefined) ?? null,
    children: kids.map((k) => kidData.get(k)!),
    drawChildren: paintOrder(node).map((k) => kidData.get(k)!),
    hitShapes: node.hitShapes.map((s) => ({ tag: s.tag as HitTagName, ...s.values })),
    props,
    node,
  };
  if (node.info?.textContent) data.text = node.joinedText();
  if (node.tag === "particle-container") data.particles = [...(node as unknown as { particleChildren: StubParticle[] }).particleChildren].map((p) => ({ ...p }));
  if (node.tag === "graphics") data.shapes = node.shapes.map((s) => ({ tag: s.tag as ShapeTagName, ...s.values }));
  return data;
}
