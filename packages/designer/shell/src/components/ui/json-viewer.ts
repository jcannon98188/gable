import { computed, html, input, model, output, signal } from "@gable/core";
import { cn } from "../../lib/ui/cn.js";
import { useHostClass } from "../../lib/ui/host-class.js";
import { UiTree, expandableIds, type TreeNode } from "./tree.js";

type Entries = { n: number; key(i: number): string | number; val(i: number): unknown; array: boolean };
interface Link {
  value: unknown;
  up: Link | null;
}
interface Meta {
  kind: "value" | "chunk";
  /** The container (value) or the chunked container's entries (chunk). */
  value: unknown;
  path: string;
  /** Ancestors, for cycle detection; its own value is the head. */
  link: Link | null;
  depth: number;
  entries?: Entries;
  lo?: number;
  hi?: number;
}

const KEY = /^[A-Za-z_$][\w$]*$/;
const joinPath = (base: string, key: string | number, array: boolean): string => (array ? `${base}[${key}]` : KEY.test(String(key)) ? `${base}.${key}` : `${base}[${JSON.stringify(String(key))}]`);
const isContainer = (v: unknown): v is object => typeof v === "object" && v !== null && !(v instanceof Date);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function entriesOf(v: object): Entries {
  if (Array.isArray(v)) return { n: v.length, key: (i) => i, val: (i) => v[i], array: true };
  if (v instanceof Set) {
    const items = [...v];
    return { n: items.length, key: (i) => i, val: (i) => items[i], array: true };
  }
  if (v instanceof Map) {
    const items = [...v];
    return { n: items.length, key: (i) => String(items[i]![0]), val: (i) => items[i]![1], array: false };
  }
  const keys = Object.keys(v);
  return {
    n: keys.length,
    key: (i) => keys[i]!,
    val: (i) => {
      try {
        return (v as Record<string, unknown>)[keys[i]!];
      } catch (error) {
        return error instanceof Error ? `[Error: ${error.message}]` : "[Error]";
      }
    },
    array: false,
  };
}

/** `value` as JSON text for the clipboard: cycles become "[Circular]", bigints, undefined, functions, Dates, Maps and Sets are written readably. */
export function stringifyValue(value: unknown): string {
  const stack: object[] = [];
  const plain = (v: unknown): unknown => {
    if (v === undefined) return "undefined";
    if (typeof v === "bigint") return `${v}n`;
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? "Invalid Date" : v.toISOString();
    if (typeof v === "number" && !Number.isFinite(v)) return String(v);
    if (!isContainer(v)) return v;
    if (stack.includes(v)) return "[Circular]";
    stack.push(v);
    const e = entriesOf(v);
    let out: unknown;
    if (e.array) out = Array.from({ length: e.n }, (_, i) => plain(e.val(i)));
    else {
      const o: Record<string, unknown> = {};
      for (let i = 0; i < e.n; i++) o[String(e.key(i))] = plain(e.val(i));
      out = o;
    }
    stack.pop();
    return out;
  };
  return JSON.stringify(plain(value), null, 2) ?? "undefined";
}

const TYPE_CLASS = "font-mono before:mr-1 before:text-muted-foreground before:content-[':']";

/**
 * A JSON / value viewer on top of `ui-tree`.
 *
 *   <ui-json-viewer [value]="response" label="Response" [maxDepth]="6"></ui-json-viewer>
 *
 * `value` can be any value: objects, arrays, Maps, Sets, Dates, bigints, functions, `undefined`. Containers collapse and
 * expand (children are built when a node first opens, so a huge value costs only what is open); primitives are coloured by
 * type with theme tokens (`text-success` strings, `text-info` numbers, `text-warning` booleans, muted null/undefined). Each
 * row has `path` and `value` buttons that copy the JSON path (`$.items[0].name`) or the value as JSON (through
 * `navigator.clipboard` when there is one; `copied` always fires with `ok`). "Expand all" opens containers up to
 * `expandLimit` nodes. Strings over `maxString` characters are cut with an ellipsis (copy value gives the whole string).
 * A reference back to an ancestor shows `[Circular]` and does not expand. Containers deeper than `maxDepth` show their size
 * and stay closed. Containers with more than `chunkSize` entries group them as `[0..99]`, `[100..199]` and so on (nested
 * for very long ones), so a 100,000 item array opens as a handful of rows.
 *
 * `expanded` is two-way and holds node paths (`$`, `$.items`, `$.items[0]`); chunk rows use `$.items#0-99`.
 */
export class UiJsonViewer {
  static meta = {
    selector: "ui-json-viewer",
    imports: [UiTree],
    template: html`
      <div class="flex items-center gap-2 pb-2">
        <button type="button" class="rounded-md border bg-background px-2 py-1 font-sans text-xs shadow-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50" (click)="expandAll()">Expand all</button>
        <button type="button" class="rounded-md border bg-background px-2 py-1 font-sans text-xs shadow-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50" (click)="collapseAll()">Collapse all</button>
        <span class="sr-only" role="status" aria-live="polite">{{ status() }}</span>
      </div>
      <ui-tree [nodes]="nodes()" [(expanded)]="expanded" selectionMode="single" [virtual]="virtual()" [itemSize]="itemSize()" [label]="label()" [loadChildren]="loader" [class]="treeClass()" (action)="onAction($event)"></ui-tree>
    `,
  };

  /** The value to show. */
  value = input<unknown>(undefined);
  /** Accessible name of the tree. */
  label = input<string>("JSON");
  /** Name of the root row. */
  rootLabel = input<string>("root");
  /** Containers deeper than this (root = 1) show their size and do not open. */
  maxDepth = input<number>(100);
  /** Strings longer than this are truncated in the row. */
  maxString = input<number>(120);
  /** Containers with more entries than this are grouped into `[0..99]` chunks. */
  chunkSize = input<number>(100);
  /** "Expand all" stops after visiting this many nodes. */
  expandLimit = input<number>(2000);
  /** Render only the rows in view (set a height with `treeClass`). */
  virtual = input<boolean>(false);
  itemSize = input<number>(28);
  /** Classes of the inner tree (default caps the height and scrolls). */
  treeClass = input<string>("max-h-96");
  class = input<string>("");
  /** Two-way: paths of the open nodes. Starts with the root open. */
  expanded = model<string[]>(["$"]);
  copied = output<{ kind: "path" | "value"; text: string; ok: boolean }>();

  status = signal("");
  private meta = new Map<string, Meta>();
  private built = new Map<string, TreeNode[]>();
  private apply = useHostClass(() => cn("block font-mono text-sm", this.class()));

  nodes = computed(() => {
    this.meta = new Map();
    this.built = new Map();
    return [this.make(this.rootLabel(), this.value(), "$", null, 1)];
  });

  /** `loadChildren` of the tree: builds a container's children when it first opens (memoised, so Expand all and the tree agree). */
  loader = (node: TreeNode): TreeNode[] => {
    const hit = this.built.get(node.id);
    if (hit) return hit;
    const meta = this.meta.get(node.id);
    const out = meta ? this.childNodes(meta) : [];
    this.built.set(node.id, out);
    return out;
  };

  private make(key: string | number, v: unknown, path: string, link: Link | null, depth: number): TreeNode {
    const label = String(key);
    const actions = [
      { id: "path", label: `Copy path of ${label}`, text: "path" },
      { id: "value", label: `Copy value of ${label}`, text: "value" },
    ];
    if (isContainer(v)) {
      if (this.inChain(link, v)) return { id: path, label, description: "[Circular]", descriptionClass: cn(TYPE_CLASS, "text-destructive"), actions };
      const e = entriesOf(v);
      const kind = v instanceof Map ? `Map(${e.n})` : v instanceof Set ? `Set(${e.n})` : e.array ? `[${plural(e.n, "item")}]` : `{${plural(e.n, "key")}}`;
      const tooDeep = depth > this.maxDepth();
      this.meta.set(path, { kind: "value", value: v, path, link: { value: v, up: link }, depth, entries: e });
      const node: TreeNode = { id: path, label, description: tooDeep && e.n > 0 ? `${kind} …` : kind, descriptionClass: cn(TYPE_CLASS, "text-muted-foreground"), actions };
      if (e.n > 0 && !tooDeep) node.lazy = true;
      return node;
    }
    this.meta.set(path, { kind: "value", value: v, path, link, depth });
    const [text, color] = this.primitive(v);
    return { id: path, label, description: text, descriptionClass: cn(TYPE_CLASS, color), actions };
  }

  private primitive(v: unknown): [string, string] {
    if (typeof v === "string") {
      const max = this.maxString();
      return [v.length > max ? `${JSON.stringify(v.slice(0, max)).slice(0, -1)}…" (${v.length} chars)` : JSON.stringify(v), "text-success"];
    }
    if (typeof v === "number") return [String(v), "text-info"];
    if (typeof v === "bigint") return [`${v}n`, "text-info"];
    if (typeof v === "boolean") return [String(v), "text-warning"];
    if (v === null) return ["null", "italic text-muted-foreground"];
    if (v === undefined) return ["undefined", "italic text-muted-foreground"];
    if (v instanceof Date) return [Number.isNaN(v.getTime()) ? "Invalid Date" : v.toISOString(), "text-info"];
    if (typeof v === "function") return [`ƒ ${v.name || "anonymous"}()`, "italic text-muted-foreground"];
    return [String(v), "text-muted-foreground"];
  }

  private inChain(link: Link | null, v: object): boolean {
    for (let l = link; l; l = l.up) if (l.value === v) return true;
    return false;
  }

  private childNodes(meta: Meta): TreeNode[] {
    const e = meta.entries!;
    return this.range(meta, e, meta.kind === "chunk" ? meta.lo! : 0, meta.kind === "chunk" ? meta.hi! : e.n);
  }

  private range(parent: Meta, e: Entries, lo: number, hi: number): TreeNode[] {
    const chunk = Math.max(2, this.chunkSize());
    const span = hi - lo;
    const out: TreeNode[] = [];
    if (span <= chunk) {
      for (let i = lo; i < hi; i++) {
        const key = e.key(i);
        out.push(this.make(key, e.val(i), joinPath(parent.path, key, e.array), parent.link, parent.depth + 1));
      }
      return out;
    }
    let group = chunk;
    while (span / group > chunk) group *= chunk;
    for (let start = lo; start < hi; start += group) {
      const end = Math.min(hi, start + group);
      const id = `${parent.path}#${start}-${end - 1}`;
      this.meta.set(id, { kind: "chunk", value: parent.value, path: parent.path, link: parent.link, depth: parent.depth, entries: e, lo: start, hi: end });
      const [open, close] = e.array ? ["[", "]"] : ["{", "}"];
      out.push({ id, label: `${open}${start}..${end - 1}${close}`, description: plural(end - start, e.array ? "item" : "key"), descriptionClass: cn(TYPE_CLASS, "text-muted-foreground"), lazy: true });
    }
    return out;
  }

  expandAll(): void {
    this.expanded.set(expandableIds(this.nodes(), { children: (n) => (n.lazy ? this.loader(n) : n.children), limit: this.expandLimit() }));
    this.status.set("Expanded all");
  }

  collapseAll(): void {
    this.expanded.set([]);
    this.status.set("Collapsed all");
  }

  onAction(event: { node: TreeNode; action: string }): void {
    const meta = this.meta.get(event.node.id);
    if (!meta || meta.kind !== "value") return;
    const kind = event.action === "path" ? "path" : "value";
    const text = kind === "path" ? meta.path : stringifyValue(meta.value);
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    const done = (ok: boolean) => {
      this.status.set(ok ? `Copied ${kind}` : `Could not copy ${kind}`);
      this.copied.emit({ kind, text, ok });
    };
    if (!clip || typeof clip.writeText !== "function") return done(false);
    try {
      clip.writeText(text).then(() => done(true), () => done(false));
    } catch {
      done(false);
    }
  }
}
