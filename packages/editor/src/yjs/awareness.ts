import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { definePlugin, type EditorPlugin } from "../plugin.js";
import { getBinding } from "./collab-plugin.js";

/** A collaborator as others see them: the name shown on their presence badge and the colour of their caret and selection. */
export interface CollabUser {
  name: string;
  /** Any CSS colour: caret, selection tint and presence badge. */
  color: string;
}

/** What each client publishes through awareness. Selection is stored as relative positions so it stays put under edits. */
export interface AwarenessState {
  user?: CollabUser;
  selection?: { anchor: unknown; head: unknown } | null;
}

/** One person present in the document, as {@link readPresence} reports it: their name and colour, their awareness client id and whether it is you. */
export interface PresenceEntry extends CollabUser {
  clientId: number;
  isLocal: boolean;
}

/** Everyone currently present (anyone who published a `user`), local user first. */
export function readPresence(awareness: Awareness): PresenceEntry[] {
  const out: PresenceEntry[] = [];
  awareness.getStates().forEach((state, clientId) => {
    const user = (state as AwarenessState).user;
    if (user) out.push({ ...user, clientId, isLocal: clientId === awareness.clientID });
  });
  return out.sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.clientId - b.clientId);
}

/** Calls `onChange` with the presence list now and whenever someone joins, leaves or changes. Returns an unsubscribe. */
export function watchPresence(awareness: Awareness, onChange: (users: PresenceEntry[]) => void): () => void {
  const emit = () => onChange(readPresence(awareness));
  awareness.on("change", emit);
  emit();
  return () => awareness.off("change", emit);
}

const key = new PluginKey<number>("gable-awareness");

/** Options for `awarenessPlugin`: the awareness instance of your provider and the local user to publish on it. */
export interface AwarenessOptions {
  awareness: Awareness;
  user: CollabUser;
}

function decorationsFor(view: EditorView, awareness: Awareness): DecorationSet {
  const binding = getBinding(view);
  if (!binding) return DecorationSet.empty;
  const doc = view.state.doc;
  const decos: Decoration[] = [];
  awareness.getStates().forEach((raw, clientId) => {
    if (clientId === awareness.clientID) return;
    const state = raw as AwarenessState;
    if (!state.user || !state.selection) return;
    let anchor: number | null;
    let head: number | null;
    try {
      anchor = binding.fromRelativePosition(Y.createRelativePositionFromJSON(state.selection.anchor));
      head = binding.fromRelativePosition(Y.createRelativePositionFromJSON(state.selection.head));
    } catch {
      return;
    }
    if (anchor == null || head == null) return;
    const max = doc.content.size;
    anchor = Math.min(anchor, max);
    head = Math.min(head, max);
    const { color, name } = state.user;
    if (anchor !== head) {
      decos.push(
        Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), {
          class: "gable-remote-selection",
          style: `background-color:color-mix(in srgb, ${color} 25%, transparent)`,
          "data-user": name,
        }),
      );
    }
    decos.push(
      Decoration.widget(
        head,
        () => {
          const caret = view.dom.ownerDocument.createElement("span");
          caret.className = "gable-remote-caret";
          caret.setAttribute("data-user", name);
          caret.style.cssText = `position:relative;border-left:2px solid ${color};margin-left:-1px;margin-right:-1px;pointer-events:none`;
          const label = view.dom.ownerDocument.createElement("span");
          label.className = "gable-remote-caret-label";
          label.textContent = name;
          label.style.cssText = `position:absolute;top:-1.4em;left:-2px;padding:0 4px;font-size:11px;line-height:1.3;white-space:nowrap;color:#fff;background:${color};border-radius:3px 3px 3px 0;pointer-events:none`;
          caret.append(label);
          return caret;
        },
        { side: -1, key: `caret-${clientId}-${name}-${color}`, ignoreSelection: true },
      ),
    );
  });
  return DecorationSet.create(doc, decos);
}

/**
 * Presence and remote cursors over any Yjs provider's awareness. Publishes the local user and selection, and renders
 * everyone else's caret (with a name label) and selection. Requires `collabPlugin`.
 */
export function awarenessPlugin(options: AwarenessOptions): EditorPlugin {
  const { awareness, user } = options;
  const extension = Extension.create({
    name: "gableAwareness",
    addProseMirrorPlugins() {
      let current: EditorView | null = null;
      return [
        new Plugin({
          key,
          // view.state is already the new state when ProseMirror asks for decorations.
          props: { decorations: () => (current ? decorationsFor(current, awareness) : DecorationSet.empty) },
          view: (view) => {
            current = view;
            awareness.setLocalStateField("user", user);
            const publish = () => {
              const binding = getBinding(view);
              if (!binding) return;
              const { anchor, head } = view.state.selection;
              try {
                awareness.setLocalStateField("selection", {
                  anchor: Y.relativePositionToJSON(binding.toRelativePosition(anchor)),
                  head: Y.relativePositionToJSON(binding.toRelativePosition(head)),
                });
              } catch {
                /* selection outside the synced document; skip this update */
              }
            };
            const refresh = () => {
              if (view.isDestroyed) return;
              view.dispatch(view.state.tr.setMeta(key, true).setMeta("addToHistory", false));
            };
            awareness.on("change", refresh);
            return {
              update: (v, prev) => {
                if (!v.state.selection.eq(prev.selection) || v.state.doc !== prev.doc) publish();
                // Decorations were computed before the binding pushed this change into Yjs, so the relative
                // positions resolved against the old tree. Redraw once the tree is current.
                if (v.state.doc !== prev.doc) queueMicrotask(refresh);
              },
              destroy: () => {
                awareness.off("change", refresh);
                awareness.setLocalStateField("selection", null);
                current = null;
              },
            };
          },
        }),
      ];
    },
  });
  return definePlugin({ name: "awareness", requires: ["collab"], priority: 40, extensions: [extension] });
}
