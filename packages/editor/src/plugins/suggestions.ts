import { Extension, Mark, type Editor } from "@tiptap/core";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { AddMarkStep, RemoveMarkStep, ReplaceStep, Mapping } from "@tiptap/pm/transform";
import type { Mark as PMMark, MarkType, Node as PMNode } from "@tiptap/pm/model";
import { definePlugin, type EditorPlugin } from "../plugin.js";
import { Y_SYNC_META } from "../yjs/binding.js";
import type { CollabUser } from "../yjs/awareness.js";

/** What a suggestion would do to the document: add text, remove text or change formatting. */
export type SuggestionKind = "insert" | "delete" | "format";

/** One pending change recorded in suggestion mode, awaiting accept or reject. */
export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  author: CollabUser;
  /** Epoch milliseconds. */
  at: number;
  /** The affected text. */
  text: string;
  /** Format suggestions: what would change, e.g. "bold added". */
  description?: string;
  ranges: Array<{ from: number; to: number }>;
}

/**
 * Options for `suggestionsPlugin`.
 *
 * @example
 * ```ts
 * suggestionsPlugin({ user: { name: "Ada", color: "#d97706" }, mode: true });
 * ```
 */
export interface SuggestionsOptions {
  user: CollabUser;
  /** Start in suggestion mode. Default false. */
  mode?: boolean;
  now?: () => number;
}

/** Everything a UI needs to drive suggestion mode: toggle it, list pending suggestions, accept or reject them, and subscribe to changes. Obtained with `getSuggestions(editor)`. */
export interface SuggestionsApi {
  mode(): boolean;
  setMode(on: boolean): void;
  /** Pending suggestions in document order. */
  list(): Suggestion[];
  accept(id: string): boolean;
  reject(id: string): boolean;
  acceptAll(): number;
  rejectAll(): number;
  /** Called when the mode or the set of suggestions may have changed. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

const BYPASS = "gable-suggestion-bypass";
const MODE_META = "gable-suggestion-mode";
const apis = new WeakMap<Editor, SuggestionsApi>();

/** The suggestions API of an editor built with `suggestionsPlugin`, if any. */
export function getSuggestions(editor: Editor): SuggestionsApi | undefined {
  return apis.get(editor);
}

const attrs = {
  id: { default: "" },
  author: { default: "" },
  color: { default: "#6b7280" },
  at: { default: 0 },
};

const render = (tag: string, kind: string, style: string) => (props: { HTMLAttributes: Record<string, unknown> }) =>
  [tag, { "data-suggestion": kind, "data-suggestion-id": props.HTMLAttributes.id, "data-author": props.HTMLAttributes.author, style }, 0] as const;

const insertMark = Mark.create({
  name: "suggestionInsert",
  inclusive: false,
  addAttributes: () => attrs,
  parseHTML: () => [{ tag: "ins[data-suggestion]" }],
  renderHTML: ({ HTMLAttributes }) => render("ins", "insert", "text-decoration:underline;background-color:color-mix(in srgb, #16a34a 18%, transparent)")({ HTMLAttributes }) as never,
});

const deleteMark = Mark.create({
  name: "suggestionDelete",
  inclusive: false,
  addAttributes: () => attrs,
  parseHTML: () => [{ tag: "del[data-suggestion]" }],
  renderHTML: ({ HTMLAttributes }) => render("del", "delete", "text-decoration:line-through;background-color:color-mix(in srgb, #dc2626 18%, transparent)")({ HTMLAttributes }) as never,
});

const formatMark = Mark.create({
  name: "suggestionFormat",
  inclusive: false,
  addAttributes: () => ({ ...attrs, action: { default: "add" }, mark: { default: "" }, markAttrs: { default: "" } }),
  parseHTML: () => [{ tag: "span[data-suggestion=format]" }],
  renderHTML: ({ HTMLAttributes }) => render("span", "format", "border-bottom:2px dotted #2563eb")({ HTMLAttributes }) as never,
});

const SUGGESTION_MARKS = ["suggestionInsert", "suggestionDelete", "suggestionFormat"];
const kindOf = (name: string): SuggestionKind | null =>
  name === "suggestionInsert" ? "insert" : name === "suggestionDelete" ? "delete" : name === "suggestionFormat" ? "format" : null;

let counter = 0;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `s${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Id of an adjacent suggestion of this kind and author at `pos`, so consecutive typing stays one suggestion. */
function adjacentId(doc: PMNode, pos: number, type: MarkType, author: string): string | null {
  const $pos = doc.resolve(pos);
  for (const node of [$pos.nodeBefore, $pos.nodeAfter]) {
    const mark = node?.marks.find((m) => m.type === type && m.attrs.author === author);
    if (mark) return mark.attrs.id as string;
  }
  return null;
}

/**
 * Suggestion mode ("track changes"). While on, the local user's edits are recorded as marks (insertions, deletions, format
 * changes with author and time) that anyone can accept or reject. See ADR 0003.
 */
export function suggestionsPlugin(options: SuggestionsOptions): EditorPlugin {
  const { user } = options;
  const now = options.now ?? Date.now;

  const extension = Extension.create({
    name: "gableSuggestions",
    addExtensions: () => [insertMark, deleteMark, formatMark],
    addStorage: () => ({ install: null as null | (() => void) }),
    // The API is available from construction (UIs look it up as soon as they get the editor); dispatch is wrapped once the view exists.
    onBeforeCreate() {
      const editor = this.editor;
      const view = {
        get state() {
          return editor.view.state;
        },
        dispatch: (tr: Transaction) => editor.view.dispatch(tr),
      };
      const listeners = new Set<() => void>();
      let on = options.mode ?? false;
      const notify = () => listeners.forEach((l) => l());
      const types = () => ({
        ins: editor.schema.marks.suggestionInsert!,
        del: editor.schema.marks.suggestionDelete!,
        fmt: editor.schema.marks.suggestionFormat!,
      });
      const stamp = (id: string) => ({ id, author: user.name, color: user.color, at: now() });

      /** Rewrites a local transaction into its suggestion form, or null to refuse it. */
      const transform = (tr: Transaction): Transaction | null => {
        const { ins, del, fmt } = types();
        const out = view.state.tr;
        let m = new Mapping();
        const formatIds = new Map<string, string>();
        for (const step of tr.steps) {
          const n0 = out.steps.length;
          if (step instanceof ReplaceStep) {
            const s = step as unknown as { from: number; to: number; slice: import("@tiptap/pm/model").Slice; structure: boolean };
            const f = m.map(s.from, -1);
            let t = m.map(s.to, 1);
            if (t > f) {
              if (!out.doc.resolve(f).sameParent(out.doc.resolve(t))) return null; // joins blocks: not tracked
              const mine: Array<[number, number]> = [];
              const others: Array<[number, number]> = [];
              out.doc.nodesBetween(f, t, (node, pos) => {
                if (!node.isInline) return true;
                const a = Math.max(pos, f);
                const b = Math.min(pos + node.nodeSize, t);
                if (node.marks.some((mk) => mk.type === del)) return false; // already deleted
                const own = node.marks.some((mk) => mk.type === ins && mk.attrs.author === user.name);
                (own ? mine : others).push([a, b]);
                return false;
              });
              const id = adjacentId(out.doc, f, del, user.name) ?? adjacentId(out.doc, t, del, user.name) ?? newId();
              for (const [a, b] of others) out.addMark(a, b, del.create(stamp(id)));
              const dn = out.steps.length;
              for (const [a, b] of [...mine].reverse()) out.delete(a, b); // retracting your own insertion is a real delete
              t = out.mapping.slice(dn).map(t, 1);
            }
            if (s.slice.size > 0) {
              const before = out.doc;
              out.step(new ReplaceStep(t, t, s.slice, s.structure));
              const id = adjacentId(before, t, ins, user.name) ?? newId();
              out.addMark(t, t + s.slice.size, ins.create(stamp(id)));
            }
          } else if ((step instanceof AddMarkStep || step instanceof RemoveMarkStep) && !SUGGESTION_MARKS.includes((step as unknown as { mark: PMMark }).mark.type.name)) {
            const s = step as unknown as { from: number; to: number; mark: PMMark };
            const action = step instanceof AddMarkStep ? "add" : "remove";
            const key = `${action}:${s.mark.type.name}:${JSON.stringify(s.mark.attrs)}`;
            const id = formatIds.get(key) ?? newId();
            formatIds.set(key, id);
            out.addMark(m.map(s.from, -1), m.map(s.to, 1), fmt.create({ ...stamp(id), action, mark: s.mark.type.name, markAttrs: JSON.stringify(s.mark.attrs) }));
          } else {
            const mapped = step.map(m);
            if (mapped) out.step(mapped);
          }
          m = new Mapping([step.getMap().invert(), ...m.maps, ...out.mapping.maps.slice(n0)]);
        }
        const max = out.doc.content.size;
        const clamp = (p: number) => Math.max(0, Math.min(max, m.map(p)));
        if (tr.selectionSet && tr.selection instanceof TextSelection) {
          out.setSelection(TextSelection.create(out.doc, clamp(tr.selection.anchor), clamp(tr.selection.head)));
        }
        if (tr.storedMarksSet) out.setStoredMarks(tr.storedMarks);
        const meta = (tr as unknown as { meta: Record<string, unknown> }).meta;
        for (const k of Object.keys(meta)) if (!k.startsWith("selection")) out.setMeta(k, meta[k]);
        return out;
      };

      this.storage.install = () => {
        const original = editor.view.dispatch.bind(editor.view);
        editor.view.dispatch = (tr: Transaction) => {
          if (!on || !tr.docChanged || tr.getMeta(Y_SYNC_META) || tr.getMeta(BYPASS)) return original(tr);
          const next = transform(tr);
          if (next) original(next);
        };
      };

      const collect = (): Suggestion[] => {
        const { ins, del, fmt } = types();
        const byId = new Map<string, Suggestion>();
        editor.state.doc.descendants((node, pos) => {
          if (!node.isText) return true;
          for (const mk of node.marks) {
            const kind = kindOf(mk.type.name);
            if (!kind || ![ins, del, fmt].includes(mk.type)) continue;
            const id = mk.attrs.id as string;
            let s = byId.get(id);
            if (!s) {
              s = {
                id,
                kind,
                author: { name: mk.attrs.author as string, color: mk.attrs.color as string },
                at: mk.attrs.at as number,
                text: "",
                ranges: [],
                ...(kind === "format" ? { description: `${mk.attrs.mark} ${mk.attrs.action === "add" ? "added" : "removed"}` } : {}),
              };
              byId.set(id, s);
            }
            s.text += node.text;
            const last = s.ranges.at(-1);
            if (last && last.to === pos) last.to = pos + node.nodeSize;
            else s.ranges.push({ from: pos, to: pos + node.nodeSize });
          }
          return false;
        });
        return [...byId.values()].sort((a, b) => a.ranges[0]!.from - b.ranges[0]!.from);
      };

      const resolve = (ids: Set<string>, accept: boolean): number => {
        const { ins, del, fmt } = types();
        const picked = collect().filter((s) => ids.has(s.id));
        if (!picked.length) return 0;
        const todo = picked.flatMap((s) => s.ranges.map((r) => ({ s, ...r }))).sort((a, b) => b.from - a.from);
        const tr = editor.state.tr.setMeta(BYPASS, true);
        for (const { s, from, to } of todo) {
          if (s.kind === "insert") accept ? tr.removeMark(from, to, ins) : tr.delete(from, to);
          else if (s.kind === "delete") accept ? tr.delete(from, to) : tr.removeMark(from, to, del);
          else {
            if (accept) {
              const mark = tr.doc.resolve(from).nodeAfter?.marks.find((mk) => mk.type === fmt && mk.attrs.id === s.id);
              const type = mark && editor.schema.marks[mark.attrs.mark as string];
              if (mark && type) {
                const created = type.create(JSON.parse((mark.attrs.markAttrs as string) || "{}"));
                mark.attrs.action === "add" ? tr.addMark(from, to, created) : tr.removeMark(from, to, type);
              }
            }
            tr.removeMark(from, to, fmt);
          }
        }
        view.dispatch(tr);
        return picked.length;
      };

      const api: SuggestionsApi = {
        mode: () => on,
        setMode(next) {
          if (next === on) return;
          on = next;
          view.dispatch(editor.state.tr.setMeta(MODE_META, next).setMeta("addToHistory", false)); // refreshes the toolbar
          notify();
        },
        list: collect,
        accept: (id) => resolve(new Set([id]), true) > 0,
        reject: (id) => resolve(new Set([id]), false) > 0,
        acceptAll: () => resolve(new Set(collect().map((s) => s.id)), true),
        rejectAll: () => resolve(new Set(collect().map((s) => s.id)), false),
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      apis.set(editor, api);
      editor.on("transaction", notify);
      editor.on("destroy", () => {
        editor.off("transaction", notify);
        apis.delete(editor);
        listeners.clear();
      });
    },
    onCreate() {
      this.storage.install?.();
    },
  });

  return definePlugin({
    name: "suggestions",
    requires: ["core"],
    priority: 20,
    extensions: [extension],
    toolbar: [
      {
        id: "suggestMode",
        label: "Suggestion mode",
        group: "review",
        order: 100,
        run: (editor) => {
          const api = getSuggestions(editor);
          api?.setMode(!api.mode());
          return !!api;
        },
        isActive: (editor) => getSuggestions(editor)?.mode() ?? false,
      },
    ],
  });
}
