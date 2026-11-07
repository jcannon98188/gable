import type { EditorState, Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import * as Y from "yjs";
import { DocCache, pmToYPos, syncChildren, updateYFragment, yToDoc, yToPmPos, type Seeds } from "./convert.js";

/** The slice of an editor the binding needs. Lets the binding run (and be tested) without a DOM view. */
export interface BindingHost {
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
}

export interface BindingOptions {
  ydoc: Y.Doc;
  /** Name of the Y.XmlFragment holding the document. Default "content". */
  field?: string;
  host: BindingHost;
  /** Merge window for undo steps in ms. Default 500. */
  captureTimeout?: number;
}

/** Transaction meta key set on transactions that originate from Yjs, so nothing echoes them back. */
export const Y_SYNC_META = "gable-y-sync";

/**
 * Two-way binding between a ProseMirror document and a Y.XmlFragment. Not based on y-prosemirror.
 *
 * Local -> Yjs: after any state change call `pmChanged()`; the document is reconciled into the Yjs tree
 * (minimal inserts/deletes/format ops) inside a transaction tagged with this binding's origin.
 * Yjs -> local: remote transactions (any other origin, including undo) rebuild the PM doc from the
 * fragment and apply only the differing range, so the local selection maps through naturally.
 */
export class YProseMirrorBinding {
  readonly ydoc: Y.Doc;
  readonly fragment: Y.XmlFragment;
  /** Origin of local transactions. Only these are undoable by this user. */
  readonly origin = { binding: "gable-editor" };
  readonly undoManager: Y.UndoManager;
  readonly #host: BindingHost;
  readonly #cache = new DocCache();
  #lastDoc: EditorState["doc"] | null = null;
  #applyingRemote = false;
  #ready = false;
  #relSel: { anchor: Y.RelativePosition; head: Y.RelativePosition } | null = null;
  #observer: (events: Y.YEvent<Y.AbstractType<any>>[], tr: Y.Transaction) => void;

  constructor(options: BindingOptions) {
    this.ydoc = options.ydoc;
    this.fragment = options.ydoc.getXmlFragment(options.field ?? "content");
    this.#host = options.host;
    this.undoManager = new Y.UndoManager(this.fragment, {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: options.captureTimeout ?? 500,
    });
    this.#observer = (events, tr) => {
      // Everything that changed (and its ancestors) is stale; local pushes re-seed what they verified afterwards.
      for (const e of events) this.#cache.invalidate(e.target);
      if (tr.origin === this.origin) return;
      this.#applyRemote();
    };
    this.fragment.observeDeep(this.#observer);
  }

  /**
   * Initial sync: Yjs content wins if present; otherwise the editor's current content seeds Yjs (pass
   * `seed: false` to wait for a remote peer instead). Until this is called, local changes are not pushed, so
   * call it after your provider has synced if several peers might each seed content.
   */
  init(options: { seed?: boolean } = {}): void {
    this.#ready = true;
    if (this.fragment.length > 0) this.#applyRemote(true);
    else if (options.seed !== false) this.pmChanged();
  }

  destroy(): void {
    this.fragment.unobserveDeep(this.#observer);
    this.undoManager.destroy();
  }

  /** Call after every editor state update. Pushes document changes to Yjs and remembers the selection. */
  pmChanged(): void {
    if (this.#applyingRemote || !this.#ready) return;
    const state = this.#host.state;
    if (state.doc !== this.#lastDoc) {
      const previous = this.#lastDoc;
      this.#lastDoc = state.doc;
      const seeds: Seeds = { els: [], texts: [] };
      this.ydoc.transact(() => {
        if (previous) syncChildren(this.fragment, previous, state.doc, seeds);
        else updateYFragment(this.fragment, state.doc);
      }, this.origin);
      this.#cache.apply(seeds);
    }
    this.#storeSelection(state);
  }

  undo(): boolean {
    return this.#history(() => this.undoManager.undo());
  }
  redo(): boolean {
    return this.#history(() => this.undoManager.redo());
  }
  #history(run: () => unknown): boolean {
    const had = this.undoManager.undoStack.length + this.undoManager.redoStack.length;
    if (!had) return false;
    return run() != null;
  }
  canUndo(): boolean {
    return this.undoManager.canUndo();
  }
  canRedo(): boolean {
    return this.undoManager.canRedo();
  }

  /** Stable position that survives concurrent edits. `assoc` < 0 sticks to the left character. */
  toRelativePosition(pos: number, assoc = 0): Y.RelativePosition {
    const { type, index } = pmToYPos(this.#host.state.doc, this.fragment, pos);
    return Y.createRelativePositionFromTypeIndex(type, index, assoc);
  }

  /** Current document position for a relative position, or null if its anchor no longer exists. */
  fromRelativePosition(rel: Y.RelativePosition): number | null {
    const abs = Y.createAbsolutePositionFromRelativePosition(rel, this.ydoc);
    if (!abs || !this.#sameField(abs.type)) return null;
    return yToPmPos(abs.type, abs.index, this.#host.state.schema, this.#cache);
  }

  #sameField(type: Y.AbstractType<any>): boolean {
    let t: Y.AbstractType<any> | null = type;
    while (t) {
      if (t === this.fragment) return true;
      t = t.parent as Y.AbstractType<any> | null;
    }
    return false;
  }

  #storeSelection(state: EditorState): void {
    try {
      const max = state.doc.content.size;
      const { anchor, head } = state.selection;
      if (anchor > max || head > max) return;
      this.#relSel = {
        anchor: this.toRelativePosition(anchor),
        head: this.toRelativePosition(head),
      };
    } catch {
      this.#relSel = null;
    }
  }

  #applyRemote(initial = false): void {
    if (!this.#ready) return;
    const state = this.#host.state;
    const next = yToDoc(this.fragment, state.schema, this.#cache);
    if (next.eq(state.doc)) {
      this.#lastDoc = state.doc;
      return;
    }
    const tr = state.tr;
    const start = state.doc.content.findDiffStart(next.content);
    const ends = state.doc.content.findDiffEnd(next.content);
    let replaced = false;
    if (start != null && ends) {
      let { a: endA, b: endB } = ends;
      const overlap = start - Math.min(endA, endB);
      if (overlap > 0) {
        endA += overlap;
        endB += overlap;
      }
      try {
        tr.replace(start, endA, next.slice(start, endB));
        replaced = tr.doc.eq(next);
      } catch {
        replaced = false;
      }
    }
    if (!replaced) {
      tr.replaceWith(0, state.doc.content.size, next.content);
    }
    tr.setMeta(Y_SYNC_META, true).setMeta("addToHistory", false);
    if (!initial && this.#relSel) {
      const a = this.fromRelativePositionIn(tr.doc, this.#relSel.anchor);
      const h = this.fromRelativePositionIn(tr.doc, this.#relSel.head);
      if (a != null && h != null) {
        const max = tr.doc.content.size;
        tr.setSelection(TextSelection.between(tr.doc.resolve(Math.min(a, max)), tr.doc.resolve(Math.min(h, max))));
      }
    }
    this.#applyingRemote = true;
    try {
      this.#lastDoc = tr.doc;
      this.#host.dispatch(tr);
    } finally {
      this.#applyingRemote = false;
    }
    this.#lastDoc = this.#host.state.doc;
    this.#storeSelection(this.#host.state);
  }

  /** Like fromRelativePosition but resolved against a not-yet-dispatched document. */
  private fromRelativePositionIn(doc: EditorState["doc"], rel: Y.RelativePosition): number | null {
    const abs = Y.createAbsolutePositionFromRelativePosition(rel, this.ydoc);
    if (!abs || !this.#sameField(abs.type)) return null;
    return yToPmPos(abs.type, abs.index, doc.type.schema, this.#cache);
  }
}
