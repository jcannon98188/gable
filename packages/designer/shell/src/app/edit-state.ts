// Edit state: the selected element's editable model, the palette, and the undo history. Every edit is a request to the backend,
// which patches the source file; the project's Vite then hot-updates the canvas and this state reselects the same element.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import { ToastService } from "../components/ui/toast.js";
import type { DescribeResult, EditOp, EditResult, HistoryInfo, NodeModel, PaletteEntry, TargetRef } from "../../../src/server/edit/types.js";
import { DesignerState } from "./designer-state.js";

export class EditState {
  static scope = "root";
  state = inject(DesignerState);
  toast = inject(ToastService);
  /** Set by the shell: where a toast's Open code goes (the drawer's Code tab). */
  onShowPatch: () => void = () => undefined;

  model = signal<DescribeResult | null>(null);
  palette = signal<PaletteEntry[]>([]);
  history = signal<HistoryInfo>({ undo: [], redo: [], external: [], last: null });
  /** The last outcome, shown under the panel: an edit's label, or why it was refused. */
  notice = signal<{ ok: boolean; text: string } | null>(null);
  busy = signal(false);

  node = computed<NodeModel | null>(() => {
    const m = this.model();
    return m && m.ok ? m : null;
  });
  refused = computed(() => {
    const m = this.model();
    return m && !m.ok ? m.error : null;
  });
  /** The signals the binding picker lists: the ones of the component that owns the template. */
  signals = computed(() => (this.state.component()?.signals ?? []).map((s) => ({ name: s.name, writable: s.writable, kind: s.kind })));
  readable = computed(() => this.signals().map((s) => s.name));
  writable = computed(() => this.signals().filter((s) => s.writable).map((s) => s.name));
  canUndo = computed(() => this.history().undo.length > 0);
  canRedo = computed(() => this.history().redo.length > 0);
  external = computed(() => this.history().external);

  target(): TargetRef | null {
    const n = this.state.picked()?.node;
    if (!n || !n.exact) return null;
    return { raw: n.raw, start: n.start, tag: n.tag, modulePath: n.component?.source?.path };
  }

  describeOnPick = effect(() => {
    const picked = this.state.picked();
    untracked(() => void this.#describe(picked ? this.target() : null));
  });

  booted = this.#boot();

  async #boot(): Promise<void> {
    await this.state.booted;
    const c = this.state.config;
    if (!c) return;
    try {
      this.palette.set(await this.state.api<PaletteEntry[]>("/api/edit/palette"));
      this.history.set(await this.state.api<HistoryInfo>("/api/edit/history"));
      const events = new EventSource(`${c.backend}/api/events?token=${c.token}`);
      events.addEventListener("history", (e) => this.history.set(JSON.parse((e as MessageEvent).data) as HistoryInfo));
      events.addEventListener("files", () => void this.#refreshPalette());
    } catch (e) {
      this.notice.set({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  async #refreshPalette(): Promise<void> {
    this.palette.set(await this.state.api<PaletteEntry[]>("/api/edit/palette").catch(() => this.palette()));
  }

  async #describe(target: TargetRef | null): Promise<void> {
    if (!target) return void this.model.set(null);
    const result = await this.state.api<DescribeResult>("/api/edit/describe", target).catch((e: unknown) => ({ ok: false as const, code: "io" as const, error: String(e) }));
    // The selection may have moved on while the request ran.
    if (this.target()?.start === target.start && this.target()?.raw === target.raw) this.model.set(result);
  }

  /** Runs an edit of the selected element. Resolves to the outcome, or null when nothing was sent. */
  async edit(build: (target: TargetRef) => EditOp): Promise<EditResult | null> {
    const target = this.target();
    if (!target || this.busy()) return null;
    return this.#run(() => this.state.api<EditResult>("/api/edit/apply", build(target)));
  }

  /** Runs an edit that is not about the selected element (adding a Scenario). */
  async apply(op: EditOp): Promise<EditResult | null> {
    if (this.busy()) return null;
    return this.#run(() => this.state.api<EditResult>("/api/edit/apply", op));
  }

  async undo(): Promise<void> {
    await this.#run(() => this.state.api<EditResult>("/api/edit/undo", {}));
  }

  async redo(): Promise<void> {
    await this.#run(() => this.state.api<EditResult>("/api/edit/redo", {}));
  }

  async #run(call: () => Promise<EditResult>): Promise<EditResult | null> {
    this.busy.set(true);
    try {
      const r = await call();
      this.notice.set(r.ok ? { ok: true, text: r.label + (r.relocated ? " (found its place after the file changed)" : "") } : { ok: false, text: r.error });
      this.#announce(r);
      if (r.ok && r.select) await this.#reselect(r.select);
      else if (r.ok) this.model.set(null);
      return r;
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      this.notice.set({ ok: false, text });
      this.toast.error("Couldn't apply this edit", { description: text, action: { label: "Open code", onClick: () => this.onShowPatch() } });
      return { ok: false, code: "io", error: text };
    } finally {
      this.busy.set(false);
    }
  }

  /** Every edit says what it did and where, with the way back. */
  #announce(r: EditResult): void {
    if (!r.ok) return void this.toast.error("Couldn't apply this edit", { description: r.error, action: { label: "Open code", onClick: () => this.onShowPatch() } });
    if (r.noop) return;
    this.toast.show(r.label, {
      description: [r.file, ...(r.created ?? [])].map((f) => this.state.relative(f)).join(", ") + (r.relocated ? " (found its place after the file changed)" : "") + (r.note ? `. ${r.note}` : ""),
      action: { label: "Undo", onClick: () => void this.undo() },
    });
  }

  /** After HMR re-renders the template, select the same element again (the runtime ids went stale with the old template). */
  async #reselect(at: { raw: string; offset: number }): Promise<void> {
    // A call to a frame that reloaded meanwhile (an edit that adds a module can do that) is never answered: bound each one, or
    // the edit would stay busy for good.
    const within = <T>(p: Promise<T>): Promise<T | null> => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 1000))]);
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const node = await within(this.state.preview.call("nodeAt", { raw: at.raw, offset: at.offset }));
      if (node) {
        await within(this.state.preview.call("selectNode", { id: node.id }));
        return;
      }
    }
    this.model.set(null);
  }

  /** Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) outside text fields. */
  onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) void this.undo();
    else if (k === "y" || (k === "z" && e.shiftKey)) void this.redo();
    else return;
    e.preventDefault();
  }
}
