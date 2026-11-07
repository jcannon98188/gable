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

export function yToFragment(parent: YParent, schema: Schema): Fragment {
  const nodes: PMNode[] = [];
  for (const child of parent.toArray()) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as Array<{ insert: unknown; attributes?: Record<string, unknown> }>) {
        if (typeof op.insert === "string" && op.insert.length > 0) {
          nodes.push(schema.text(op.insert, marksFromAttrs(schema, op.attributes)));
        }
      }
    } else if (child instanceof Y.XmlElement) {
      const type = schema.nodes[child.nodeName];
      if (!type || type.isText) continue; // unknown node from a peer with a newer schema: drop it
      nodes.push(type.create(child.getAttributes(), yToFragment(child, schema)));
    }
  }
  return Fragment.fromArray(nodes);
}

export function yToDoc(fragment: Y.XmlFragment, schema: Schema): PMNode {
  return schema.topNodeType.create(null, yToFragment(fragment, schema));
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

export function createYText(nodes: readonly PMNode[]): Y.XmlText {
  const t = new Y.XmlText();
  // applyDelta on an unintegrated type queues the ops; they apply on integration.
  t.applyDelta(textOps(nodes).map((o) => ({ insert: o.insert, attributes: o.attributes })));
  return t;
}

export function createYElement(node: PMNode): Y.XmlElement {
  const el = new Y.XmlElement(node.type.name);
  for (const [k, v] of Object.entries(node.attrs)) if (v !== undefined) el.setAttribute(k, v as never);
  const children = childSpecs(node).map(createYChild);
  if (children.length) el.insert(0, children);
  return el;
}

export function createYChild(spec: Spec): YChild {
  return spec.kind === "text" ? createYText(spec.nodes) : createYElement(spec.node);
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
  if (sEnd > ss) y.insert(ys, specs.slice(ss, sEnd).map(createYChild));
}

export function updateYFragment(fragment: Y.XmlFragment, doc: PMNode): void {
  updateChildren(fragment, childSpecs(doc));
}

// ---- positions ------------------------------------------------------------------------------

export function ySize(child: YChild, schema: Schema): number {
  if (child instanceof Y.XmlText) return child.length;
  const type = schema.nodes[child.nodeName];
  if (!type) return 0;
  if (type.isLeaf) return 1;
  let n = 2;
  for (const c of child.toArray() as YChild[]) n += ySize(c, schema);
  return n;
}

/** Document position of the start of `child`'s content region (inside its open token). */
function innerStart(parent: YParent, schema: Schema): number {
  if (parent instanceof Y.XmlFragment && !(parent instanceof Y.XmlElement)) return 0;
  return startOf(parent as Y.XmlElement, schema) + 1;
}

function startOf(child: YChild, schema: Schema): number {
  const parent = child.parent as YParent;
  let pos = innerStart(parent, schema);
  for (const sib of parent.toArray() as YChild[]) {
    if (sib === child) return pos;
    pos += ySize(sib, schema);
  }
  return pos;
}

/** ProseMirror position for a Yjs (type, index) pair, where index counts children or characters. */
export function yToPmPos(type: Y.AbstractType<any>, index: number, schema: Schema): number {
  if (type instanceof Y.XmlText) return startOf(type, schema) + index;
  const parent = type as YParent;
  let pos = innerStart(parent, schema);
  const kids = parent.toArray() as YChild[];
  for (let i = 0; i < index && i < kids.length; i++) pos += ySize(kids[i]!, schema);
  return pos;
}

/** Inverse of yToPmPos against the current doc, which must be in sync with `fragment`. */
export function pmToYPos(doc: PMNode, fragment: Y.XmlFragment, pos: number): { type: Y.AbstractType<any>; index: number } {
  let node = doc;
  let container: YParent = fragment;
  let rel = pos;
  for (;;) {
    const specs = childSpecs(node);
    const ych = container.toArray() as YChild[];
    let offset = 0;
    let descended = false;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]!;
      const size = specSize(spec);
      if (spec.kind === "text") {
        if (rel >= offset && rel <= offset + size) return { type: ych[i]!, index: rel - offset };
      } else {
        if (rel === offset) return { type: container, index: i };
        if (rel > offset && rel < offset + size) {
          node = spec.node;
          container = ych[i] as Y.XmlElement;
          rel = rel - offset - 1;
          descended = true;
          break;
        }
      }
      offset += size;
    }
    if (!descended) return { type: container, index: specs.length };
  }
}
