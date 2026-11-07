// Keyboard focus order and the accessibility tree of the selected frame (TASK-56.26). The Preview agent reads them from the
// page as rendered (agent/a11y-depth.ts); this keeps the latest reports for the Focus & tree panel, and holds the canvas
// view: the numbered focus order overlay and keyboard-only mode, which the agent forgets when the page reloads, so they are
// sent again whenever the frame connects. Reports are only refreshed while the panel (or the overlay) is showing; MCP reads
// on demand. Nothing is cached across pages: a report names the page it was taken on.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import type { A11yTreeNode, A11yTreeReport, FocusEntry, FocusOrderReport, FocusStepResult } from "../../../src/protocol.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";

const SETTLE_MS = 500;
const CALL_TIMEOUT_MS = 10000;
const bounded = <T>(p: Promise<T>): Promise<T> =>
  new Promise<T>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("The frame did not answer (it may have reloaded).")), CALL_TIMEOUT_MS);
    p.then((v) => (clearTimeout(timer), ok(v)), (e: unknown) => (clearTimeout(timer), fail(e)));
  });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const WARNING_TEXT: Record<FocusEntry["warnings"][number], string> = {
  "positive-tabindex": "A positive tabindex overrides the document order; use 0 and order the markup",
  "no-name": "No accessible name: a screen reader announces only its role",
  "aria-hidden": "Inside aria-hidden but focusable: keyboard users land on something hidden from screen readers",
  "jumps-back": "Focus jumps back up the page to reach this stop",
};

/** A tree row as the panel shows it (the tree flattened, with its depth). */
export interface TreeRow {
  key: string;
  depth: number;
  role: string;
  name: string;
  states: string;
  warnings: string;
  hasWarnings: boolean;
  focusable: boolean;
  nodeId: string | null;
  linked: boolean;
  isText: boolean;
  hasChildren: boolean;
  expanded: string;
  twisty: string;
  toggleLabel: string;
  nameText: string;
  indent: string;
}

/** The tree flattened in document order. `collapsed` row keys hide their children. */
export function treeRows(tree: readonly A11yTreeNode[], collapsed: ReadonlySet<string> = new Set()): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (nodes: readonly A11yTreeNode[], depth: number, prefix: string) => {
    nodes.forEach((n, i) => {
      const key = `${prefix}/${i}`;
      const states = Object.entries(n.states)
        .filter(([k]) => k !== "description")
        .map(([k, v]) => (v === true ? k : v === false ? `not ${k}` : `${k}=${v}`))
        .join(", ");
      const isCollapsed = collapsed.has(key);
      rows.push({
        key,
        depth,
        role: n.role,
        name: n.name,
        states,
        warnings: n.warnings.join("; "),
        hasWarnings: n.warnings.length > 0,
        focusable: n.focusable,
        nodeId: n.node?.id ?? null,
        linked: !!n.node,
        isText: n.role === "text",
        hasChildren: n.children.length > 0,
        expanded: String(!isCollapsed),
        twisty: isCollapsed ? "▸" : "▾",
        toggleLabel: `${isCollapsed ? "Expand" : "Collapse"} ${n.role} ${n.name}`.trim(),
        nameText: n.role === "text" ? n.name : n.name ? `"${n.name}"` : "",
        indent: `padding-left:${8 + depth * 14}px`,
      });
      if (n.children.length && !isCollapsed) walk(n.children, depth + 1, key);
    });
  };
  walk(tree, 0, "");
  return rows;
}

export class FocusState {
  static scope = "root";
  state = inject(DesignerState);
  chrome = inject(ChromeState);

  /** Which view the panel shows. */
  sectionPick = signal<string[]>(["order"]);
  section = computed<"order" | "tree">(() => (this.sectionPick()[0] === "tree" ? "tree" : "order"));
  /** The canvas shows the numbered focus order. */
  overlay = signal(false);
  /** Keyboard-only: the page takes no mouse input in Interact mode. */
  keyboardOnly = signal(false);

  order = signal<FocusOrderReport | null>(null);
  tree = signal<A11yTreeReport | null>(null);
  lastStep = signal<FocusStepResult | null>(null);
  error = signal<string | null>(null);
  /** Tree row keys the person collapsed. */
  collapsed = signal<ReadonlySet<string>>(new Set());
  /** The tree starts at the selected element instead of the whole page. */
  fromSelection = signal(false);

  visible = computed(() => this.chrome.drawerOpen() && this.chrome.drawerTab() === "focus");
  rows = computed(() => treeRows(this.tree()?.tree ?? [], this.collapsed()));
  /** The drawer tab's badge: Tab stops with a problem, and controls the keyboard cannot reach. */
  problems = computed(() => (this.order()?.stops.filter((s) => s.warnings.length).length ?? 0) + (this.order()?.unreachable.length ?? 0));

  #timer: ReturnType<typeof setTimeout> | undefined;
  #running = false;
  #again = false;

  /** The agent forgets the canvas view with the page: send it again when the frame (re)connects or the view changes. */
  applyView = effect(() => {
    const ready = this.state.connection() === "ready";
    const focusOrder = this.overlay();
    const keyboardOnly = this.keyboardOnly();
    this.state.frames.selectedId();
    this.state.loads();
    untracked(() => void (ready && this.state.preview.call("a11yView", { focusOrder, keyboardOnly }).catch(() => undefined)));
  });

  /** Refresh when what the page renders changes, while something is showing the reports. */
  watch = effect(() => {
    const ready = this.state.connection() === "ready";
    const show = this.visible() || this.overlay();
    this.state.frames.selectedId();
    this.state.tree();
    this.state.hmr();
    this.state.routerTick();
    this.section();
    this.fromSelection();
    this.state.picked();
    untracked(() => {
      clearTimeout(this.#timer);
      if (!ready) {
        this.order.set(null);
        this.tree.set(null);
        this.lastStep.set(null);
      } else if (show) this.#timer = setTimeout(() => void this.refresh(), SETTLE_MS);
    });
  });

  /** Reads what the panel shows now (a second request while one runs is made once, after it). */
  async refresh(): Promise<void> {
    if (this.#running) return void (this.#again = true);
    if (this.state.connection() !== "ready") return;
    this.#running = true;
    const frame = this.state.frames.selectedId();
    try {
      if (this.section() === "tree" && this.visible()) {
        const tree = await bounded(this.state.preview.call("a11yTree", { id: this.fromSelection() ? (this.state.picked()?.node.id ?? null) : null }));
        if (frame === this.state.frames.selectedId()) this.tree.set(tree);
      } else {
        const order = await bounded(this.state.preview.call("focusOrder", undefined));
        if (frame === this.state.frames.selectedId()) this.order.set(order);
      }
      this.error.set(null);
    } catch (e) {
      this.error.set(message(e));
    } finally {
      this.#running = false;
      if (this.#again) {
        this.#again = false;
        void this.refresh();
      }
    }
  }

  async step(to: "next" | "prev" | "first" | "last" | { id: string }, steps = 1): Promise<FocusStepResult> {
    const result = await bounded(this.state.preview.call("focusStep", { to, steps }));
    this.lastStep.set(result);
    if (this.visible() || this.overlay()) void this.refresh();
    return result;
  }

  /** Selects the element on the canvas, as clicking it there would. */
  select(id: string | null): void {
    if (id) void this.state.preview.call("selectNode", { id }).catch(() => undefined);
  }

  hover(id: string | null): void {
    this.state.hover(id);
  }

  toggleCollapsed(key: string): void {
    this.collapsed.update((c) => {
      const next = new Set(c);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /** MCP: reads on demand (the panel may not be showing). */
  readOrder(): Promise<FocusOrderReport> {
    return bounded(this.state.preview.call("focusOrder", undefined)).then((r) => (this.order.set(r), r));
  }

  readTree(id?: string): Promise<A11yTreeReport> {
    return bounded(this.state.preview.call("a11yTree", { id: id ?? null }));
  }

  setView(v: { focusOrder?: boolean; keyboardOnly?: boolean }): void {
    if (v.focusOrder !== undefined) this.overlay.set(v.focusOrder);
    if (v.keyboardOnly !== undefined) this.keyboardOnly.set(v.keyboardOnly);
  }
}
