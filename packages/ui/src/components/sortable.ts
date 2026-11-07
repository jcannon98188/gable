import { computed, html, input, model, output } from "@gable/core";
import { applySortableMove, UiDragHandle, UiSortable, UiSortableItem, type SortableMove } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";

/** One row of a sortable list. `id` must be unique in the document (also across lists that share a group). */
export interface SortableRow {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

let counter = 0;

/**
 * A sortable list: drag rows with the pointer (by the grip when `handle` is on) or use the keyboard (focus a row, space to
 * lift, arrows to move, space to drop, escape to cancel; each step is announced to screen readers).
 *
 *   <ui-sortable [(items)]="tasks" label="Tasks" [handle]="true"></ui-sortable>
 *
 * For a kanban board put several lists in the same `group` with their own `name`; rows move between them with the pointer or
 * with Left and Right while lifted, and each list updates its own `items`:
 *
 *   <ui-sortable name="todo" group="board" label="To do" [(items)]="todo"></ui-sortable>
 *   <ui-sortable name="done" group="board" label="Done" [(items)]="done"></ui-sortable>
 *
 * `items` is the model, so `[field]` and two-way binding work; `moved` and `removed` also report every change. For rows
 * with custom markup use the `uiSortable` and `uiSortableItem` directives from `@gable/ui-primitives` directly.
 */
export class UiSortableList {
  static meta = {
    selector: "ui-sortable",
    host: { class: "block" },
    imports: [UiSortable, UiSortableItem, UiDragHandle, UiIcon],
    template: html`
      <ul
        [uiSortable]="items()"
        [sortableId]="listName()"
        [sortableGroup]="group()"
        [sortableLabel]="label()"
        [sortableOrientation]="orientation()"
        [sortableDisabled]="disabled()"
        (moved)="onMoved($event)"
        (removed)="onRemoved($event)"
        [attr.class]="listClasses()"
        [attr.aria-label]="label()"
      >
        @for (item of items(); track item.id) {
          <li [uiSortableItem]="item.id" [attr.class]="itemClasses()" [attr.aria-disabled]="item.disabled">
            @if (handle()) {
              <span uiDragHandle class="cursor-grab text-muted-foreground"><svg uiIcon="grip-vertical" class="size-4"></svg></span>
            }
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm font-medium">{{ item.label }}</span>
              @if (item.description) {
                <span class="text-xs text-muted-foreground">{{ item.description }}</span>
              }
            </span>
          </li>
        }
      </ul>
    `,
  };

  /** Two-way: `[(items)]="tasks"`. The list updates it when a row is dropped. */
  items = model<SortableRow[]>([]);
  /** Name of this list in `moved` / `removed` events. Required to tell lists apart on a board. */
  name = input<string>("");
  /** Lists with the same group exchange rows. */
  group = input<string | undefined>(undefined);
  /** Accessible name; spoken in announcements ("position 2 of 4 in To do"). */
  label = input<string | undefined>(undefined);
  orientation = input<"vertical" | "horizontal">("vertical");
  /** Show a grip: dragging with the pointer then starts only from it (use this on touch screens). */
  handle = input<boolean>(false);
  disabled = input<boolean>(false);
  class = input<string>("");
  moved = output<SortableMove<SortableRow>>();
  removed = output<SortableMove<SortableRow>>();

  private fallback = `sortable-${++counter}`;
  listName = computed(() => this.name() || this.fallback);
  listClasses = computed(() =>
    cn(
      "flex min-h-12 gap-2 rounded-lg border border-dashed border-transparent p-1 transition-colors data-[drop-over]:border-ring/60 data-[drop-over]:bg-accent/30",
      this.orientation() === "vertical" ? "flex-col" : "flex-row flex-wrap",
      this.class(),
    ),
  );
  itemClasses = computed(() =>
    cn(
      "flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-card-foreground shadow-xs outline-none select-none",
      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
      "data-[dragging]:opacity-40 aria-disabled:opacity-50",
      "data-[drop-position=before]:shadow-[0_-3px_0_0_var(--color-ring)] data-[drop-position=after]:shadow-[0_3px_0_0_var(--color-ring)]",
      this.handle() ? "" : "cursor-grab",
    ),
  );

  onMoved(event: SortableMove) {
    const e = event as SortableMove<SortableRow>;
    this.items.set(applySortableMove(this.items(), e, this.listName(), (r) => r.id));
    this.moved.emit(e);
  }
  onRemoved(event: SortableMove) {
    const e = event as SortableMove<SortableRow>;
    this.items.set(applySortableMove(this.items(), e, this.listName(), (r) => r.id));
    this.removed.emit(e);
  }
}
