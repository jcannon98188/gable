import { Editor, type EditorOptions } from "@tiptap/core";
import type * as Y from "yjs";
import { collectToolbar, resolvePlugins, type EditorPlugin, type ToolbarItem } from "./plugin.js";

export interface GableEditorOptions extends Partial<Omit<EditorOptions, "extensions">> {
  plugins: readonly EditorPlugin[];
}

/** A TipTap editor assembled from plugins. Works headless: omit `element` and no view is mounted. */
export class GableEditor {
  readonly editor: Editor;
  readonly plugins: readonly EditorPlugin[];
  readonly toolbar: readonly ToolbarItem[];
  #disposers: Array<() => void> = [];

  constructor(options: GableEditorOptions) {
    const { plugins, ...rest } = options;
    this.plugins = resolvePlugins(plugins);
    this.toolbar = collectToolbar(this.plugins);
    this.editor = new Editor({
      ...rest,
      extensions: this.plugins.flatMap((p) => [...(p.extensions ?? [])]),
    });
  }

  /** Attach a Y.Doc: runs every plugin's `yjs` hook. The document binding itself is TASK-75.2. */
  attachYDoc(ydoc: Y.Doc): void {
    for (const p of this.plugins) {
      const dispose = p.yjs?.({ ydoc, editor: this.editor });
      if (dispose) this.#disposers.push(dispose);
    }
  }

  destroy(): void {
    for (const d of this.#disposers.splice(0).reverse()) d();
    this.editor.destroy();
  }
}
