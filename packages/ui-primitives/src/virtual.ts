import { computed, effect, signal, untracked, type ReadonlySignal } from "@gable/core";
import { currentScope, injectHost, whenFlushed } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";
import type { PropBag } from "./props.js";
import { createVirtualizer, type ScrollAlign, type VirtualItem, type Virtualizer, type VirtualizerOptions } from "./virtual-core.js";

export type { ScrollAlign, VirtualItem, VirtualRange, Virtualizer, VirtualizerOptions } from "./virtual-core.js";
export { createVirtualizer } from "./virtual-core.js";

/** Options for `useVirtualizer`: everything `VirtualizerOptions` takes, plus the accessibility semantics of the rendered items and keyboard navigation. */
export interface UseVirtualizerOptions extends VirtualizerOptions {
  /**
   * Which accessibility semantics the rendered items carry (the container's role is yours to set):
   * - `"list"` (default): `aria-setsize` and `aria-posinset` on every item, for `role="list"` / `listbox`.
   * - `"grid"`: `aria-rowindex` on every item and `aria-rowcount` on the container, for `role="grid"` / `table`.
   * - `"none"`: nothing.
   */
  aria?: "list" | "grid" | "none";
  /** Role of each item (`"listitem"`, `"option"`, `"row"`...). Default: none. */
  itemRole?: string;
  /** Rows above the virtualised ones in a grid (a header row): offsets `aria-rowindex` and counts in `aria-rowcount`. Default 0. */
  headerRows?: number;
  /** Height of something that covers the top of the scroll container outside the virtual content (a sticky table header placed before the spacer): the viewport is that much shorter. Default 0. */
  viewportInset?: number;
  /** Roving focus: one item is the tab stop; arrows, Home, End, PageUp and PageDown move it, scroll it into view and focus it. Default false. */
  keyboard?: boolean;
}

/** A rendered item with its attribute bag, ready for `[uiProps]="row.props"`. */
export type VirtualRow = VirtualItem & { props: PropBag };

/** What `useVirtualizer` returns: the `Virtualizer` signals plus ready-made attribute bags for the container and each row, and `scrollToIndex`. */
export interface VirtualizerHandle extends Virtualizer {
  /** Scrolls so that `index` is visible. With variable heights the target is re-aimed as rows are measured. */
  scrollToIndex(index: number, options?: { align?: ScrollAlign; behavior?: "auto" | "smooth" }): void;
  /** The index holding the tab stop (`keyboard`). */
  readonly activeIndex: ReadonlySignal<number>;
  /** Attributes for the scroll container (`[uiProps]`): `aria-rowcount` for grids. */
  readonly rootProps: ReadonlySignal<PropBag>;
  /** Style of the inner spacer element: its height is the whole list. */
  readonly spacerStyle: ReadonlySignal<string>;
  /** Attributes for one rendered item (`[uiProps]`): position style, `data-index`, tab stop and aria. */
  itemProps(item: VirtualItem): PropBag;
  /** `items()` with each item's `props` attached: templates cannot call `itemProps(item)` or index an array, so map `rows()` into a computed with the row data. */
  readonly rows: ReadonlySignal<VirtualRow[]>;
}

interface ScrollNode {
  scrollTop?: number;
  clientHeight?: number;
  scrollTo?(options: { top: number; behavior?: string }): void;
  ownerDocument?: { defaultView?: Window & typeof globalThis };
  querySelector?(selector: string): { focus?(): void } | null;
  querySelectorAll?(selector: string): ArrayLike<Element>;
}

/**
 * Virtual scrolling for a long list or table: only the rows in view (plus overscan) exist as nodes. The host is the scroll
 * container (give it a height and `overflow: auto`); render `items()` inside a spacer of `totalSize()` height, each row at
 * `itemProps(item)` (it positions itself absolutely, so rows need no wrapper).
 *
 * `itemSize` fixes the height; otherwise rows are measured with a `ResizeObserver` (rows are found by `data-index`, in a
 * `MutationObserver`) and `estimateSize` stands in until they are. Measured heights are stored by `getKey`, so they
 * follow rows when the data reorders. Call it in Setup; listeners and observers go with the scope. Renderer-neutral
 * except for the observers, which exist only on a DOM host: elsewhere drive it with `setScroll` and `measure`.
 *
 * @example
 * // Component class (inside Setup, e.g. a field initialiser)
 * list = useVirtualizer({ count: () => this.rows().length, itemSize: 36, getKey: (i) => this.rows()[i].id });
 * visible = computed(() => this.list.rows().map((row) => ({ ...row, name: this.rows()[row.index].name })));
 *
 * // Template (static html, no holes): a scroll container with a height and overflow: auto
 * // <div [style]="list.spacerStyle()">
 * //   @for (row of visible(); track row.key) { <div [uiProps]="row.props">{{ row.name }}</div> }
 * // </div>
 */
export function useVirtualizer(options: UseVirtualizerOptions, target: { renderer: Renderer<unknown>; host: unknown } = injectHost<unknown>()): VirtualizerHandle {
  const { renderer, host } = target;
  const node = host as ScrollNode;
  const aria = options.aria ?? "list";
  const headerRows = options.headerRows ?? 0;
  const activeIndex = signal(0);
  let pending: { index: number; align: ScrollAlign; top: number } | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  const engine = createVirtualizer(
    {
      ...options,
      keepIndexes: () => [...(options.keepIndexes?.() ?? []), ...(options.keyboard ? [activeIndex()] : [])],
    },
    (change) => {
      if (!pending) {
        // A row above the viewport changed height: shift the scroll by the same amount so the rows in view do not jump.
        if (change && change.delta !== 0 && change.start + change.oldSize <= untracked(engine.scrollOffset) + 0.5) {
          const current = node.scrollTop ?? untracked(engine.scrollOffset);
          writeScroll(Math.max(0, current + change.delta));
        }
        return;
      }
      const top = engine.offsetForIndex(pending.index, pending.align);
      const moved = Math.abs(top - (node.scrollTop ?? untracked(engine.scrollOffset))) > 0.5;
      pending.top = top;
      if (moved) writeScroll(top);
    },
  );

  const writeScroll = (top: number, behavior?: "auto" | "smooth") => {
    if (typeof node.scrollTo === "function") node.scrollTo(behavior ? { top, behavior } : { top });
    else if ("scrollTop" in node) node.scrollTop = top;
    if (behavior !== "smooth") engine.setScroll(top);
  };

  const scrollToIndex: VirtualizerHandle["scrollToIndex"] = (index, opts = {}) => {
    const align = opts.align ?? "auto";
    const top = engine.offsetForIndex(index, align);
    if (pendingTimer) clearTimeout(pendingTimer);
    pending = opts.behavior === "smooth" ? null : { index, align, top };
    pendingTimer = setTimeout(() => (pending = null), 600);
    writeScroll(top, opts.behavior);
  };

  const read = (source: unknown) => {
    const el = (source && typeof source === "object" && "scrollTop" in source ? source : node) as ScrollNode;
    const top = el.scrollTop ?? 0;
    if (pending && Math.abs(top - pending.top) > 1 && top !== untracked(engine.scrollOffset)) pending = null; // the user took over
    engine.setScroll(top, el.clientHeight ? Math.max(0, el.clientHeight - (options.viewportInset ?? 0)) : undefined);
  };

  const indexOfNode = (target: unknown): number => {
    let el = target as { getAttribute?(n: string): string | null; parentNode?: unknown } | null | undefined;
    while (el && typeof el.getAttribute === "function") {
      const v = el.getAttribute("data-index");
      if (v !== null) return Number(v);
      el = el.parentNode as typeof el;
    }
    return -1;
  };

  const focusIndex = (index: number) => {
    void whenFlushed().then(() => {
      const el = node.querySelector?.(`[data-index="${index}"]`);
      el?.focus?.();
    });
  };

  const off: Array<() => void> = [renderer.listen(host, "scroll", (event) => read((event as { target?: unknown }).target))];
  if (options.keyboard) {
    off.push(
      renderer.listen(host, "focusin", (event) => {
        const i = indexOfNode((event as { target?: unknown }).target);
        if (i >= 0) activeIndex.set(i);
      }),
      renderer.listen(host, "keydown", (event) => {
        const e = event as { key: string; target?: unknown; preventDefault(): void; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const from = indexOfNode(e.target);
        if (from < 0) return;
        const n = untracked(engine.count);
        const r = untracked(engine.range);
        const page = Math.max(1, r.last - r.first);
        let next: number;
        if (e.key === "ArrowDown") next = from + 1;
        else if (e.key === "ArrowUp") next = from - 1;
        else if (e.key === "PageDown") next = from + page;
        else if (e.key === "PageUp") next = from - page;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = n - 1;
        else return;
        e.preventDefault();
        next = Math.min(Math.max(0, next), n - 1);
        if (n === 0) return;
        activeIndex.set(next);
        scrollToIndex(next);
        focusIndex(next);
      }),
    );
  }

  // DOM only: the host's size, and the heights of the rows.
  const win = node.ownerDocument?.defaultView;
  const RO = win?.ResizeObserver;
  if (RO) {
    const viewObserver = new RO(() => read(node));
    viewObserver.observe(host as Element);
    off.push(() => viewObserver.disconnect());
    queueMicrotask(() => read(node));
    if (typeof options.itemSize !== "number") {
      const rows = new RO((entries) => {
        for (const entry of entries) {
          const i = indexOfNode(entry.target);
          const size = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
          if (i >= 0 && size > 0) engine.measure(i, size);
        }
      });
      const watch = (el: Element) => {
        if (el.hasAttribute?.("data-index")) rows.observe(el);
        for (const child of Array.from(el.querySelectorAll?.("[data-index]") ?? [])) rows.observe(child);
      };
      const MO = win!.MutationObserver;
      const mutations = new MO((records) => {
        for (const record of records) {
          if (record.type === "attributes") {
            watch(record.target as Element);
            continue;
          }
          record.addedNodes.forEach((n) => n.nodeType === 1 && watch(n as Element));
          record.removedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            const el = n as Element;
            if (el.hasAttribute?.("data-index")) rows.unobserve(el);
          });
        }
      });
      mutations.observe(host as Node, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-index"] });
      // Rows rendered before the observer saw them (the first render builds nodes detached): pick them up once rendering has flushed.
      queueMicrotask(() => watch(host as Element));
      void whenFlushed().then(() => watch(host as Element));
      off.push(() => {
        mutations.disconnect();
        rows.disconnect();
      });
    }
  }
  currentScope()?.onDispose(() => {
    off.forEach((f) => f());
    if (pendingTimer) clearTimeout(pendingTimer);
  });

  // A shrinking list can leave the scroll offset past the end: the browser clamps it and sends a scroll event, nothing to do here.
  effect(() => {
    const n = engine.count();
    if (untracked(activeIndex) >= n && n > 0) activeIndex.set(n - 1);
  });

  const headers = headerRows;
  const rootProps = computed<PropBag>(() => (aria === "grid" ? { "aria-rowcount": engine.count() + headers } : {}));
  const spacerStyle = computed(() => `position:relative;width:100%;height:${engine.totalSize()}px`);
  const fixedHeight = () => (typeof options.itemSize === "function" ? options.itemSize() : options.itemSize);
  const itemProps = (item: VirtualItem): PropBag => {
    const fixedSize = fixedHeight() !== undefined;
    let style = item.sticky
      ? "position:sticky;top:0;left:0;width:100%;z-index:1;"
      : `position:absolute;top:0;left:0;width:100%;transform:translateY(${item.start}px);`;
    if (fixedSize) style += `height:${item.size}px;`;
    const bag: PropBag = { style, "data-index": item.index };
    if (options.itemRole) bag["role"] = options.itemRole;
    if (options.keyboard) bag["tabindex"] = item.index === activeIndex() ? 0 : -1;
    if (aria === "list") {
      bag["aria-setsize"] = engine.count();
      bag["aria-posinset"] = item.index + 1;
    } else if (aria === "grid") bag["aria-rowindex"] = item.index + 1 + headers;
    return bag;
  };

  const rows = computed(() => engine.items().map((item) => Object.assign({ props: itemProps(item) }, item)));

  return Object.assign(engine, { rows, itemProps, scrollToIndex, activeIndex: activeIndex as ReadonlySignal<number>, rootProps, spacerStyle }) as VirtualizerHandle;
}
