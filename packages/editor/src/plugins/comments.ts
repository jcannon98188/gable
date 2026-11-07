import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import * as Y from "yjs";
import { definePlugin, type EditorPlugin } from "../plugin.js";
import { getBinding } from "../yjs/collab-plugin.js";
import type { CollabUser } from "../yjs/awareness.js";

export interface CommentMessage {
  id: string;
  author: CollabUser;
  text: string;
  /** Epoch milliseconds. */
  at: number;
}

export interface CommentThread {
  id: string;
  /** Current document range, or null when the anchored text no longer exists (an orphaned thread). */
  range: { from: number; to: number } | null;
  /** The text the thread was started on, kept for threads whose range is gone. */
  quote: string;
  resolved: boolean;
  resolvedBy?: CollabUser;
  resolvedAt?: number;
  messages: CommentMessage[];
}

export interface CommentsOptions {
  ydoc: Y.Doc;
  /** The local author. */
  user: CollabUser;
  /** Y.Map name holding the threads. Default "gable-comments". */
  field?: string;
  /** Clock, injectable for tests. */
  now?: () => number;
}

/** Everything a UI needs to show and change comment threads. Obtained with `getComments(editor)`. */
export interface CommentsApi {
  /** All threads, anchored ones in document order first, then orphaned ones. */
  threads(): CommentThread[];
  readonly activeId: string | null;
  setActive(id: string | null): void;
  /** Start a thread on the current selection. Returns the id, or null when nothing is selected. */
  start(text: string): string | null;
  reply(threadId: string, text: string): boolean;
  resolve(threadId: string): boolean;
  reopen(threadId: string): boolean;
  remove(threadId: string): boolean;
  /** Called after any change to threads, anchors or the active thread. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

const apis = new WeakMap<Editor, CommentsApi>();
const key = new PluginKey<{ active: string | null }>("gable-comments");

/** The comments API of an editor built with `commentsPlugin`, if any. */
export function getComments(editor: Editor): CommentsApi | undefined {
  return apis.get(editor);
}

let counter = 0;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * CKEditor-style anchored comment threads. Threads are stored in the shared Y.Doc (a Y.Map of threads,
 * each with an array of messages) and anchored with Y.RelativePosition, so ranges follow concurrent edits.
 * Requires `collabPlugin` on the same Y.Doc.
 */
export function commentsPlugin(options: CommentsOptions): EditorPlugin {
  const { ydoc, user } = options;
  const threadsMap = ydoc.getMap<Y.Map<unknown>>(options.field ?? "gable-comments");
  const now = options.now ?? Date.now;

  const extension = Extension.create({
    name: "gableComments",
    addProseMirrorPlugins() {
      const editor = this.editor;
      const listeners = new Set<() => void>();
      let active: string | null = null;
      const notify = () => listeners.forEach((l) => l());

      const resolveRange = (t: Y.Map<unknown>): { from: number; to: number } | null => {
        const binding = editor.view ? getBinding(editor.view) : undefined;
        if (!binding) return null;
        try {
          const a = binding.fromRelativePosition(Y.createRelativePositionFromJSON(t.get("from")));
          const b = binding.fromRelativePosition(Y.createRelativePositionFromJSON(t.get("to")));
          if (a == null || b == null) return null;
          const max = editor.state.doc.content.size;
          const from = Math.min(a, b);
          const to = Math.min(Math.max(a, b), max);
          return from < to ? { from, to } : null;
        } catch {
          return null;
        }
      };

      const read = (): CommentThread[] => {
        const out: CommentThread[] = [];
        threadsMap.forEach((t, id) => {
          out.push({
            id,
            range: resolveRange(t),
            quote: (t.get("quote") as string) ?? "",
            resolved: (t.get("resolved") as boolean) ?? false,
            resolvedBy: t.get("resolvedBy") as CollabUser | undefined,
            resolvedAt: t.get("resolvedAt") as number | undefined,
            messages: ((t.get("messages") as Y.Array<CommentMessage> | undefined)?.toArray() ?? []).map((m) => ({ ...m })),
          });
        });
        const created = (t: CommentThread) => t.messages[0]?.at ?? 0;
        return out.sort((a, b) => {
          if (a.range && b.range) return a.range.from - b.range.from || created(a) - created(b);
          if (a.range) return -1;
          if (b.range) return 1;
          return created(a) - created(b);
        });
      };

      const refresh = () => {
        if (!editor.view || editor.isDestroyed) return;
        editor.view.dispatch(editor.state.tr.setMeta(key, { refresh: true }).setMeta("addToHistory", false));
      };

      const setActive = (id: string | null) => {
        if (id === active) return;
        active = id;
        refresh();
        notify();
      };

      const message = (text: string): CommentMessage => ({ id: newId(), author: user, text: text.trim(), at: now() });
      const withThread = (id: string, fn: (t: Y.Map<unknown>) => void): boolean => {
        const t = threadsMap.get(id);
        if (!t) return false;
        ydoc.transact(() => fn(t), "comments");
        return true;
      };

      const api: CommentsApi = {
        threads: read,
        get activeId() {
          return active;
        },
        setActive,
        start(text) {
          const binding = editor.view ? getBinding(editor.view) : undefined;
          const { from, to, empty } = editor.state.selection;
          if (!binding || empty || !text.trim()) return null;
          const id = newId();
          active = id; // set before the transaction so the observer redraws with it highlighted
          ydoc.transact(() => {
            const t = new Y.Map<unknown>();
            t.set("from", Y.relativePositionToJSON(binding.toRelativePosition(from, 0)));
            t.set("to", Y.relativePositionToJSON(binding.toRelativePosition(to, -1)));
            t.set("quote", editor.state.doc.textBetween(from, to, " ").slice(0, 200));
            t.set("resolved", false);
            const messages = new Y.Array<CommentMessage>();
            messages.push([message(text)]);
            t.set("messages", messages);
            threadsMap.set(id, t);
          }, "comments");
          return id;
        },
        reply: (id, text) => (text.trim() ? withThread(id, (t) => (t.get("messages") as Y.Array<CommentMessage>).push([message(text)])) : false),
        resolve: (id) =>
          withThread(id, (t) => {
            t.set("resolved", true);
            t.set("resolvedBy", user);
            t.set("resolvedAt", now());
          }),
        reopen: (id) =>
          withThread(id, (t) => {
            t.set("resolved", false);
            t.delete("resolvedBy");
            t.delete("resolvedAt");
          }),
        remove(id) {
          if (!threadsMap.has(id)) return false;
          threadsMap.delete(id);
          if (active === id) active = null;
          return true;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      apis.set(editor, api);

      const onYChange = () => {
        refresh();
        notify();
      };

      return [
        new Plugin({
          key,
          props: {
            decorations(state) {
              const decos: Decoration[] = [];
              for (const t of read()) {
                if (!t.range || t.resolved) continue;
                const isActive = t.id === active;
                decos.push(
                  Decoration.inline(t.range.from, Math.min(t.range.to, state.doc.content.size), {
                    class: isActive ? "gable-comment gable-comment-active" : "gable-comment",
                    "data-thread": t.id,
                    style: `background-color:color-mix(in srgb, #f59e0b ${isActive ? 45 : 25}%, transparent)`,
                  }),
                );
              }
              return DecorationSet.create(state.doc, decos);
            },
            handleClick(view, pos) {
              const hit = read().find((t) => !t.resolved && t.range && pos >= t.range.from && pos <= t.range.to);
              setActive(hit?.id ?? null);
              return false;
            },
          },
          view: () => {
            threadsMap.observeDeep(onYChange);
            return {
              update: (v, prev) => {
                // The binding pushes doc changes into Yjs after decorations were computed; redraw once it has.
                if (v.state.doc !== prev.doc) queueMicrotask(() => (refresh(), notify()));
              },
              destroy: () => {
                threadsMap.unobserveDeep(onYChange);
                apis.delete(editor);
                listeners.clear();
              },
            };
          },
        }),
      ];
    },
  });

  return definePlugin({
    name: "comments",
    requires: ["collab"],
    priority: 30,
    extensions: [extension],
    toolbar: [
      {
        id: "comment",
        label: "Comment",
        group: "insert",
        order: 90,
        run: () => false,
        input: { kind: "text", label: "Comment" },
        runWith: (editor, text) => getComments(editor)?.start(text) != null,
        isEnabled: (editor) => !editor.state.selection.empty,
      },
    ],
  });
}
