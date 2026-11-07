import { computed, html, injectHost, input, model, output, signal, untracked } from "@gable/core";
import { whenFlushed } from "@gable/core/internal";
import { UiProps, bindProps, useVirtualizer } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";
import { UiIcon } from "../lib/icon.js";

/** A small button at the end of a row (copy, open...). Only the focused row's buttons are in the tab order. */
export interface TreeAction {
  id: string;
  /** Accessible name. */
  label: string;
  /** Visible text (default: the label). */
  text?: string;
}

/** One node of a tree. Branches have `children`, or `lazy: true` when `loadChildren` supplies them on first expand. */
export interface TreeNode {
  /** Unique across the whole tree: it is the value of `expanded` and `selected` and the `@for` track key. */
  id: string;
  label: string;
  children?: TreeNode[];
  /** Children are fetched with the tree's `loadChildren` the first time the node expands. */
  lazy?: boolean;
  disabled?: boolean;
  /** Name of an icon registered in `lib/icon.ts`. */
  icon?: string;
  /** Muted text after the label (a value, a size...). */
  description?: string;
  /** Classes for the description (colour it by type). */
  descriptionClass?: string;
  actions?: TreeAction[];
}

export type TreeSelectionMode = "none" | "single" | "multiple";

/** A visible node: the tree flattened to the rows that are showing, with its ARIA position. */
export interface FlatTreeNode {
  node: TreeNode;
  id: string;
  /** 1-based depth. */
  level: number;
  /** Number of siblings, and this node's 1-based position among them (`aria-setsize`, `aria-posinset`). */
  setSize: number;
  posInSet: number;
  /** Index of the parent in the flat list, -1 for roots. */
  parent: number;
  expandable: boolean;
  expanded: boolean;
  disabled: boolean;
}

/**
 * The visible rows of a tree, in order. `children(node, expanding)` returns a node's children, or `undefined` for a lazy
 * node that has not loaded (it may start loading when `expanding`). Iterative, so a very deep tree cannot overflow the stack.
 */
export function flattenTree(nodes: readonly TreeNode[], expanded: ReadonlySet<string>, children: (node: TreeNode, expanding: boolean) => readonly TreeNode[] | undefined = (n) => n.children): FlatTreeNode[] {
  const out: FlatTreeNode[] = [];
  const stack: Array<{ list: readonly TreeNode[]; i: number; level: number; parent: number }> = [{ list: nodes, i: 0, level: 1, parent: -1 }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.i >= frame.list.length) {
      stack.pop();
      continue;
    }
    const node = frame.list[frame.i++]!;
    const open = expanded.has(node.id);
    const kids = children(node, open);
    const expandable = kids ? kids.length > 0 : !!node.lazy;
    const index = out.length;
    out.push({ node, id: node.id, level: frame.level, setSize: frame.list.length, posInSet: frame.i, parent: frame.parent, expandable, expanded: expandable && open, disabled: !!node.disabled });
    if (expandable && open && kids && kids.length > 0) stack.push({ list: kids, i: 0, level: frame.level + 1, parent: index });
  }
  return out;
}

/**
 * Ids of the nodes that can expand, depth first, for an "expand all" button. `limit` stops the walk (a huge tree would
 * otherwise open everything); `maxDepth` stops at a depth (1 = roots only).
 */
export function expandableIds(nodes: readonly TreeNode[], options: { children?: (node: TreeNode) => readonly TreeNode[] | undefined; maxDepth?: number; limit?: number } = {}): string[] {
  const kidsOf = options.children ?? ((n: TreeNode) => n.children);
  const maxDepth = options.maxDepth ?? Infinity;
  const limit = options.limit ?? Infinity;
  const out: string[] = [];
  let visited = 0;
  const stack: Array<{ node: TreeNode; level: number }> = [];
  for (let i = nodes.length - 1; i >= 0; i--) stack.push({ node: nodes[i]!, level: 1 });
  while (stack.length > 0 && visited < limit) {
    const { node, level } = stack.pop()!;
    visited++;
    const kids = kidsOf(node);
    if (!kids || kids.length === 0 || level >= maxDepth) continue;
    out.push(node.id);
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i]!, level: level + 1 });
  }
  return out;
}

const ROW =
  "flex h-7 items-center gap-1 rounded-sm px-1 text-sm outline-none cursor-default select-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset";

/**
 * A tree view: file explorers, inspectors, nested navigation.
 *
 *   <ui-tree [nodes]="files" [(expanded)]="open" [(selected)]="picked" selectionMode="multiple" label="Files"></ui-tree>
 *
 * `nodes` is data (`{ id, label, children?, lazy?, disabled?, icon?, description?, actions? }`). `expanded` and `selected` are
 * two-way lists of node ids. `selectionMode` is `none` (default), `single` or `multiple`. The tree is the scroll container:
 * give it a height with a class when it can be long.
 *
 * Keyboard (one row is the tab stop; roving focus): Up/Down move, Right expands a closed branch or steps into it, Left
 * collapses an open branch or steps to its parent, Home/End, `*` expands the siblings, typing jumps to a label. Enter selects
 * and fires `activated`; Space selects (toggles in `multiple`). In `multiple`: Shift+Arrow extends the range, Ctrl/Meta+click
 * toggles, Shift+click selects a range, Ctrl+A selects all. A click on the chevron only expands.
 *
 * `loadChildren(node)` supplies the children of `lazy` nodes the first time they open (an array, or a promise of one while
 * the row shows `aria-busy`).
 *
 * `virtual` renders only the rows in view (`useVirtualizer`, fixed `itemSize`): the visible nodes are flattened and 10,000 or
 * more cost about as much as 30. Every row still carries `aria-level`, `aria-setsize` and `aria-posinset` for its own level,
 * and keyboard moves scroll the target in and focus it. It measures the real element, so it needs a browser (tests mock layout
 * and send a `scroll` event with `scrollTop` and `clientHeight`).
 *
 * Built natively: `@zag-js/tree-view` is not installed and a virtualised, flattened model does not map onto its nested parts.
 */
export class UiTree {
  static meta = {
    selector: "ui-tree",
    imports: [UiProps, UiIcon],
    template: html`
      <div [attr.style]="spacerStyle()">
        @for (row of rows(); track row.key) {
          <div [uiProps]="row.props" (click)="onClick($event, row.index)" (keydown)="onKey($event, row.index)">
            <span class="shrink-0" [attr.style]="row.indent"></span>
            @if (row.expandable) {
              <span class="flex size-5 shrink-0 items-center justify-center text-muted-foreground" (click)="onToggle($event, row.index)">
                <svg uiIcon="chevron-right" class="size-4 transition-transform" [attr.data-open]="row.open"></svg>
              </span>
            } @else {
              <span class="size-5 shrink-0"></span>
            }
            @if (row.icon) {
              <svg [uiIcon]="row.icon" class="size-4 text-muted-foreground"></svg>
            }
            <span class="truncate">{{ row.label }}</span>
            @if (row.description) {
              <span [attr.class]="row.descriptionClass">{{ row.description }}</span>
            }
            @if (row.actions.length > 0) {
              <span class="ml-auto flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-data-[active]:opacity-100">
                @for (a of row.actions; track a.id) {
                  <button type="button" class="rounded-sm border px-1.5 text-xs text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none" [attr.aria-label]="a.label" [attr.tabindex]="a.tabindex" (click)="onAction($event, row.index, a.id)">{{ a.text }}</button>
                }
              </span>
            }
          </div>
        }
      </div>
    `,
  };

  nodes = input<TreeNode[]>([]);
  /** Two-way: ids of the open branches. */
  expanded = model<string[]>([]);
  /** Two-way: ids of the selected nodes. */
  selected = model<string[]>([]);
  selectionMode = input<TreeSelectionMode>("none");
  /** Render only the rows in view (needs a fixed `itemSize` and a height on the tree). */
  virtual = input<boolean>(false);
  /** Row height in px in `virtual` mode. */
  itemSize = input<number>(28);
  /** Indent per level, px. */
  indent = input<number>(16);
  /** Accessible name. */
  label = input<string>("");
  /** Supplies the children of `lazy` nodes. */
  loadChildren = input<((node: TreeNode) => TreeNode[] | Promise<TreeNode[]>) | null>(null);
  class = input<string>("");
  /** Enter, or a plain click, on a row. */
  activated = output<TreeNode>();
  /** A row's action button. */
  action = output<{ node: TreeNode; action: string }>();
  loadFailed = output<{ node: TreeNode; error: unknown }>();

  private hostRef = injectHost<unknown>();
  private cache = new Map<string, TreeNode[]>();
  private inflight = new Set<string>();
  private cacheFor: unknown = null;
  private version = signal(0);
  private busy = signal<ReadonlySet<string>>(new Set());
  private activeId = signal<string | null>(null);
  private anchorId: string | null = null;
  private typed = { text: "", at: 0 };

  private expandedSet = computed(() => new Set(this.expanded()));
  private selectedSet = computed(() => new Set(this.selected()));

  /** The visible nodes. */
  flat = computed(() => {
    this.version();
    const nodes = this.nodes();
    if (this.cacheFor !== nodes) {
      this.cache.clear();
      this.inflight.clear();
      this.cacheFor = nodes;
    }
    return flattenTree(nodes, this.expandedSet(), (node, expanding) => this.childrenOf(node, expanding));
  });

  private indexOf = computed(() => {
    const map = new Map<string, number>();
    this.flat().forEach((f, i) => map.set(f.id, i));
    return map;
  });

  /** Index of the tab stop: the active row, else the first one that is not disabled. */
  activeIndex = computed(() => {
    const flat = this.flat();
    const id = this.activeId();
    const i = id === null ? -1 : (this.indexOf().get(id) ?? -1);
    if (i >= 0) return i;
    return flat.findIndex((f) => !f.disabled);
  });

  list = useVirtualizer({
    count: () => (this.virtual() ? this.flat().length : 0),
    itemSize: () => this.itemSize(),
    getKey: (i) => this.flat()[i]?.id ?? i,
    keepIndexes: () => (this.virtual() ? [this.activeIndex()] : []),
    aria: "none",
  });

  private attrs = bindProps(() => ({
    role: "tree",
    "aria-label": this.label() || undefined,
    "aria-multiselectable": this.selectionMode() === "multiple" ? "true" : undefined,
  }));
  private apply = useHostClass(() => cn("relative block overflow-auto rounded-md border bg-background p-1 text-sm", this.virtual() && "h-80", this.class()));

  spacerStyle = computed(() => (this.virtual() ? this.list.spacerStyle() : ""));

  rows = computed(() => {
    const flat = this.flat();
    const active = this.activeIndex();
    const mode = this.selectionMode();
    const selected = this.selectedSet();
    const busy = this.busy();
    const indent = this.indent();
    const entries: Array<{ key: PropertyKey; index: number; base: Record<string, unknown> }> = this.virtual()
      ? this.list.rows().map((r) => ({ key: r.key, index: r.index, base: r.props }))
      : flat.map((f, index) => ({ key: f.id, index, base: { "data-index": index } }));
    const out = [];
    for (const { key, index, base } of entries) {
      const f = flat[index];
      if (!f) continue;
      const isSelected = selected.has(f.id);
      const isActive = index === active;
      const props: Record<string, unknown> = {
        ...base,
        role: "treeitem",
        class: cn(ROW, "group", isSelected && "bg-accent text-accent-foreground", f.disabled && "pointer-events-none opacity-50"),
        tabindex: isActive ? 0 : -1,
        "aria-level": f.level,
        "aria-setsize": f.setSize,
        "aria-posinset": f.posInSet,
        "aria-expanded": f.expandable ? (f.expanded ? "true" : "false") : undefined,
        "aria-selected": mode === "none" ? undefined : isSelected ? "true" : "false",
        "aria-disabled": f.disabled ? "true" : undefined,
        "aria-busy": busy.has(f.id) ? "true" : undefined,
        "data-state": isSelected ? "selected" : undefined,
        "data-active": isActive ? "" : undefined,
      };
      const node = f.node;
      out.push({
        key,
        index,
        props,
        indent: `width:${(f.level - 1) * indent}px`,
        expandable: f.expandable,
        open: f.expanded ? "true" : "false",
        icon: node.icon ?? "",
        label: node.label,
        description: node.description ?? "",
        descriptionClass: cn("truncate text-xs text-muted-foreground", node.descriptionClass),
        actions: (node.actions ?? []).map((a) => ({ id: a.id, label: a.label, text: a.text ?? a.label, tabindex: isActive ? 0 : -1 })),
      });
    }
    return out;
  });

  // ---- children, including lazy ones --------------------------------------------------------------------------

  private childrenOf(node: TreeNode, expanding: boolean): TreeNode[] | undefined {
    if (node.children) return node.children;
    if (!node.lazy) return undefined;
    const cached = this.cache.get(node.id);
    if (cached) return cached;
    const load = this.loadChildren();
    if (!expanding) return undefined;
    if (!load) {
      this.cache.set(node.id, []);
      return [];
    }
    if (this.inflight.has(node.id)) return undefined;
    let result: TreeNode[] | Promise<TreeNode[]>;
    try {
      result = load(node);
    } catch (error) {
      this.cache.set(node.id, []);
      queueMicrotask(() => this.loadFailed.emit({ node, error }));
      return [];
    }
    if (Array.isArray(result)) {
      this.cache.set(node.id, result);
      return result;
    }
    const owner = this.cacheFor;
    this.inflight.add(node.id);
    queueMicrotask(() => this.busy.update((s) => new Set(s).add(node.id)));
    const done = (list: TreeNode[]) => {
      if (owner !== this.cacheFor) return; // the data was replaced while loading
      this.inflight.delete(node.id);
      this.cache.set(node.id, list);
      this.busy.update((s) => {
        const next = new Set(s);
        next.delete(node.id);
        return next;
      });
      this.version.update((v) => v + 1);
    };
    result.then(done, (error) => {
      done([]);
      this.loadFailed.emit({ node, error });
    });
    return undefined;
  }

  /** The children of a node as the tree sees them (loaded lazy children included, without starting a load). */
  loadedChildren(node: TreeNode): TreeNode[] | undefined {
    return node.children ?? this.cache.get(node.id);
  }

  // ---- state changes -------------------------------------------------------------------------------------------

  private setOpen(index: number, open: boolean): void {
    const f = this.flat()[index];
    if (!f || !f.expandable || f.expanded === open) return;
    const set = new Set(untracked(this.expanded));
    if (open) set.add(f.id);
    else {
      set.delete(f.id);
      // Focus on a row that is about to disappear moves to the branch.
      const active = untracked(this.activeIndex);
      const flat = untracked(this.flat);
      for (let p = flat[active]?.parent ?? -1; p >= 0; p = flat[p]!.parent) {
        if (p === index) {
          this.activeId.set(f.id);
          break;
        }
      }
    }
    this.expanded.set([...set]);
  }

  private expandSiblings(index: number): void {
    const flat = this.flat();
    const parent = flat[index]?.parent ?? -1;
    const set = new Set(untracked(this.expanded));
    const siblings = parent < 0 ? this.nodes() : (this.loadedChildren(flat[parent]!.node) ?? []);
    for (const n of siblings) if (!n.disabled && (n.children?.length || n.lazy)) set.add(n.id);
    this.expanded.set([...set]);
  }

  private focusRow(index: number): void {
    const f = this.flat()[index];
    if (!f) return;
    this.activeId.set(f.id);
    if (this.virtual()) this.list.scrollToIndex(index);
    void whenFlushed().then(() => {
      const host = this.hostRef.host as { querySelector?(s: string): { focus?(): void } | null };
      host.querySelector?.(`[data-index="${index}"]`)?.focus?.();
    });
  }

  private step(from: number, dir: 1 | -1): number {
    const flat = this.flat();
    for (let i = from + dir; i >= 0 && i < flat.length; i += dir) if (!flat[i]!.disabled) return i;
    return -1;
  }

  private selectRange(to: number): void {
    const flat = this.flat();
    const anchor = this.anchorId === null ? to : (this.indexOf().get(this.anchorId) ?? to);
    const [a, b] = anchor < to ? [anchor, to] : [to, anchor];
    const ids: string[] = [];
    for (let i = a; i <= b; i++) if (!flat[i]!.disabled) ids.push(flat[i]!.id);
    this.selected.set(ids);
  }

  private choose(index: number, how: "replace" | "toggle" | "range"): void {
    const f = this.flat()[index];
    const mode = this.selectionMode();
    if (!f || f.disabled || mode === "none") return;
    if (mode === "single" || how === "replace") {
      this.selected.set([f.id]);
      this.anchorId = f.id;
    } else if (how === "toggle") {
      const set = new Set(untracked(this.selected));
      if (!set.delete(f.id)) set.add(f.id);
      this.selected.set([...set]);
      this.anchorId = f.id;
    } else this.selectRange(index);
  }

  // ---- events --------------------------------------------------------------------------------------------------

  onToggle(event: unknown, index: number): void {
    (event as { stopPropagation?(): void }).stopPropagation?.();
    const f = this.flat()[index];
    if (!f || f.disabled) return;
    this.setOpen(index, !f.expanded);
    this.activeId.set(f.id);
  }

  onAction(event: unknown, index: number, action: string): void {
    (event as { stopPropagation?(): void }).stopPropagation?.();
    const f = this.flat()[index];
    if (f && !f.disabled) this.action.emit({ node: f.node, action });
  }

  onClick(event: unknown, index: number): void {
    const e = event as { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
    const f = this.flat()[index];
    if (!f || f.disabled) return;
    this.activeId.set(f.id);
    const multiple = this.selectionMode() === "multiple";
    this.choose(index, multiple && (e.ctrlKey || e.metaKey) ? "toggle" : multiple && e.shiftKey ? "range" : "replace");
    if (!(multiple && (e.ctrlKey || e.metaKey || e.shiftKey))) this.activated.emit(f.node);
  }

  onKey(event: unknown, index: number): void {
    const e = event as { key: string; target?: { getAttribute?(n: string): string | null }; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; preventDefault(): void };
    if (e.target && typeof e.target.getAttribute === "function" && e.target.getAttribute("role") !== "treeitem") return; // a button inside the row
    const flat = this.flat();
    const f = flat[index];
    if (!f) return;
    const multiple = this.selectionMode() === "multiple";
    const ctrl = !!(e.ctrlKey || e.metaKey);
    const go = (to: number, extend = false) => {
      e.preventDefault();
      if (to < 0) return;
      this.focusRow(to);
      if (extend && multiple) this.selectRange(to);
    };
    switch (e.key) {
      case "ArrowDown":
        return go(this.step(index, 1), e.shiftKey);
      case "ArrowUp":
        return go(this.step(index, -1), e.shiftKey);
      case "Home":
        return go(this.step(-1, 1));
      case "End":
        return go(this.step(flat.length, -1));
      case "ArrowRight":
        e.preventDefault();
        if (f.expandable && !f.expanded) this.setOpen(index, true);
        else if (f.expanded) {
          const child = flat[index + 1];
          if (child && child.parent === index && !child.disabled) this.focusRow(index + 1);
          else go(this.step(index, 1));
        }
        return;
      case "ArrowLeft":
        e.preventDefault();
        if (f.expanded) this.setOpen(index, false);
        else if (f.parent >= 0) this.focusRow(f.parent);
        return;
      case "Enter":
        e.preventDefault();
        if (f.disabled) return;
        this.choose(index, "replace");
        this.activated.emit(f.node);
        return;
      case " ":
        e.preventDefault();
        this.choose(index, multiple ? "toggle" : "replace");
        return;
      case "*":
        e.preventDefault();
        this.expandSiblings(index);
        return;
      case "a":
      case "A":
        if (ctrl && multiple) {
          e.preventDefault();
          this.selected.set(flat.filter((x) => !x.disabled).map((x) => x.id));
          return;
        }
        break;
    }
    if (e.key.length === 1 && !ctrl && !e.altKey) this.typeAhead(e.key, index, e);
  }

  private typeAhead(char: string, from: number, e: { preventDefault(): void }): void {
    const now = Date.now();
    const typed = this.typed;
    typed.text = (now - typed.at > 500 ? "" : typed.text) + char.toLowerCase();
    typed.at = now;
    const same = [...typed.text].every((x) => x === typed.text[0]);
    const query = same ? typed.text[0]! : typed.text;
    const flat = this.flat();
    // A search that extends the previous text may match the current row; a new character starts after it.
    const start = query.length > 1 ? from : from + 1;
    for (let n = 0; n < flat.length; n++) {
      const i = (start + n) % flat.length;
      const row = flat[i]!;
      if (!row.disabled && row.node.label.toLowerCase().startsWith(query)) {
        e.preventDefault();
        this.focusRow(i);
        return;
      }
    }
  }

}
