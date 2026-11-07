import type { Editor } from "@tiptap/core";
import type { ToolbarItem } from "./plugin.js";

/** A toolbar item with its current state, ready for any UI to render. */
export interface ToolbarItemState {
  item: ToolbarItem;
  id: string;
  label: string;
  group: string;
  active: boolean;
  enabled: boolean;
}

export function readToolbar(editor: Editor, items: readonly ToolbarItem[]): ToolbarItemState[] {
  const editable = editor.isEditable;
  return items.map((item) => ({
    item,
    id: item.id,
    label: item.label,
    group: item.group ?? "",
    active: editable && (item.isActive?.(editor) ?? false),
    enabled: editable && (item.isEnabled?.(editor) ?? true),
  }));
}

/**
 * Keeps a toolbar view-model fresh: calls `onChange` with new item states after every transaction and
 * selection change. Returns an unsubscribe. UI-agnostic: the Gable toolbar and any other UI share it.
 */
export function watchToolbar(editor: Editor, items: readonly ToolbarItem[], onChange: (state: ToolbarItemState[]) => void): () => void {
  const emit = () => onChange(readToolbar(editor, items));
  editor.on("transaction", emit);
  editor.on("selectionUpdate", emit);
  editor.on("focus", emit);
  editor.on("update", emit); // setEditable emits `update`, not a transaction
  emit();
  return () => {
    editor.off("transaction", emit);
    editor.off("selectionUpdate", emit);
    editor.off("focus", emit);
    editor.off("update", emit);
  };
}
