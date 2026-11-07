// The State timeline (TASK-56.18): the selected frame's recorded state history, and travel through it. The devtools hook
// records the app's writes to its state signals (steps, bounded; `@gable/core` signal-history.ts) once the Preview agent turns
// recording on; this service fetches the steps when a new one is recorded and asks the frame to travel to one. Replay travels
// forward one step at a time. Nothing here is simulated: an empty history says so.
import { effect, inject, signal, untracked } from "@gable/core";
import type { HistoryInfo, TravelResult } from "@gable/core/devtools";
import { DesignerState } from "./designer-state.js";

export class SignalTimeline {
  static scope = "root";
  state = inject(DesignerState);

  info = signal<HistoryInfo | null>(null);
  /** Why the last travel did not happen, or what it left out. */
  note = signal<{ kind: "err" | "warn"; text: string } | null>(null);
  replaying = signal(false);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #replay = 0;
  /** A step was recorded or the frame (re)connected: refetch, at most every 150ms. */
  watch = effect(() => {
    this.state.historySeq();
    const ready = this.state.connection() === "ready";
    untracked(() => {
      if (!ready) return void (this.info.set(null), this.stopReplay());
      this.#timer ??= setTimeout(() => {
        this.#timer = undefined;
        void this.refresh();
      }, 150);
    });
  });

  async refresh(): Promise<HistoryInfo | null> {
    const info = await this.state.preview.call("history", undefined).catch(() => null);
    this.info.set(info);
    return info;
  }

  /** Puts the frame's app back to its state just after step `seq` (one before the first: the state before it). */
  async travel(seq: number): Promise<TravelResult> {
    const r = await this.state.preview.call("travel", { seq }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    this.note.set(r.ok ? SignalTimeline.travelNote(r) : { kind: "err", text: r.error });
    await this.refresh();
    return r;
  }

  /** What a travel left out, or null when it restored everything. */
  static travelNote(r: Extract<TravelResult, { ok: true }>): { kind: "warn"; text: string } | null {
    const parts: string[] = [];
    if (r.gone) parts.push(`${r.gone} signal${r.gone === 1 ? "" : "s"} of that state no longer exist (a destroyed component's, or rebuilt by a hot update) and were left out.`);
    if (r.incomplete) parts.push("A step held more writes than are kept, so the state is only partly restored.");
    return parts.length ? { kind: "warn", text: parts.join(" ") } : null;
  }

  /** Back to the newest recorded state. */
  async live(): Promise<TravelResult | null> {
    const last = this.info()?.steps.at(-1);
    return last ? this.travel(last.seq) : null;
  }

  async record(on: boolean): Promise<void> {
    await this.state.preview.call("recordHistory", { on });
    await this.refresh();
  }

  async clear(): Promise<void> {
    this.stopReplay();
    this.note.set(null);
    await this.state.preview.call("clearHistory", undefined);
    await this.refresh();
  }

  /**
   * Replays the history: from the state before the first step (or, after a travel back, from there) to the newest step, one
   * step every `ms`, so the frame shows each state in turn. Stops at the end, on `stopReplay`, or when a travel fails.
   */
  async replay(ms = 500): Promise<void> {
    this.stopReplay();
    const info = await this.refresh();
    if (!info?.steps.length) return;
    const run = ++this.#replay;
    this.replaying.set(true);
    const seqs = info.steps.map((s) => s.seq);
    const from = info.cursor === null || info.cursor === seqs.at(-1) ? seqs[0]! - 1 : info.cursor;
    try {
      for (const seq of [from, ...seqs.filter((s) => s > from)]) {
        if (run !== this.#replay) return;
        const r = await this.travel(seq);
        if (!r.ok) return;
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
    } finally {
      if (run === this.#replay) this.replaying.set(false);
    }
  }

  stopReplay(): void {
    this.#replay++;
    this.replaying.set(false);
  }
}
