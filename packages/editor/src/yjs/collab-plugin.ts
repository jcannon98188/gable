import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type * as Y from "yjs";
import { definePlugin, type EditorPlugin } from "../plugin.js";
import { YProseMirrorBinding } from "./binding.js";

const bindings = new WeakMap<EditorView, YProseMirrorBinding>();

export interface CollabOptions {
  ydoc: Y.Doc;
  /** Y.XmlFragment name. Default "content". */
  field?: string;
  /** Undo merge window in ms. Default 500. */
  captureTimeout?: number;
  /** Resolve when the provider has synced. Until then the editor neither seeds nor pushes content, so peers never duplicate each other's initial document. */
  whenSynced?: Promise<unknown>;
}

/** The live binding of a view created with `collabPlugin`, if any. */
export function getBinding(view: EditorView): YProseMirrorBinding | undefined {
  return bindings.get(view);
}

/**
 * Real-time collaboration through our own Yjs binding. Replaces TipTap's history: undo/redo are
 * per-user and routed through Y.UndoManager, so never combine this with a ProseMirror history plugin.
 * Other plugins reach the shared Y.Doc through their `yjs` hook.
 */
export function collabPlugin(options: CollabOptions): EditorPlugin {
  const extension = Extension.create({
    name: "gableCollab",
    addCommands() {
      return {
        undo:
          () =>
          ({ view, tr }) => {
            tr.setMeta("preventDispatch", true); // the binding dispatches its own transactions
            return bindings.get(view)?.undo() ?? false;
          },
        redo:
          () =>
          ({ view, tr }) => {
            tr.setMeta("preventDispatch", true);
            return bindings.get(view)?.redo() ?? false;
          },
      };
    },
    addKeyboardShortcuts() {
      const run = (kind: "undo" | "redo") => () => this.editor.commands[kind]();
      return { "Mod-z": run("undo"), "Mod-y": run("redo"), "Mod-Shift-z": run("redo") };
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("gable-collab"),
          view: (view) => {
            const binding = new YProseMirrorBinding({
              ydoc: options.ydoc,
              field: options.field,
              captureTimeout: options.captureTimeout,
              host: {
                get state() {
                  return view.state;
                },
                dispatch: (tr) => view.dispatch(tr),
              },
            });
            bindings.set(view, binding);
            // Dispatching while the view is still being constructed is unsafe; sync right after.
            void Promise.resolve(options.whenSynced).then(() => {
              if (view.isDestroyed) return;
              // An untouched empty editor must not seed Yjs: it would add a stray empty paragraph for every peer.
              const doc = view.state.doc;
              const blank = doc.childCount === 1 && doc.firstChild!.isTextblock && doc.firstChild!.content.size === 0;
              binding.init({ seed: !blank });
            });
            return {
              update: () => binding.pmChanged(),
              destroy: () => {
                bindings.delete(view);
                binding.destroy();
              },
            };
          },
        }),
      ];
    },
  });
  return definePlugin({ name: "collab", requires: ["core"], priority: 50, extensions: [extension] });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    gableCollab: {
      undo: () => ReturnType;
      redo: () => ReturnType;
    };
  }
}
