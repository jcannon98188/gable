import { computed, effect, html, input, model, output, untracked } from "@gable/core";
import { UiProps, bindProps, useVirtualizer } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

/** One row of a virtual list. `header` rows are group titles that pin to the top while their group scrolls. */
export interface VirtualListItem {
  /** Stable identity (keeps measured heights and the selection when the data reorders). Default: the index. */
  id?: string | number;
  label: string;
  description?: string;
  header?: boolean;
}

/**
 * A list that renders only the rows in view, so 100,000 items cost the same as 20.
 *
 *   <ui-virtual-list [items]="people" [itemSize]="40" [(value)]="selectedId" class="h-80" label="People"></ui-virtual-list>
 *
 * `items` is data (`{ id?, label, description?, header? }`). The list is the scroll container: give it a height with a
 * class. `itemSize` fixes every row's height; `0` lets rows have their own height (measured, with `estimateSize` until
 * they are). Rows with `header: true` stay pinned at the top while their group is in view. Arrow keys, Home, End,
 * PageUp and PageDown move between rows; Enter or Space (or a click) picks one: `value` is its id and `picked` fires.
 * `scrollToIndex` scrolls to a row when set. Screen readers hear `aria-setsize` and `aria-posinset` for every row, so
 * they know the length of the whole list, not only the rendered part. It measures the real element, so it needs a browser
 * (tests mock layout and call `setScroll`).
 *
 * Need your own row layout, columns or a table? `useVirtualizer` from `@gable/ui-primitives` is the engine under this
 * component; `ui-virtual-table` is the same idea for tabular data.
 */
export class UiVirtualList {
  static meta = {
    selector: "ui-virtual-list",
    imports: [UiProps],
    template: html`
      <div [attr.style]="list.spacerStyle()">
        @for (row of rows(); track row.key) {
          <div [uiProps]="row.props" (click)="pick(row.index)" (keydown)="onKey($event, row.index)">
            <span class="truncate font-medium">{{ row.label }}</span>
            @if (row.description) {
              <span class="truncate text-xs text-muted-foreground">{{ row.description }}</span>
            }
          </div>
        }
      </div>
    `,
  };

  items = input<VirtualListItem[]>([]);
  /** Row height in px; 0 measures each row. */
  itemSize = input<number>(36);
  /** Height assumed for an unmeasured row when `itemSize` is 0. */
  estimateSize = input<number>(36);
  /** Accessible name of the list. */
  label = input<string>("");
  /** Two-way: the id (or index) of the chosen row. */
  value = model<string | number | null>(null);
  /** Set an index to scroll there; set it again (or to another index) to scroll again. */
  scrollToIndex = input<number | null>(null);
  class = input<string>("");
  picked = output<{ item: VirtualListItem; index: number }>();

  list = useVirtualizer({
    count: () => this.items().length,
    itemSize: () => (this.itemSize() > 0 ? this.itemSize() : undefined),
    estimateSize: () => this.estimateSize(),
    getKey: (i) => this.items()[i]?.id ?? i,
    stickyIndexes: () => this.headers(),
    itemRole: "listitem",
    keyboard: true,
  });

  private attrs = bindProps(() => ({ role: "list", "aria-label": this.label() || undefined }));
  private apply = useHostClass(() => cn("relative block h-80 overflow-auto rounded-md border bg-background text-sm outline-none", this.class()));

  headers = computed(() => {
    const out: number[] = [];
    this.items().forEach((item, i) => item.header && out.push(i));
    return out;
  });

  rows = computed(() => {
    const items = this.items();
    const value = this.value();
    const active = this.list.activeIndex();
    return this.list.rows().map((row) => {
      const item = items[row.index]!;
      const selected = !item.header && value !== null && (item.id ?? row.index) === value;
      const base = "flex flex-col justify-center border-b px-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset";
      const props = {
        ...row.props,
        class: item.header ? cn(base, "bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground") : cn(base, "cursor-default bg-background hover:bg-accent", selected && "bg-accent text-accent-foreground"),
        "aria-current": selected ? "true" : undefined,
        "data-state": selected ? "selected" : undefined,
        "data-active": row.index === active ? "" : undefined,
      };
      return { key: row.key, index: row.index, label: item.label, description: item.description, props };
    });
  });

  private scrollEffect = effect(() => {
    const index = this.scrollToIndex();
    if (index !== null) untracked(() => this.list.scrollToIndex(index, { align: "start" }));
  });

  pick(index: number): void {
    const item = this.items()[index];
    if (!item || item.header) return;
    this.value.set(item.id ?? index);
    this.picked.emit({ item, index });
  }

  onKey(event: unknown, index: number): void {
    const e = event as { key: string; preventDefault(): void };
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.pick(index);
    }
  }
}
