import type { AnyExtension, Editor } from "@tiptap/core";
import type * as Y from "yjs";

/** An item a plugin contributes to the toolbar. The toolbar UI renders these; plugins never touch the DOM. */
export interface ToolbarItem {
  id: string;
  label: string;
  /** Items sharing a group render together, groups sort by `order`. */
  group?: string;
  order?: number;
  /** Name of a glyph in gable-ui's `ICONS` registry. Built-in items get lucide glyphs by id; without one the label is shown. */
  icon?: string;
  run(editor: Editor): boolean;
  isActive?(editor: Editor): boolean;
  isEnabled?(editor: Editor): boolean;
  /** Items that need a value from the user (e.g. a URL) declare it here; the UI collects it and calls `runWith`. */
  input?: {
    kind: "url" | "text";
    label: string;
    /** Prefill for the field (e.g. the current href). */
    initial?(editor: Editor): string;
    /** When the item is active, also offer a button with this label that calls `run` (e.g. "Remove link"). */
    removeLabel?: string;
  };
  runWith?(editor: Editor, value: string): boolean;
}

/** Context handed to a plugin's collaboration hook once a Y.Doc is attached to the editor. */
export interface YjsContext {
  readonly ydoc: Y.Doc;
  readonly editor: Editor;
}

/**
 * The unit every editor feature ships as. A plugin bundles TipTap extensions (nodes, marks, commands,
 * keymaps, ProseMirror plugins, input rules) with toolbar items and an optional Yjs hook for state
 * that lives next to the document (comments, suggestions).
 */
export interface EditorPlugin {
  /** Unique name; also what other plugins list in `requires`. */
  readonly name: string;
  /** Names of plugins that must be present. They load first. */
  readonly requires?: readonly string[];
  /** Higher loads earlier among plugins with no ordering constraint. Default 100. */
  readonly priority?: number;
  readonly extensions?: readonly AnyExtension[];
  readonly toolbar?: readonly ToolbarItem[];
  /** Called when a Y.Doc is attached; return a disposer. */
  readonly yjs?: (ctx: YjsContext) => void | (() => void);
}

/**
 * Identity helper that type-checks a plugin definition and keeps its literal type. It does nothing at runtime, so
 * a plain object typed as `EditorPlugin` is equivalent.
 *
 * @example
 * ```ts
 * const quotePlugin = definePlugin({
 *   name: "quote",
 *   requires: ["core"],
 *   extensions: [Blockquote],
 *   toolbar: [{ id: "quote", label: "Quote", run: (e) => e.chain().focus().toggleBlockquote().run() }],
 * });
 * ```
 */
export function definePlugin<T extends EditorPlugin>(plugin: T): T {
  return plugin;
}

/**
 * Thrown when a set of plugins cannot be assembled: a duplicate plugin name or toolbar item id, a `requires` entry
 * that is not in the list, or a dependency cycle. It is thrown by the `GableEditor` constructor, so it surfaces at
 * setup, never while typing.
 */
export class PluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginError";
  }
}

/** Validates and orders plugins: dependencies first, then by priority (desc), then registration order. */
export function resolvePlugins(plugins: readonly EditorPlugin[]): EditorPlugin[] {
  const byName = new Map<string, EditorPlugin>();
  const order = new Map<string, number>();
  plugins.forEach((p, i) => {
    if (byName.has(p.name)) throw new PluginError(`Duplicate plugin "${p.name}"`);
    byName.set(p.name, p);
    order.set(p.name, i);
  });
  for (const p of plugins) {
    for (const dep of p.requires ?? []) {
      if (!byName.has(dep)) throw new PluginError(`Plugin "${p.name}" requires missing plugin "${dep}"`);
    }
  }
  const rank = (p: EditorPlugin) => p.priority ?? 100;
  const pending = [...plugins].sort((a, b) => rank(b) - rank(a) || order.get(a.name)! - order.get(b.name)!);
  const done = new Set<string>();
  const out: EditorPlugin[] = [];
  while (pending.length) {
    const i = pending.findIndex((p) => (p.requires ?? []).every((d) => done.has(d)));
    if (i < 0) {
      throw new PluginError(`Plugin dependency cycle among: ${pending.map((p) => p.name).join(", ")}`);
    }
    const [p] = pending.splice(i, 1);
    done.add(p!.name);
    out.push(p!);
  }
  return out;
}

/** Toolbar items from all plugins, grouped and ordered. */
export function collectToolbar(plugins: readonly EditorPlugin[]): ToolbarItem[] {
  const items = plugins.flatMap((p) => p.toolbar ?? []);
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) throw new PluginError(`Duplicate toolbar item "${it.id}"`);
    seen.add(it.id);
  }
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (a.it.order ?? 0) - (b.it.order ?? 0) || a.i - b.i)
    .map((x) => x.it);
}
