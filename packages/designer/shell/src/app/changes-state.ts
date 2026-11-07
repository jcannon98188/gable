// The project's uncommitted changes, for the drawer's Changes tab (TASK-56.25). Git runs in the backend (src/server/git.ts);
// this reads its status and the selected file's diff, commits the chosen files and reverts a file or a hunk. It keeps no
// copy of anything: the working tree is the truth (ADR 0001), and every answer is re-read after a write. Refreshes ride the
// event stream the shell already has (`files` and `git` events bump `DesignerState.changesTick`); the count in the tab's badge follows, the selected diff is read only while the tab is shown.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import { suggestMessage, type ChangedFile, type FileDiff, type GitError, type GitStatus, type GitStatusResult, type RevertResult, type CommitResult } from "../../../src/git.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class ChangesState {
  static scope = "root";
  state = inject(DesignerState);
  chrome = inject(ChromeState);

  /** The latest answer: the status, or why there is none (no git, not a repository). */
  result = signal<GitStatusResult | null>(null);
  status = computed<GitStatus | null>(() => {
    const r = this.result();
    return r && r.ok ? r : null;
  });
  files = computed<ChangedFile[]>(() => this.status()?.files ?? []);
  unavailable = computed(() => {
    const r = this.result();
    return r && !r.ok ? r.error : null;
  });
  error = signal<string | null>(null);
  /** The path whose diff is shown, and that diff (null while it loads). */
  selected = signal<string | null>(null);
  diff = signal<FileDiff | null>(null);
  diffError = signal<string | null>(null);
  /** Files ticked for the next commit. */
  chosen = signal<ReadonlySet<string>>(new Set());
  message = signal("");
  busy = signal(false);
  /** What the last action did, in words (a commit's id, a revert's name). */
  notice = signal<string | null>(null);
  /** The Changes tab is on screen: only then is a diff read. */
  visible = computed(() => this.chrome.drawerOpen() && this.chrome.drawerTab() === "changes");
  count = computed(() => this.files().length);
  canUndo = computed(() => (this.status()?.undo.length ?? 0) > 0);
  undoLabel = computed(() => this.status()?.undo[0] ?? "");

  #running = false;
  #again = false;

  watch = effect(() => {
    this.visible();
    this.state.changesTick();
    untracked(() => void this.refresh());
  });

  /** Reads the status (a second request while one runs is made once, after it) and keeps the diff in step. */
  async refresh(): Promise<void> {
    if (this.#running) return void (this.#again = true);
    this.#running = true;
    try {
      const r = await this.state.api<GitStatusResult>("/api/git/status");
      this.result.set(r);
      this.error.set(null);
      if (r.ok) {
        const paths = new Set(r.files.map((f) => f.path));
        // A file that is no longer changed drops out of the selection and the commit choice.
        const keep = [...this.chosen()].filter((p) => paths.has(p));
        if (keep.length !== this.chosen().size) this.chosen.set(new Set(keep));
        const sel = this.selected();
        if (sel && !paths.has(sel)) this.#clearDiff();
        else if (!sel && r.files[0] && this.visible()) this.select(r.files[0].path);
        else if (sel && this.visible()) void this.#loadDiff(sel);
      } else this.#clearDiff();
    } catch (e) {
      this.error.set(message(e));
    } finally {
      this.#running = false;
      if (this.#again) {
        this.#again = false;
        void this.refresh();
      }
    }
  }

  #clearDiff(): void {
    this.selected.set(null);
    this.diff.set(null);
    this.diffError.set(null);
  }

  select(path: string): void {
    this.selected.set(path);
    void this.#loadDiff(path);
  }

  async #loadDiff(path: string): Promise<void> {
    try {
      const d = await this.state.api<FileDiff | GitError>(`/api/git/diff?path=${encodeURIComponent(path)}`);
      if (this.selected() !== path) return;
      if (d.ok) (this.diff.set(d), this.diffError.set(null));
      else (this.diff.set(null), this.diffError.set(d.error));
    } catch (e) {
      if (this.selected() === path) this.diffError.set(message(e));
    }
  }

  /** Ticks or unticks a file (idempotent: a checkbox may report the same value twice). */
  choose(path: string, on: boolean): void {
    if (this.chosen().has(path) === on) return;
    const next = new Set(this.chosen());
    if (on) next.add(path);
    else next.delete(path);
    this.chosen.set(next);
    if (!this.message().trim() || this.message() === this.#suggested) this.#suggest();
  }

  setAll(on: boolean): void {
    this.chosen.set(on ? new Set(this.files().filter((f) => f.status !== "conflicted").map((f) => f.path)) : new Set());
    if (!this.message().trim() || this.message() === this.#suggested) this.#suggest();
  }

  #suggested = "";
  #suggest(): void {
    const files = this.files().filter((f) => this.chosen().has(f.path));
    this.#suggested = suggestMessage(files);
    this.message.set(this.#suggested);
  }

  async #act<T extends { ok: true }>(path: string, body: unknown): Promise<T | null> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.state.api<T | GitError>(path, body);
      if (!r.ok) {
        this.error.set((r as GitError).error);
        return null;
      }
      return r as T;
    } catch (e) {
      this.error.set(message(e));
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  async commit(): Promise<boolean> {
    const paths = [...this.chosen()];
    const r = await this.#act<CommitResult>("/api/git/commit", { paths, message: this.message() });
    if (!r) return false;
    this.notice.set(`Committed ${r.files.length} file${r.files.length === 1 ? "" : "s"} as ${r.sha}: ${r.subject}`);
    this.message.set("");
    this.#suggested = "";
    this.chosen.set(new Set());
    await this.refresh();
    return true;
  }

  async revertFile(path: string): Promise<boolean> {
    const r = await this.#act<RevertResult>("/api/git/revert", { path });
    if (!r) return false;
    this.notice.set(`${r.label}. Undo revert puts it back.`);
    await this.refresh();
    return true;
  }

  async revertHunk(path: string, index: number, header: string): Promise<boolean> {
    const r = await this.#act<RevertResult>("/api/git/revert", { path, hunk: index, header });
    if (!r) return false;
    this.notice.set(`${r.label}. Undo revert puts it back.`);
    await this.refresh();
    return true;
  }

  async undoRevert(): Promise<boolean> {
    const r = await this.#act<RevertResult>("/api/git/undo-revert", {});
    if (!r) return false;
    this.notice.set(`${r.label}.`);
    await this.refresh();
    return true;
  }
}
