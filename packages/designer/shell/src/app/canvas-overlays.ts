// What the shell draws on the canvas beyond the agent's own selection: the read-only hatch on an element the panels cannot edit,
// the selection mirrored into the other frames while Sync is on, and drag-insert from the Insert tab (the agent finds the
// element under the pointer and draws the insertion line; the drop is an ordinary insert edit relative to that element).
import { computed, effect, inject, signal, untracked } from "@gable/core";
import type { DesignNode } from "@gable/core/designer";
import type { DropWhere } from "../../../src/protocol.js";
import type { PaletteEntry } from "../../../src/server/edit/types.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import type { Frame } from "./frames.js";
import { TailwindState } from "./tailwind-state.js";

/** `li.todo`: the tag and the first static class of the selected element, for chips. */
export function elementLabel(tag: string, classAttr: string | null): string {
  const first = classAttr && !classAttr.includes("{{") ? classAttr.split(/\s+/).find(Boolean) : undefined;
  return first ? `${tag}.${first}` : tag;
}

export class CanvasOverlays {
  static scope = "root";
  state = inject(DesignerState);
  edit = inject(EditState);
  tw = inject(TailwindState);

  label = computed(() => {
    const picked = this.state.picked();
    if (!picked) return "";
    const cls = this.edit.node()?.attrs.find((a) => a.name === "class");
    return elementLabel(picked.node.tag, cls ? cls.value : null);
  });

  /** Why the selected element is shown read-only on the canvas, as its lock chip says it; null when it can be edited. */
  readOnly = computed(() => {
    if (!this.state.picked()) return null;
    // Its template no longer matches the file because the file does not compile (or the page refused it): the canvas is stale.
    if (this.edit.refused()) return `${this.label()} · ${this.state.staleFile(this.state.picked()?.node.component?.source?.path) ? "stale" : "read-only"}`;
    if (this.tw.enabled() && this.edit.node() && !this.tw.writable()) return `${this.label()} · dynamic`;
    return null;
  });

  #hatched: Frame | null = null;
  hatch = effect(() => {
    const label = this.readOnly();
    const id = this.state.picked()?.node.id ?? null;
    const frame = this.state.frames.selected();
    const ready = frame.connection() === "ready";
    untracked(() => {
      if (this.#hatched && this.#hatched !== frame) void this.#hatched.client.call("setReadOnly", { id: null, label: "" }).catch(() => undefined);
      this.#hatched = frame;
      if (ready) void frame.client.call("setReadOnly", { id: label ? id : null, label: label ?? "" }).catch(() => undefined);
    });
  });

  /** While Sync is on: in how many frames the selected element is shown (the selected frame's own selection included). */
  mirrored = signal<{ count: number; total: number } | null>(null);
  syncText = computed(() => {
    const m = this.mirrored();
    return m ? `${this.label()} selected in ${m.count} of ${m.total} frames` : "";
  });
  #mirrorSeq = 0;
  mirror = effect(() => {
    const on = this.state.frames.sync();
    const node = this.state.picked()?.node ?? null;
    const selected = this.state.frames.selected();
    const frames = this.state.frames.frames();
    for (const f of frames) f.connection();
    this.state.hmr();
    untracked(() => void this.#mirror(on && node?.exact ? node : null, selected, frames));
  });

  async #mirror(node: DesignNode | null, selected: Frame, frames: readonly Frame[]): Promise<void> {
    const seq = ++this.#mirrorSeq;
    const at = node ? { raw: node.raw, start: node.start } : null;
    const shown = await Promise.all(
      frames.map(async (f) => {
        if (f.connection() !== "ready") return false;
        const r = await f.client.call("mirror", f === selected ? null : at).catch(() => null);
        return f === selected ? !!at : (r?.elements ?? 0) > 0;
      }),
    );
    if (seq !== this.#mirrorSeq) return;
    this.mirrored.set(at && frames.length > 1 ? { count: shown.filter(Boolean).length, total: frames.length } : null);
  }
}

interface Drag {
  entry: PaletteEntry;
  pointerId: number;
  x0: number;
  y0: number;
  active: boolean;
  frame: Frame | null;
  hit: { node: DesignNode; where: DropWhere } | null;
}

/** Drag-insert: press on an Insert entry, move onto a frame, release. Escape (or releasing off the frames) cancels. */
export class InsertDrag {
  static scope = "root";
  state = inject(DesignerState);
  edit = inject(EditState);

  /** The chip that follows the pointer while dragging. */
  ghost = signal<{ left: string; top: string; name: string; group: string; where: string } | null>(null);
  #drag: Drag | null = null;
  #clickSwallowed = false;
  #pending: { frame: Frame; x: number; y: number } | null = null;
  #asking = false;

  start(e: PointerEvent, entry: PaletteEntry | undefined): void {
    if (!entry || e.button !== 0) return;
    // The frames are iframes, which would take the pointer events once it is over them: the shell listens on the window and
    // the frames ignore the pointer while a drag is on (`insert-dragging` in shell.css), so nothing depends on capture.
    this.#drag = { entry, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, frame: null, hit: null };
    document.documentElement.classList.add("insert-dragging");
    const move = (ev: PointerEvent) => this.#move(ev);
    const up = (ev: PointerEvent) => (cleanup(), void this.#drop(ev));
    const cancel = () => (cleanup(), this.cancel());
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && this.#drag?.active) (ev.preventDefault(), cleanup(), this.cancel());
    };
    const cleanup = () => {
      document.documentElement.classList.remove("insert-dragging");
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", cancel, true);
      removeEventListener("keydown", key, true);
    };
    addEventListener("pointermove", move, true);
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", cancel, true);
    addEventListener("keydown", key, true);
  }

  /** A click that ends a drag is not an insert at the selection. */
  takeClick(): boolean {
    const swallowed = this.#clickSwallowed;
    this.#clickSwallowed = false;
    return swallowed;
  }

  cancel(): void {
    const d = this.#drag;
    this.#drag = null;
    this.ghost.set(null);
    if (d?.active) this.#clickSwallowed = true;
    if (d?.frame) void d.frame.client.call("dropTarget", null).catch(() => undefined);
  }

  #move(e: PointerEvent): void {
    const d = this.#drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
    d.active = true;
    const over = this.#frameAt(e.clientX, e.clientY);
    if (d.frame && d.frame !== over?.frame) {
      void d.frame.client.call("dropTarget", null).catch(() => undefined);
      d.hit = null;
    }
    d.frame = over?.frame ?? null;
    this.ghost.set({ left: `${e.clientX}px`, top: `${e.clientY}px`, name: d.entry.name, group: d.entry.group, where: d.frame ? this.#whereText(d.hit) : "Drop onto a frame" });
    if (over) this.#ask(over.frame, over.x, over.y);
  }

  /** One request in flight at a time; the newest pointer position wins. */
  #ask(frame: Frame, x: number, y: number): void {
    this.#pending = { frame, x, y };
    if (this.#asking) return;
    this.#asking = true;
    void (async () => {
      while (this.#pending) {
        const p = this.#pending;
        this.#pending = null;
        const hit = await p.frame.client.call("dropTarget", { x: p.x, y: p.y }).catch(() => null);
        const d = this.#drag;
        if (d && d.frame === p.frame) {
          d.hit = hit;
          const g = this.ghost();
          if (g) this.ghost.set({ ...g, where: this.#whereText(hit) });
        }
      }
      this.#asking = false;
    })();
  }

  #whereText(hit: Drag["hit"]): string {
    if (!hit) return "No element here";
    return `${hit.where === "last" ? "Inside" : hit.where === "before" ? "Before" : "After"} <${hit.node.tag}>`;
  }

  /** The frame under a point of the shell, and the point in that frame's CSS pixels (frames are scaled as a whole). */
  #frameAt(x: number, y: number): { frame: Frame; x: number; y: number } | null {
    const scale = this.state.frames.scale();
    for (const el of document.querySelectorAll<HTMLElement>(".frame[data-frame-id]")) {
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const frame = this.state.frames.frames().find((f) => f.id === el.dataset.frameId);
      if (frame && frame.connection() === "ready") return { frame, x: (x - r.left) / scale, y: (y - r.top) / scale };
    }
    return null;
  }

  async #drop(e: PointerEvent): Promise<void> {
    const d = this.#drag;
    if (!d?.active) return void (this.#drag = null);
    const over = this.#frameAt(e.clientX, e.clientY);
    // the last answer may be for an older position: ask once more where the pointer was released
    const hit = over && over.frame === d.frame ? await over.frame.client.call("dropTarget", { x: over.x, y: over.y }).catch(() => d.hit) : null;
    this.cancel();
    const target = EditState.targetOf(hit?.node ?? null);
    if (!hit || !target) {
      this.edit.notice.set({ ok: false, text: hit ? "That element's template cannot be mapped to its file, so nothing was inserted." : `Drop ${d.entry.name} onto an element of a frame to insert it there.` });
      return;
    }
    if (over && over.frame !== this.state.frames.selected()) this.state.selectFrame(over.frame.id);
    await this.edit.editAt(target, (t) => ({ op: "insert", target: t, where: hit.where, snippet: d.entry.snippet, component: d.entry.component }));
  }
}
