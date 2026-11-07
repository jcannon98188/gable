import { computed, html, input, model, output, signal } from "@gable/core";
import { cn } from "../lib/cn.js";

/** One cell of a swatch grid. `color` is any CSS colour (fills the cell); `content` is text shown in the cell (a scale step like "4"). */
export interface SwatchItem {
  value: string;
  /** The cell's accessible name and its tooltip. */
  label: string;
  color?: string;
  content?: string;
  disabled?: boolean;
}

let counter = 0;

/**
 * A grid of selectable cells: colour swatches or a spacing scale (a radio group with a roving tabindex).
 *
 *   <ui-swatch-grid [items]="colors" [(value)]="picked" [columns]="6" label="Background" (hovered)="preview($event)"></ui-swatch-grid>
 *
 * `items` is `{ value, label, color?, content?, disabled? }` data and `value` (two-way) is the chosen item's value, marked with
 * `aria-checked` and a ring. Tab enters the grid once, on the chosen cell (or the first); the arrow keys move focus in both
 * axes (Left/Right by one, Up/Down by a row of `columns`, Home/End to the ends) and skip disabled cells; Enter or Space
 * chooses. `hovered` fires with the value of the cell under the pointer or holding keyboard focus and with `null` when the
 * pointer or focus leaves, so a caller can preview the value live without committing it.
 */
export class UiSwatchGrid {
  static meta = {
    selector: "ui-swatch-grid",
    host: { class: "block" },
    template: html`
      <div role="radiogroup" [attr.aria-label]="label()" [attr.class]="gridClasses()" [attr.style]="gridStyle()" (focusout)="onFocusOut($event)">
        @for (row of rows(); track row.value) {
          <button
            type="button"
            role="radio"
            [attr.id]="row.id"
            [attr.aria-checked]="row.checked"
            [attr.aria-label]="row.label"
            [attr.title]="row.label"
            [attr.tabindex]="row.tabindex"
            [attr.disabled]="row.disabled"
            [attr.style]="row.style"
            [attr.class]="cellClasses()"
            (click)="choose(row.value)"
            (keydown)="onKey($event, row.value)"
            (focus)="enter(row.value)"
            (pointerenter)="enter(row.value)"
            (pointerleave)="leave()"
          >{{ row.content }}</button>
        }
      </div>
    `,
  };

  items = input<SwatchItem[]>([]);
  /** Two-way: the chosen item's value, or null. */
  value = model<string | null>(null);
  /** Cells per row; the Up and Down keys move by this many. */
  columns = input<number>(6);
  /** Accessible name of the group. */
  label = input<string>("Swatches");
  class = input<string>("");
  /** Class for each cell (its size and shape): wins over the default `size-8 rounded-md`. */
  cellClass = input<string>("");
  /** The value of the hovered or focused cell, or null when neither. */
  hovered = output<string | null>();

  private gridId = `ui-swatch-grid-${++counter}`;
  /** The cell that holds focus (the roving stop while focus is inside). */
  private focused = signal<string | null>(null);

  gridClasses = computed(() => cn("grid w-fit gap-1.5", this.class()));
  gridStyle = computed(() => `grid-template-columns: repeat(${Math.max(1, this.columns())}, auto);`);
  cellClasses = computed(() =>
    cn(
      "flex size-8 items-center justify-center rounded-md border text-xs font-medium text-foreground outline-none ring-offset-background transition-shadow hover:ring-2 hover:ring-ring/50 hover:ring-offset-1 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-checked:ring-2 aria-checked:ring-primary aria-checked:ring-offset-2",
      this.cellClass(),
    ),
  );

  /** The one cell with tabindex 0: the focused one, else the chosen one, else the first enabled one. */
  private stop = computed(() => {
    const items = this.items();
    const enabled = (v: string | null) => items.find((i) => i.value === v && !i.disabled)?.value;
    return enabled(this.focused()) ?? enabled(this.value()) ?? items.find((i) => !i.disabled)?.value ?? null;
  });
  rows = computed(() => {
    const stop = this.stop();
    const value = this.value();
    return this.items().map((item, index) => ({
      value: item.value,
      label: item.label,
      content: item.content ?? "",
      id: `${this.gridId}-cell-${index}`,
      checked: item.value === value ? "true" : "false",
      tabindex: item.value === stop ? "0" : "-1",
      disabled: item.disabled ? "" : null,
      style: item.color ? `background-color: ${item.color};` : null,
    }));
  });

  choose(value: string): void {
    if (this.items().some((i) => i.value === value && !i.disabled)) this.value.set(value);
  }

  enter(value: string): void {
    if (this.items().some((i) => i.value === value && !i.disabled)) this.hovered.emit(value);
  }

  leave(): void {
    this.hovered.emit(null);
  }

  onFocusOut(event: { currentTarget?: unknown; relatedTarget?: unknown }): void {
    const grid = event.currentTarget as { contains?(node: unknown): boolean } | null;
    if (event.relatedTarget && grid?.contains?.(event.relatedTarget)) return;
    this.focused.set(null);
    this.leave();
  }

  onKey(event: unknown, value: string): void {
    const e = event as { key: string; preventDefault(): void };
    const items = this.items();
    const at = items.findIndex((i) => i.value === value);
    const cols = Math.max(1, this.columns());
    const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols } as Record<string, number>)[e.key];
    let next = -1;
    if (step !== undefined) {
      // skip disabled cells in the direction of travel, staying put at an edge
      for (let i = at + step; i >= 0 && i < items.length; i += step) {
        if (!items[i]!.disabled) {
          next = i;
          break;
        }
      }
    } else if (e.key === "Home") next = items.findIndex((i) => !i.disabled);
    else if (e.key === "End") next = items.map((i) => !i.disabled).lastIndexOf(true);
    else return;
    e.preventDefault();
    if (next < 0 || next === at) return;
    this.focused.set(items[next]!.value);
    (globalThis as { document?: Document }).document?.getElementById(`${this.gridId}-cell-${next}`)?.focus();
  }
}
