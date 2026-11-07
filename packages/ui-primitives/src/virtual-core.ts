import { computed, signal, untracked, type ReadonlySignal } from "@gable/core";

/**
 * The renderer-neutral engine of virtual scrolling: which items of a long list are in view, where they sit, and how
 * tall everything is. It owns no DOM; `useVirtualizer` (virtual.ts) feeds it the scroll offset and viewport size.
 *
 * It is written here instead of using `@tanstack/virtual-core`: that engine is a class with its own subscription and
 * `notify` cycle, and its item list is rebuilt on every change. Gable needs `items()` as a signal that changes only
 * when the rendered window changes, keys that follow the data (so measurements survive reordering), and no extra
 * dependency in a package gable-ui copies out of. The pieces that matter are small: prefix sums, a binary search,
 * and a measured-size map.
 */
export interface VirtualItem {
  index: number;
  /** Stable identity: `getKey(index)`, or the index. Use it as the `@for` track key. */
  key: PropertyKey;
  /** Offset of the item's top edge from the start of the scrollable content, in px. */
  start: number;
  size: number;
  end: number;
  /** The pinned header: it is the nearest sticky index at or before the first visible item. */
  sticky: boolean;
}

export interface VirtualRange {
  /** First and last index that intersect the viewport (-1 when the list is empty). */
  first: number;
  last: number;
  /** First and last rendered index of the window, including overscan (-1 when empty). */
  start: number;
  end: number;
}

export type ScrollAlign = "start" | "center" | "end" | "auto";

export interface VirtualizerOptions {
  /** Number of items. Read reactively. */
  count: () => number;
  /** Every item is this tall (px): no measuring, offsets are plain arithmetic. */
  itemSize?: number | (() => number | undefined);
  /** Estimated height of an item that has not been measured yet; used when `itemSize` is not set. Default 40. */
  estimateSize?: number | ((index: number) => number);
  /** Identity of an item, so a measured height follows the item when the list reorders or has rows inserted. Default: the index. Read reactively. */
  getKey?: (index: number) => PropertyKey;
  /** Items rendered beyond the viewport on each side. Default 5. */
  overscan?: number;
  /** Indexes that pin to the top while scrolled past (group headers). Read reactively; must be ascending. */
  stickyIndexes?: () => readonly number[];
  /** Indexes that are always rendered (the focused row, so scrolling away does not destroy focus). */
  keepIndexes?: () => readonly number[];
  /** Space before the first item and after the last, in px. */
  paddingStart?: number;
  paddingEnd?: number;
  /** Height of a sticky header that covers the top of the viewport: `scrollToIndex` leaves it clear. */
  scrollPaddingStart?: number;
  /** Viewport height assumed until one is measured. Default 0 (only the overscan renders until measured). */
  initialViewport?: number;
}

export interface Virtualizer {
  /** The rendered window, in index order: visible items, overscan, kept indexes and the active sticky header. */
  readonly items: ReadonlySignal<VirtualItem[]>;
  readonly range: ReadonlySignal<VirtualRange>;
  /** Total height of the scrollable content (set it as the height of the inner spacer). */
  readonly totalSize: ReadonlySignal<number>;
  readonly count: ReadonlySignal<number>;
  readonly scrollOffset: ReadonlySignal<number>;
  readonly viewportSize: ReadonlySignal<number>;
  /** Reports the scroll position and viewport height (a scroll listener or a test calls this). */
  setScroll(offset: number, viewportSize?: number): void;
  /** Reports a measured height for an item. Ignored when `itemSize` is fixed. */
  measure(index: number, size: number): void;
  /** Start offset, size and index lookup against the current layout. */
  offsetOf(index: number): number;
  sizeOf(index: number): number;
  indexAt(offset: number): number;
  /** The scroll offset that brings `index` into view with the given alignment (clamped to the scrollable range). */
  offsetForIndex(index: number, align?: ScrollAlign): number;
  /** Drops every measured height (e.g. after a width change that reflows text). */
  resetMeasurements(): void;
}

/** Called after measuring moved something, with the index the layout shifted from. */
export function createVirtualizer(options: VirtualizerOptions, onLayout?: () => void): Virtualizer {
  /** The fixed height right now, if any (a function form lets a component input drive it). */
  const fixedSize = () => (typeof options.itemSize === "function" ? options.itemSize() : options.itemSize);
  const overscan = Math.max(0, options.overscan ?? 5);
  const padStart = options.paddingStart ?? 0;
  const padEnd = options.paddingEnd ?? 0;
  const scrollPad = options.scrollPaddingStart ?? 0;
  const estimate = options.estimateSize ?? 40;
  const estimateOf = typeof estimate === "number" ? () => estimate : estimate;

  const scrollOffset = signal(0);
  const viewportSize = signal(options.initialViewport ?? 0);
  const version = signal(0);
  const epoch = signal(0);
  const measured = new Map<PropertyKey, number>();

  // Rebuilt when the count or the keys change (it tracks everything `count`, `getKey` and `estimateSize` read).
  const base = computed(() => {
    epoch();
    const n = Math.max(0, Math.floor(options.count()));
    const getKey = options.getKey;
    let keys: PropertyKey[] | null = null;
    if (getKey) {
      keys = new Array<PropertyKey>(n);
      for (let i = 0; i < n; i++) keys[i] = getKey(i);
    }
    const fixed = fixedSize();
    const sizes = new Float64Array(n);
    for (let i = 0; i < n; i++) sizes[i] = fixed ?? (keys ? measured.get(keys[i]!) : measured.get(i)) ?? estimateOf(i);
    return { n, keys, sizes };
  });

  let built: ReturnType<typeof base> | null = null;
  let starts = new Float64Array(1);
  let dirty = 0;

  /** Brings `starts` up to date with `sizes`: only from the first changed index. */
  const layout = () => {
    const b = base();
    if (b !== built) {
      built = b;
      starts = new Float64Array(b.n + 1);
      dirty = 0;
    }
    if (dirty <= b.n) {
      let acc = dirty === 0 ? padStart : starts[dirty]!;
      for (let i = dirty; i < b.n; i++) {
        starts[i] = acc;
        acc += b.sizes[i]!;
      }
      starts[b.n] = acc;
      dirty = b.n + 1;
    }
    return b;
  };

  const indexAt = (offset: number) => {
    const { n } = untracked(layout);
    if (n === 0) return -1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const range = computed<VirtualRange>(() => {
    version();
    const { n } = layout();
    if (n === 0) return { first: -1, last: -1, start: -1, end: -1 };
    const off = scrollOffset();
    const first = indexAt(off);
    const last = Math.max(first, indexAt(off + viewportSize()));
    return { first, last, start: Math.max(0, first - overscan), end: Math.min(n - 1, last + overscan) };
  });

  const items = computed<VirtualItem[]>(() => {
    version();
    const r = range();
    const { n, keys, sizes } = layout();
    if (n === 0) return [];
    const wanted = new Set<number>();
    for (let i = r.start; i <= r.end; i++) wanted.add(i);
    let sticky = -1;
    const stickies = options.stickyIndexes?.();
    if (stickies) {
      for (const s of stickies) {
        if (s <= r.first && s < n) sticky = s;
        else break;
      }
      if (sticky >= 0) wanted.add(sticky);
    }
    for (const k of options.keepIndexes?.() ?? []) if (k >= 0 && k < n) wanted.add(k);
    const out: VirtualItem[] = [];
    for (const index of wanted) out.push({ index, key: keys ? keys[index]! : index, start: starts[index]!, size: sizes[index]!, end: starts[index]! + sizes[index]!, sticky: index === sticky });
    // Set order is insertion order: the window first, then extras. Re-sort so DOM order stays the index order.
    return out.sort((a, b) => a.index - b.index);
  });

  const totalSize = computed(() => {
    version();
    const { n } = layout();
    return starts[n]! + padEnd;
  });

  const offsetForIndex = (index: number, align: ScrollAlign = "auto") => {
    const { n } = untracked(layout);
    if (n === 0) return 0;
    const i = Math.min(Math.max(0, index), n - 1);
    const start = starts[i]!;
    const size = starts[i + 1]! - start;
    const view = untracked(viewportSize);
    const cur = untracked(scrollOffset);
    const maxOffset = Math.max(0, starts[n]! + padEnd - view);
    let target: number;
    if (align === "start") target = start - scrollPad;
    else if (align === "end") target = start + size - view;
    else if (align === "center") target = start + size / 2 - view / 2;
    else if (start - scrollPad < cur) target = start - scrollPad;
    else if (start + size > cur + view) target = start + size - view;
    else target = cur;
    return Math.min(Math.max(0, target), maxOffset);
  };

  return {
    items,
    range,
    totalSize,
    count: computed(() => base().n),
    scrollOffset,
    viewportSize,
    setScroll(offset, view) {
      if (offset !== untracked(scrollOffset)) scrollOffset.set(offset);
      if (view !== undefined && view !== untracked(viewportSize)) viewportSize.set(view);
    },
    measure(index, size) {
      if (untracked(fixedSize) !== undefined || !(size >= 0)) return;
      const { n, keys, sizes } = untracked(layout);
      if (index < 0 || index >= n) return;
      const key = keys ? keys[index]! : index;
      if (measured.get(key) === size && sizes[index] === size) return;
      measured.set(key, size);
      if (sizes[index] === size) return;
      sizes[index] = size;
      if (index < dirty) dirty = index;
      version.update((v) => v + 1);
      onLayout?.();
    },
    offsetOf: (index) => (untracked(layout), starts[index] ?? 0),
    sizeOf: (index) => (untracked(layout), (starts[index + 1] ?? 0) - (starts[index] ?? 0)),
    indexAt,
    offsetForIndex,
    resetMeasurements() {
      measured.clear();
      epoch.update((v) => v + 1);
    },
  };
}
