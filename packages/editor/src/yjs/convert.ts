import { Fragment, Mark, Node as PMNode, type Schema } from "@tiptap/pm/model";
import * as Y from "yjs";

/**
 * Document layout in Yjs (same shape y-prosemirror uses, so existing documents stay readable):
 *   Y.XmlFragment
 *     Y.XmlElement  nodeName = node type name, attributes = node attrs, children = block/inline children
 *     Y.XmlText     one per run of consecutive text nodes; marks are delta attributes {markName: markAttrs}
 */
export type YParent = Y.XmlFragment | Y.XmlElement;
export type YChild = Y.XmlElement | Y.XmlText;

/** One Yjs child of a ProseMirror node: a run of text nodes, or a single element-like node. */
export type Spec = { kind: "text"; nodes: PMNode[] } | { kind: "el"; node: PMNode };

export function childSpecs(node: PMNode): Spec[] {
  const out: Spec[] = [];
  node.forEach((child) => {
    if (child.isText) {
      const last = out[out.length - 1];
      if (last && last.kind === "text") last.nodes.push(child);
      else out.push({ kind: "text", nodes: [child] });
    } else out.push({ kind: "el", node: child });
  });
  return out;
}

export function specSize(spec: Spec): number {
  return spec.kind === "el" ? spec.node.nodeSize : spec.nodes.reduce((n, c) => n + c.nodeSize, 0);
}

export function stable(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

// ---- Yjs -> ProseMirror ---------------------------------------------------------------------

export function marksFromAttrs(schema: Schema, attrs: Record<string, unknown> | undefined): Mark[] {
  if (!attrs) return [];
  const marks: Mark[] = [];
  for (const [name, value] of Object.entries(attrs)) {
    const type = schema.marks[name];
    if (type) marks.push(type.create((value ?? {}) as Record<string, unknown>));
  }
  return Mark.setFrom(marks) as Mark[];
}

/**
 * Per-document memo that makes work proportional to what changed instead of to the document. It holds the ProseMirror
 * node last built (or last pushed) for each Yjs element and text, and each element's size in the position space.
 * Entries are dropped for every changed Yjs type and all of its ancestors; everything else stays valid, so unchanged
 * subtrees are reused as the very same node objects (which also makes ProseMirror's own diffing cheap).
 */
export class DocCache {
  readonly nodes = new WeakMap<Y.AbstractType<any>, PMNode>();
  readonly texts = new WeakMap<Y.XmlText, PMNode[]>();
  readonly sizes = new WeakMap<Y.AbstractType<any>, number>();

  invalidate(type: Y.AbstractType<any>): void {
    let t: Y.AbstractType<any> | null = type;
    while (t) {
      this.nodes.delete(t);
      this.sizes.delete(t);
      if (t instanceof Y.XmlText) this.texts.delete(t);
      t = t.parent as Y.AbstractType<any> | null;
    }
  }

  apply(seeds: Seeds): void {
    for (const [y, node] of seeds.els) this.nodes.set(y, node);
    for (const [y, nodes] of seeds.texts) this.texts.set(y, nodes);
  }
}

/** Yjs types a local push created or verified, with the ProseMirror node each one now equals. */
export interface Seeds {
  els: Array<[Y.XmlElement, PMNode]>;
  texts: Array<[Y.XmlText, PMNode[]]>;
}

export function yToFragment(parent: YParent, schema: Schema, cache?: DocCache): Fragment {
  const nodes: PMNode[] = [];
  for (const child of parent.toArray()) {
    if (child instanceof Y.XmlText) {
      let runs = cache?.texts.get(child);
      if (!runs) {
        runs = [];
        for (const op of child.toDelta() as Array<{ insert: unknown; attributes?: Record<string, unknown> }>) {
          if (typeof op.insert === "string" && op.insert.length > 0) {
            runs.push(schema.text(op.insert, marksFromAttrs(schema, op.attributes)));
          }
        }
        cache?.texts.set(child, runs);
      }
      for (const n of runs) nodes.push(n);
    } else if (child instanceof Y.XmlElement) {
      let node = cache?.nodes.get(child);
      if (!node) {
        const type = schema.nodes[child.nodeName];
        if (!type || type.isText) continue; // unknown node from a peer with a newer schema: drop it
        node = type.create(child.getAttributes(), yToFragment(child, schema, cache));
        cache?.nodes.set(child, node);
      }
      nodes.push(node);
    }
  }
  return Fragment.fromArray(nodes);
}

export function yToDoc(fragment: Y.XmlFragment, schema: Schema, cache?: DocCache): PMNode {
  return schema.topNodeType.create(null, yToFragment(fragment, schema, cache));
}

// ---- ProseMirror -> Yjs ---------------------------------------------------------------------

type DeltaOp = { insert: string; attributes: Record<string, unknown> };

function markAttrs(marks: readonly Mark[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of marks) out[m.type.name] = m.attrs;
  return out;
}

/** Target Y.XmlText content for a run of text nodes, with adjacent equal-format segments merged. */
export function textOps(nodes: readonly PMNode[]): DeltaOp[] {
  const ops: DeltaOp[] = [];
  for (const n of nodes) {
    const attributes = markAttrs(n.marks);
    const last = ops[ops.length - 1];
    if (last && stable(last.attributes) === stable(attributes)) last.insert += n.text!;
    else ops.push({ insert: n.text!, attributes });
  }
  return ops;
}

function yTextOps(text: Y.XmlText): DeltaOp[] {
  return (text.toDelta() as Array<{ insert: unknown; attributes?: Record<string, unknown> }>)
    .filter((o) => typeof o.insert === "string")
    .map((o) => ({ insert: o.insert as string, attributes: o.attributes ?? {} }));
}

function perChar(ops: DeltaOp[]): { text: string; attrs: string[]; raw: Record<string, unknown>[] } {
  let text = "";
  const attrs: string[] = [];
  const raw: Record<string, unknown>[] = [];
  for (const o of ops) {
    const key = stable(o.attributes);
    for (let i = 0; i < o.insert.length; i++) {
      attrs.push(key);
      raw.push(o.attributes);
    }
    text += o.insert;
  }
  return { text, attrs, raw };
}

export function createYText(nodes: readonly PMNode[], seeds?: Seeds): Y.XmlText {
  const t = new Y.XmlText();
  seeds?.texts.push([t, [...nodes]]);
  // applyDelta on an unintegrated type queues the ops; they apply on integration.
  t.applyDelta(textOps(nodes).map((o) => ({ insert: o.insert, attributes: o.attributes })));
  return t;
}

export function createYElement(node: PMNode, seeds?: Seeds): Y.XmlElement {
  const el = new Y.XmlElement(node.type.name);
  seeds?.els.push([el, node]);
  for (const [k, v] of Object.entries(node.attrs)) if (v !== undefined) el.setAttribute(k, v as never);
  const children = childSpecs(node).map((c) => createYChild(c, seeds));
  if (children.length) el.insert(0, children);
  return el;
}

export function createYChild(spec: Spec, seeds?: Seeds): YChild {
  return spec.kind === "text" ? createYText(spec.nodes, seeds) : createYElement(spec.node, seeds);
}

export function specEquals(spec: Spec, y: YChild): boolean {
  if (spec.kind === "text") {
    if (!(y instanceof Y.XmlText)) return false;
    return stable(textOps(spec.nodes)) === stable(yTextOps(y));
  }
  if (!(y instanceof Y.XmlElement) || y.nodeName !== spec.node.type.name) return false;
  return attrsEqual(spec.node, y) && childrenEqual(childSpecs(spec.node), y);
}

function attrsEqual(node: PMNode, y: Y.XmlElement): boolean {
  const ya = y.getAttributes();
  for (const [k, v] of Object.entries(node.attrs)) {
    if (v === undefined) continue;
    if (stable(ya[k]) !== stable(v)) return false;
  }
  return true;
}

function childrenEqual(specs: Spec[], y: YParent): boolean {
  const ych = y.toArray() as YChild[];
  return specs.length === ych.length && specs.every((s, i) => specEquals(s, ych[i]!));
}

function updateText(y: Y.XmlText, nodes: readonly PMNode[]): void {
  const target = perChar(textOps(nodes));
  const cur = perChar(yTextOps(y));
  const a = cur.text;
  const b = target.text;
  let left = 0;
  const max = Math.min(a.length, b.length);
  while (left < max && a[left] === b[left]) left++;
  let right = 0;
  while (right < max - left && a[a.length - 1 - right] === b[b.length - 1 - right]) right++;
  const delLen = a.length - left - right;
  if (delLen > 0) y.delete(left, delLen);
  // Insert the new middle with its target formatting, one segment per attribute run.
  let i = left;
  const end = b.length - right;
  while (i < end) {
    let j = i + 1;
    while (j < end && target.attrs[j] === target.attrs[i]) j++;
    y.insert(i, b.slice(i, j), target.raw[i]!);
    i = j;
  }
  // Fix formatting of the unchanged prefix/suffix.
  const after = perChar(yTextOps(y));
  let k = 0;
  while (k < b.length) {
    if (after.attrs[k] === target.attrs[k]) {
      k++;
      continue;
    }
    let m = k + 1;
    while (m < b.length && after.attrs[m] === after.attrs[k] && target.attrs[m] === target.attrs[k]) m++;
    const diff: Record<string, unknown> = { ...target.raw[k] };
    for (const key of Object.keys(after.raw[k]!)) if (!(key in diff)) diff[key] = null;
    y.format(k, m - k, diff);
    k = m;
  }
}

function updateElement(y: Y.XmlElement, node: PMNode): void {
  const ya = y.getAttributes();
  for (const [k, v] of Object.entries(node.attrs)) {
    if (v !== undefined && stable(ya[k]) !== stable(v)) y.setAttribute(k, v as never);
  }
  for (const k of Object.keys(ya)) if (!(k in node.attrs)) y.removeAttribute(k);
  updateChildren(y, childSpecs(node));
}

/** Reconcile the children of `y` with `specs`, touching as little of the Yjs tree as possible. */
export function updateChildren(y: YParent, specs: Spec[]): void {
  const ych = y.toArray() as YChild[];
  const min = Math.min(specs.length, ych.length);
  let left = 0;
  while (left < min && specEquals(specs[left]!, ych[left]!)) left++;
  let right = 0;
  while (right < min - left && specEquals(specs[specs.length - 1 - right]!, ych[ych.length - 1 - right]!)) right++;
  let ys = left;
  let ss = left;
  const yEnd = ych.length - right;
  const sEnd = specs.length - right;
  // Pair up compatible neighbours so concurrent edits inside them are preserved.
  while (ys < yEnd && ss < sEnd) {
    const s = specs[ss]!;
    const c = ych[ys]!;
    if (s.kind === "text" && c instanceof Y.XmlText) updateText(c, s.nodes);
    else if (s.kind === "el" && c instanceof Y.XmlElement && c.nodeName === s.node.type.name) updateElement(c, s.node);
    else break;
    ys++;
    ss++;
  }
  if (yEnd > ys) y.delete(ys, yEnd - ys);
  if (sEnd > ss) y.insert(ys, specs.slice(ss, sEnd).map((spec) => createYChild(spec)));
}

export function updateYFragment(fragment: Y.XmlFragment, doc: PMNode): void {
  updateChildren(fragment, childSpecs(doc));
}

// ---- incremental ProseMirror -> Yjs -----------------------------------------------------------

function sameSpec(a: Spec, b: Spec): boolean {
  if (a.kind === "el") return b.kind === "el" && a.node === b.node;
  return b.kind === "text" && a.nodes.length === b.nodes.length && a.nodes.every((n, i) => n === b.nodes[i]);
}

function matches(spec: Spec, y: YChild | undefined): boolean {
  if (spec.kind === "text") return y instanceof Y.XmlText;
  return y instanceof Y.XmlElement && y.nodeName === spec.node.type.name;
}

/**
 * Push the difference between two versions of a node into its Yjs counterpart. `oldNode` must be what `y` currently
 * holds. Subtrees that are the same node object in both versions are skipped without looking at them (ProseMirror shares
 * unchanged nodes between document versions), so the cost follows the size of the edit, not the document. Anything that
 * does not line up falls back to the full reconcile for that one parent.
 */
export function syncChildren(y: YParent, oldNode: PMNode, newNode: PMNode, seeds?: Seeds): void {
  // A block container holds only elements, so its children are its specs one for one: compare them in place and only
  // build specs for the part that changed (a long document must not allocate a spec per paragraph per keystroke).
  const blocks = !oldNode.inlineContent && !newNode.inlineContent;
  const oldCount = blocks ? oldNode.childCount : 0;
  const oldAll = blocks ? null : childSpecs(oldNode);
  const newAll = blocks ? null : childSpecs(newNode);
  const oldLen = blocks ? oldCount : oldAll!.length;
  const newLen = blocks ? newNode.childCount : newAll!.length;
  if (y.length !== oldLen) return updateChildren(y, childSpecs(newNode));
  const same = blocks
    ? (i: number, j: number) => oldNode.child(i) === newNode.child(j)
    : (i: number, j: number) => sameSpec(oldAll![i]!, newAll![j]!);
  const min = Math.min(oldLen, newLen);
  let left = 0;
  while (left < min && same(left, left)) left++;
  let right = 0;
  while (right < min - left && same(oldLen - 1 - right, newLen - 1 - right)) right++;
  const oldEnd = oldLen - right;
  const newEnd = newLen - right;
  const slice = (node: PMNode, all: Spec[] | null, from: number, to: number): Spec[] => {
    if (all) return all.slice(from, to);
    const out: Spec[] = [];
    for (let i = from; i < to; i++) out.push({ kind: "el", node: node.child(i) });
    return out;
  };
  const ych = oldEnd > left ? (y.slice(left, oldEnd) as YChild[]) : [];
  const oldMid = slice(oldNode, oldAll, left, oldEnd);
  const newMid = slice(newNode, newAll, left, newEnd);
  if (!oldMid.every((spec, k) => matches(spec, ych[k]))) return updateChildren(y, childSpecs(newNode));
  let i = 0;
  while (left + i < oldEnd && left + i < newEnd) {
    const o = oldMid[i]!;
    const n = newMid[i]!;
    const c = ych[i]!;
    if (n.kind === "text" && o.kind === "text" && c instanceof Y.XmlText) {
      updateText(c, n.nodes);
      seeds?.texts.push([c, [...n.nodes]]);
    } else if (n.kind === "el" && o.kind === "el" && c instanceof Y.XmlElement && c.nodeName === n.node.type.name) {
      syncElement(c, o.node, n.node, seeds);
    } else break;
    i++;
  }
  if (oldEnd > left + i) y.delete(left + i, oldEnd - left - i);
  if (newEnd > left + i) y.insert(left + i, newMid.slice(i).map((spec) => createYChild(spec, seeds)));
}

function syncElement(y: Y.XmlElement, oldNode: PMNode, newNode: PMNode, seeds?: Seeds): void {
  if (oldNode === newNode) return;
  if (oldNode.attrs !== newNode.attrs) {
    const ya = y.getAttributes();
    for (const [k, v] of Object.entries(newNode.attrs)) {
      if (v !== undefined && stable(ya[k]) !== stable(v)) y.setAttribute(k, v as never);
    }
    for (const k of Object.keys(ya)) if (!(k in newNode.attrs)) y.removeAttribute(k);
  }
  syncChildren(y, oldNode, newNode, seeds);
  seeds?.els.push([y, newNode]);
}

// ---- positions ------------------------------------------------------------------------------

export function ySize(child: YChild, schema: Schema, cache?: DocCache): number {
  if (child instanceof Y.XmlText) return child.length;
  const known = cache?.sizes.get(child);
  if (known !== undefined) return known;
  const type = schema.nodes[child.nodeName];
  if (!type) return 0;
  let n = 1;
  if (!type.isLeaf) {
    n = 2;
    for (const c of child.toArray() as YChild[]) n += ySize(c, schema, cache);
  }
  cache?.sizes.set(child, n);
  return n;
}

/** Document position of the start of `child`'s content region (inside its open token). */
function innerStart(parent: YParent, schema: Schema, cache?: DocCache): number {
  if (parent instanceof Y.XmlFragment && !(parent instanceof Y.XmlElement)) return 0;
  return startOf(parent as Y.XmlElement, schema, cache) + 1;
}

function startOf(child: YChild, schema: Schema, cache?: DocCache): number {
  const parent = child.parent as YParent;
  let pos = innerStart(parent, schema, cache);
  for (const sib of parent.toArray() as YChild[]) {
    if (sib === child) return pos;
    pos += ySize(sib, schema, cache);
  }
  return pos;
}

/** ProseMirror position for a Yjs (type, index) pair, where index counts children or characters. */
export function yToPmPos(type: Y.AbstractType<any>, index: number, schema: Schema, cache?: DocCache): number {
  if (type instanceof Y.XmlText) return startOf(type, schema, cache) + index;
  const parent = type as YParent;
  let pos = innerStart(parent, schema, cache);
  const kids = parent.toArray() as YChild[];
  for (let i = 0; i < index && i < kids.length; i++) pos += ySize(kids[i]!, schema, cache);
  return pos;
}

/** Inverse of yToPmPos against the current doc, which must be in sync with `fragment`. */
export function pmToYPos(doc: PMNode, fragment: Y.XmlFragment, pos: number): { type: Y.AbstractType<any>; index: number } {
  let node = doc;
  let container: YParent = fragment;
  let rel = pos;
  for (;;) {
    if (!node.inlineContent) {
      // Every child is an element, so the Yjs index equals the ProseMirror index.
      const { node: child, index, offset } = node.childAfter(rel);
      if (!child || rel === offset || child.isLeaf) return { type: container, index };
      container = container.get(index) as Y.XmlElement;
      node = child;
      rel = rel - offset - 1;
      continue;
    }
    // A textblock: runs of text nodes share one Yjs text, so walk the (few) children.
    const specs = childSpecs(node);
    let offset = 0;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]!;
      const size = specSize(spec);
      if (spec.kind === "text") {
        if (rel >= offset && rel <= offset + size) return { type: container.get(i) as Y.XmlText, index: rel - offset };
      } else if (rel === offset) return { type: container, index: i };
      offset += size;
    }
    return { type: container, index: specs.length };
  }
}
