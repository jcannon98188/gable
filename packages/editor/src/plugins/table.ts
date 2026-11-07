import type { Editor } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { definePlugin, type ToolbarItem } from "../plugin.js";

const op = (id: string, label: string, order: number, run: (e: Editor) => boolean, can: (e: Editor) => boolean): ToolbarItem => ({
  id,
  label,
  order,
  group: "table",
  run,
  isEnabled: can,
});

const inTable = (e: Editor) => e.isActive("table");

/** Tables with row/column operations, merged cells, a header row and draggable column widths. */
export const tablePlugin = definePlugin({
  name: "table",
  requires: ["core"],
  extensions: [Table.configure({ resizable: true }), TableRow, TableHeader, TableCell],
  toolbar: [
    op("insertTable", "Insert table", 60, (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), (e) => e.isEditable),
    op("addRowAfter", "Add row below", 61, (e) => e.chain().focus().addRowAfter().run(), (e) => inTable(e) && e.can().addRowAfter()),
    op("addRowBefore", "Add row above", 62, (e) => e.chain().focus().addRowBefore().run(), (e) => inTable(e) && e.can().addRowBefore()),
    op("addColumnAfter", "Add column right", 63, (e) => e.chain().focus().addColumnAfter().run(), (e) => inTable(e) && e.can().addColumnAfter()),
    op("addColumnBefore", "Add column left", 64, (e) => e.chain().focus().addColumnBefore().run(), (e) => inTable(e) && e.can().addColumnBefore()),
    op("deleteRow", "Delete row", 65, (e) => e.chain().focus().deleteRow().run(), (e) => inTable(e) && e.can().deleteRow()),
    op("deleteColumn", "Delete column", 66, (e) => e.chain().focus().deleteColumn().run(), (e) => inTable(e) && e.can().deleteColumn()),
    op("mergeCells", "Merge cells", 67, (e) => e.chain().focus().mergeCells().run(), (e) => inTable(e) && e.can().mergeCells()),
    op("splitCell", "Split cell", 68, (e) => e.chain().focus().splitCell().run(), (e) => inTable(e) && e.can().splitCell()),
    op("toggleHeaderRow", "Toggle header row", 69, (e) => e.chain().focus().toggleHeaderRow().run(), (e) => inTable(e) && e.can().toggleHeaderRow()),
    op("deleteTable", "Delete table", 70, (e) => e.chain().focus().deleteTable().run(), (e) => inTable(e) && e.can().deleteTable()),
  ],
});
