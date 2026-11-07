import { Editor, type EditorOptions } from "@tiptap/core";
import type * as Y from "yjs";
import { collectToolbar, resolvePlugins, type EditorPlugin, type ToolbarItem } from "./plugin.js";

/**
 * Options for {@link GableEditor}: any TipTap `EditorOptions` except `extensions` (those come from the plugins),
 * plus the plugin list and an optional shared document.
 *
 * @example
 * ```ts
 * new GableEditor({ plugins: [corePlugin, ...formattingPlugins], content: "<p>Hello</p>" });
 * ```
 */
export interface GableEditorOptions extends Partial<Omit<EditorOptions, "extensions">> {
  plugins: readonly EditorPlugin[];
  /** Shared document; when given, every plugin's `yjs` hook runs against it right after construction. */
  ydoc?: Y.Doc;
}

/** A TipTap editor assembled from plugins. Works headless: omit `element` and no view is mounted. */
export class GableEditor {
  readonly editor: Editor;
  readonly plugins: readonly EditorPlugin[];
  readonly toolbar: readonly ToolbarItem[];
  #disposers: Array<() => void> = [];

  constructor(options: GableEditorOptions) {
    const { plugins, ydoc, ...rest } = options;
    this.plugins = resolvePlugins(plugins);
    this.toolbar = collectToolbar(this.plugins);
    this.editor = new Editor({
      ...rest,
      extensions: this.plugins.flatMap((p) => [...(p.extensions ?? [])]),
    });
    if (ydoc) this.attachYDoc(ydoc);
  }

  /** Attach a Y.Doc: runs every plugin's `yjs` hook. Plugins keep extra shared state (comments, suggestions) next to the document. */
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
