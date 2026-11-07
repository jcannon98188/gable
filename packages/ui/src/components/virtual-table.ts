import { computed, html, input } from "@gable/core";
import { UiProps, bindProps, useVirtualizer } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiBadge, type BadgeSeverity } from "./badge.js";
import { useHostClass } from "../lib/host-class.js";

/** One column of a virtual table. */
export interface VirtualTableColumn {
  /** The property of each row object shown in this column. */
  key: string;
  label: string;
  /** A CSS grid track: `"80px"`, `"2fr"`. Default `"1fr"`. */
  width?: string;
  align?: "left" | "right" | "center";
  /** Let the text wrap onto several lines instead of truncating (use with `autoHeight`). */
  wrap?: boolean;
  /** `severity`: the cell value (`error`, `warning`, `info`, `success`) renders as a severity badge. */
  kind?: "text" | "severity";
}

const HEADER_HEIGHT = 40;

/**
 * A table of many rows (100,000 and more) that renders only the rows in view, with a header that stays at the top.
 *
 *   <ui-virtual-table [columns]="columns" [rows]="people" rowKey="id" [rowHeight]="40" class="h-96" label="People"></ui-virtual-table>
 *
 * `rows` is an array of objects; `columns` picks and labels the properties. The table is the scroll container, so give it
 * a height with a class. It uses ARIA grid semantics (`role="grid"`, `aria-rowcount` counting the header row,
 * `aria-rowindex` on every rendered row), so assistive technology reports "row 5,000 of 100,001" even though only about
 * twenty rows exist in the DOM. Arrow keys, Home, End, PageUp and PageDown move between rows. `rowKey` names the
 * property that identifies a row (default: the row's position). The rows are fixed height (`rowHeight`), which keeps
 * the scroll arithmetic exact. Use the native `table[uiTable]` parts (`table.ts`) when the table is small. It measures
 * the real element, so it needs a browser.
 */
export class UiVirtualTable {
  static meta = {
    selector: "ui-virtual-table",
    imports: [UiProps, UiBadge],
    template: html`
      <div role="row" aria-rowindex="1" [attr.style]="headerStyle()" class="sticky top-0 z-10 border-b bg-background font-medium text-foreground">
        @for (col of headerCells(); track col.key) {
          <div role="columnheader" [attr.class]="col.class">{{ col.label }}</div>
        }
      </div>
      <div [attr.style]="list.spacerStyle()">
        @for (row of body(); track row.key) {
          <div [uiProps]="row.props">
            @for (cell of row.cells; track cell.key) {
              <div role="gridcell" [attr.class]="cell.class">
                @if (cell.severity) {
                  <span uiBadge [variant]="cell.severity">{{ cell.text }}</span>
                } @else {
                  {{ cell.text }}
                }
              </div>
            }
          </div>
        }
      </div>
    `,
  };

  columns = input<VirtualTableColumn[]>([]);
  /** The data: one object per row. */
  rows = input<Array<Record<string, unknown>>>([]);
  /** Property that identifies a row. */
  rowKey = input<string>("");
  /** Row height in px (the estimate until a row is measured, with `autoHeight`). */
  rowHeight = input<number>(40);
  /** Rows take the height of their content (wrapping cells) and are measured as they render; the scroll position stays put while rows above the view are measured. */
  autoHeight = input<boolean>(false);
  /** Accessible name. */
  label = input<string>("");
  class = input<string>("");

  list = useVirtualizer({
    count: () => this.rows().length,
    itemSize: () => (this.autoHeight() ? undefined : this.rowHeight()),
    estimateSize: () => this.rowHeight(),
    getKey: (i) => {
      const key = this.rowKey();
      return (key ? (this.rows()[i]?.[key] as string | number | undefined) : undefined) ?? i;
    },
    aria: "grid",
    headerRows: 1,
    itemRole: "row",
    viewportInset: HEADER_HEIGHT,
    keyboard: true,
  });

  private apply = useHostClass(() => cn("relative block h-96 overflow-auto rounded-md border bg-background text-sm", this.class()));
  private attrs = bindProps(() => ({ role: "grid", "aria-label": this.label() || undefined, ...this.list.rootProps() }));

  private grid = computed(() => `display:grid;grid-template-columns:${this.columns().map((c) => c.width ?? "1fr").join(" ")};align-items:${this.autoHeight() ? "start" : "center"};`);
  headerStyle = computed(() => `${this.grid()}height:${HEADER_HEIGHT}px;`);
  private cellClass = (c: VirtualTableColumn, header: boolean) => cn(c.wrap && !header ? "min-w-0 px-2 py-2 break-words whitespace-normal" : cn("truncate px-2", !header && this.autoHeight() && "py-2"), header ? "text-left" : "", c.align === "right" && "text-right", c.align === "center" && "text-center");
  headerCells = computed(() => this.columns().map((c) => ({ key: c.key, label: c.label, class: this.cellClass(c, true) })));

  body = computed(() => {
    const data = this.rows();
    const columns = this.columns();
    const grid = this.grid();
    const active = this.list.activeIndex();
    return this.list.rows().map((row) => {
      const record = data[row.index] ?? {};
      const props = {
        ...row.props,
        style: `${row.props["style"]}${grid}`,
        class: cn("border-b outline-none hover:bg-muted/50 focus-visible:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset", row.index % 2 === 1 && "bg-muted/20"),
        "data-active": row.index === active ? "" : undefined,
      };
      return { key: row.key, props, cells: columns.map((c) => {
          const text = String(record[c.key] ?? "");
          return { key: c.key, text, class: this.cellClass(c, false), severity: c.kind === "severity" ? (text as BadgeSeverity) : "" };
        }) };
    });
  });
}
