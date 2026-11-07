import { ICONS } from "@gable/ui";
import {
  BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart, Bold, Captions, Code, Heading1, Heading2,
  Heading3, Image, Italic, Link, List, ListOrdered, ListTodo, MessageSquarePlus, Minus, Pencil, PanelTop, Quote, Redo2, SquareCode,
  SquareMinus, SquareX, Strikethrough, Table2, TableCellsMerge, TableCellsSplit, Trash2, Underline, Undo2, ReplaceAll,
} from "lucide";

/** Lucide glyph (by `ICONS` name) for each built-in toolbar item id. A plugin's own `ToolbarItem.icon` wins over this. */
export const ITEM_ICONS: Record<string, string> = {
  undo: "ed-undo", redo: "ed-redo", bold: "ed-bold", italic: "ed-italic", underline: "ed-underline", strike: "ed-strike",
  code: "ed-code", link: "ed-link", heading1: "ed-heading-1", heading2: "ed-heading-2", heading3: "ed-heading-3",
  blockquote: "ed-quote", codeBlock: "ed-code-block", horizontalRule: "ed-rule", bulletList: "ed-list", orderedList: "ed-list-ordered",
  taskList: "ed-list-todo", insertTable: "ed-table", addRowAfter: "ed-row-after", addRowBefore: "ed-row-before",
  addColumnAfter: "ed-column-after", addColumnBefore: "ed-column-before", deleteRow: "ed-delete-row", deleteColumn: "ed-delete-column",
  mergeCells: "ed-merge", splitCell: "ed-split", toggleHeaderRow: "ed-header-row", deleteTable: "ed-delete-table", image: "ed-image",
  imageAlt: "ed-alt", imageCaption: "ed-caption", comment: "ed-comment", suggestMode: "ed-suggest",
};

/** Registers the editor's glyphs with gable-ui's icon registry (namespaced `ed-*`, so they cannot collide with an app's own). */
Object.assign(ICONS, {
  "ed-undo": Undo2, "ed-redo": Redo2, "ed-bold": Bold, "ed-italic": Italic, "ed-underline": Underline, "ed-strike": Strikethrough,
  "ed-code": Code, "ed-link": Link, "ed-heading-1": Heading1, "ed-heading-2": Heading2, "ed-heading-3": Heading3, "ed-quote": Quote,
  "ed-code-block": SquareCode, "ed-rule": Minus, "ed-list": List, "ed-list-ordered": ListOrdered, "ed-list-todo": ListTodo,
  "ed-table": Table2, "ed-row-after": BetweenHorizontalEnd, "ed-row-before": BetweenHorizontalStart,
  "ed-column-after": BetweenVerticalEnd, "ed-column-before": BetweenVerticalStart, "ed-delete-row": SquareMinus,
  "ed-delete-column": SquareX, "ed-merge": TableCellsMerge, "ed-split": TableCellsSplit, "ed-header-row": PanelTop,
  "ed-delete-table": Trash2, "ed-image": Image, "ed-alt": Pencil, "ed-caption": Captions, "ed-comment": MessageSquarePlus,
  "ed-suggest": ReplaceAll,
});
