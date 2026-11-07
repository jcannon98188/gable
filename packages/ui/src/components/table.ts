import { input } from "@gable/core";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

/**
 * Table parts, attribute directives on the native table elements:
 *
 *   <div uiTableContainer>
 *     <table uiTable>
 *       <caption uiTableCaption>Invoices</caption>
 *       <thead uiTableHeader><tr uiTableRow><th uiTableHead>Name</th></tr></thead>
 *       <tbody uiTableBody><tr uiTableRow><td uiTableCell>Ada</td></tr></tbody>
 *       <tfoot uiTableFooter>...</tfoot>
 *     </table>
 *   </div>
 */
export class UiTableContainer {
  static meta = { selector: "[uiTableContainer]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("relative w-full overflow-x-auto", this.class()));
}
/** `table[uiTable]`: the table itself: full width, caption below. Put it inside a `uiTableContainer` so wide tables scroll horizontally. */
export class UiTable {
  static meta = { selector: "table[uiTable]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("w-full caption-bottom text-sm", this.class()));
}
/** `thead[uiTableHeader]`: the header group; draws a border under its rows. */
export class UiTableHeader {
  static meta = { selector: "thead[uiTableHeader]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("[&_tr]:border-b", this.class()));
}
/** `tbody[uiTableBody]`: the body group; the last row has no bottom border. */
export class UiTableBody {
  static meta = { selector: "tbody[uiTableBody]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("[&_tr:last-child]:border-0", this.class()));
}
/** `tfoot[uiTableFooter]`: the footer group, on a muted background with a top border (totals, summaries). */
export class UiTableFooter {
  static meta = { selector: "tfoot[uiTableFooter]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", this.class()));
}
/** `tr[uiTableRow]`: a row with a hover highlight. Set `data-state="selected"` to show it selected. */
export class UiTableRow {
  static meta = { selector: "tr[uiTableRow]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", this.class()));
}
/** `th[uiTableHead]`: a column header cell. Add `scope="col"` for assistive technology. */
export class UiTableHead {
  static meta = { selector: "th[uiTableHead]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0", this.class()));
}
/** `td[uiTableCell]`: a data cell. One line by default; set `wrap` for a text column that should wrap. */
export class UiTableCell {
  static meta = { selector: "td[uiTableCell]" };
  class = input<string>("");
  /** Let the text wrap (a message column); the row grows to fit. Default: one line. */
  wrap = input<boolean>(false);
  private apply = useHostClass(() => cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", this.wrap() ? "break-words whitespace-normal" : "whitespace-nowrap", this.class()));
}
/** `caption[uiTableCaption]`: the table's caption (its accessible name), drawn below the table in muted text. */
export class UiTableCaption {
  static meta = { selector: "caption[uiTableCaption]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("mt-4 text-sm text-muted-foreground", this.class()));
}
