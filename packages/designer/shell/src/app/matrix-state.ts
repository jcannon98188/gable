// The Scenario by breakpoint matrix for the Matrix tab and MCP (TASK-56.22). The backend renders each Scenario at each width in a
// headless browser, keeps the last run, and saves baselines; this service asks it over `/api/matrix` (a plain request, so
// no stream is added) and holds what the panel shows: the grid, the cell opened, the widths being asked for.
import { computed, inject, signal } from "@gable/core";
import {
  DEFAULT_BREAKPOINTS,
  cellId,
  type CellKey,
  type MatrixBreakpoint,
  type MatrixCell,
  type MatrixCommand,
  type MatrixCommandResult,
  type MatrixDetail,
  type MatrixRun,
} from "../../../src/matrix.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";

type Reply = ({ ok: true } & MatrixCommandResult) | { ok: false; error: string };

export const STATUS_LABEL: Record<MatrixCell["status"], string> = { new: "New", same: "Same", changed: "Changed", markup: "Markup", error: "Error" };

/** `"375, 768 tablet, 1024"` as breakpoints; names for the default widths, the width itself for the rest. */
export function parseWidths(text: string): MatrixBreakpoint[] {
  const out: MatrixBreakpoint[] = [];
  for (const part of text.split(/[,;\s]+/)) {
    const width = Math.round(Number(part.replace(/px$/i, "")));
    if (!Number.isFinite(width) || width < 200 || width > 4000 || out.some((b) => b.width === width)) continue;
    out.push({ name: DEFAULT_BREAKPOINTS.find((d) => d.width === width)?.name ?? String(width), width });
  }
  return out.sort((a, b) => a.width - b.width);
}

export function cellText(c: Pick<MatrixCell, "scene" | "width" | "status" | "changedRatio" | "error">): string {
  const at = `${c.scene} at ${c.width}px`;
  if (c.status === "changed") return `${at}: ${Math.round((c.changedRatio ?? 0) * 10000) / 100}% of pixels changed`;
  if (c.status === "markup") return `${at}: same pixels, different markup`;
  if (c.status === "error") return `${at}: did not render (${c.error ?? "unknown error"})`;
  if (c.status === "new") return `${at}: no baseline yet`;
  return `${at}: matches its baseline`;
}

export const widthsText = (list: readonly MatrixBreakpoint[]): string => list.map((b) => b.width).join(", ");

export class MatrixState {
  static scope = "root";
  state = inject(DesignerState);
  chrome = inject(ChromeState);

  run = signal<MatrixRun | null>(null);
  /** What is running: a render, or saving or forgetting baselines. */
  busy = signal<"run" | "save" | null>(null);
  error = signal<string | null>(null);
  /** The widths text field. */
  widths = signal(widthsText(DEFAULT_BREAKPOINTS));
  /** The cell opened for a closer look. */
  selected = signal<CellKey | null>(null);
  detail = signal<MatrixDetail | null>(null);
  /** Which picture of the opened cell is shown. */
  view = signal<"current" | "baseline" | "diff">("diff");
  #loaded = false;

  breakpoints = computed(() => parseWidths(this.widths()));
  /** The panel is on screen: it asks the backend for the last run once. */
  visible = computed(() => this.chrome.drawerOpen() && this.chrome.drawerTab() === "matrix");

  /** The tab's badge: cells that differ from their baseline (or failed). */
  attention = computed(() => {
    const c = this.run()?.counts;
    return c ? c.changed + c.markup + c.error : 0;
  });

  async #ask(command: MatrixCommand): Promise<MatrixCommandResult> {
    const r = await this.state.api<Reply>("/api/matrix", command);
    if (!r.ok) throw new Error(r.error);
    if (r.run) this.run.set(r.run);
    return r;
  }

  /** The backend's last run, once (a run made through MCP is there too). */
  async load(): Promise<void> {
    if (this.#loaded) return;
    this.#loaded = true;
    try {
      await this.#ask({ action: "report" });
    } catch {
      this.#loaded = false;
    }
  }

  /** The widths and the run are the panel's; MCP passes its own request. */
  async runMatrix(request: { breakpoints?: MatrixBreakpoint[]; files?: string[]; scenes?: string[]; height?: number } = {}): Promise<MatrixRun> {
    this.busy.set("run");
    this.error.set(null);
    try {
      const r = await this.#ask({ action: "run", request: { ...request, breakpoints: request.breakpoints ?? this.breakpoints() } });
      this.#reopen();
      return r.run!;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      this.busy.set(null);
    }
  }

  async save(which: "all" | "changed" | CellKey[]): Promise<number> {
    this.busy.set("save");
    this.error.set(null);
    try {
      const r = await this.#ask({ action: "baseline", which });
      this.#reopen();
      return r.saved ?? 0;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      this.busy.set(null);
    }
  }

  async forget(which: "all" | CellKey[]): Promise<number> {
    this.busy.set("save");
    this.error.set(null);
    try {
      const r = await this.#ask({ action: "forget", which });
      this.#reopen();
      return r.saved ?? 0;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      this.busy.set(null);
    }
  }

  /** Opens a cell: its pictures and markup diff load from the backend. */
  async open(cell: CellKey): Promise<MatrixDetail> {
    this.selected.set({ file: cell.file, scene: cell.scene, width: cell.width });
    this.error.set(null);
    const r = await this.#ask({ action: "open", cell });
    const detail = r.detail!;
    this.detail.set(detail);
    this.view.set(detail.diff && detail.cell.status !== "same" ? "diff" : "current");
    return detail;
  }

  close(): void {
    this.selected.set(null);
    this.detail.set(null);
  }

  #reopen(): void {
    const key = this.selected();
    if (!key) return;
    if (!this.run()?.cells.some((c) => cellId(c) === cellId(key))) return this.close();
    void this.open(key).catch(() => this.close());
  }

  /** Shows the cell on the canvas: its Scenario in component mode at its width, on the selected frame. */
  async showInFrame(cell: CellKey): Promise<void> {
    const s = this.state;
    const frames = s.frames;
    frames.update(frames.selectedId(), { width: cell.width });
    const t = s.target();
    if (t.kind !== "component" || t.scenes !== cell.file) s.showComponent(cell.file);
    // The frame loads the component host; the Scenario mounts once it answers.
    for (let i = 0; i < 100 && !(s.connection() === "ready" && s.sceneInfo()?.module === cell.file); i++) await new Promise((r) => setTimeout(r, 100));
    await s.chooseScene(cell.scene);
  }

  /** MCP: the same actions as the panel. */
  async command(c: MatrixCommand): Promise<MatrixCommandResult> {
    if (c.action === "run") return { run: await this.runMatrix(c.request ?? {}) };
    if (c.action === "baseline") return { saved: await this.save(c.which), run: this.run() };
    if (c.action === "forget") return { saved: await this.forget(c.which), run: this.run() };
    if (c.action === "open" || c.action === "detail") {
      const detail = c.action === "open" ? await this.open(c.cell) : (await this.#ask(c)).detail!;
      if (c.action === "open") this.chrome.showDrawer("matrix");
      return { run: this.run(), detail };
    }
    return this.#ask(c);
  }
}
