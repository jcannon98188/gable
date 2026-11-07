// State history for the devtools (dev only): what the app wrote to its state signals, step by step, so a tool can go back to
// any recorded state and forward again. The runtime tells the sink a state node is about to be written (only while recording,
// see `willWrite` in signals.ts); the writes of one task (a click, a timer tick, a response) and of the microtasks it queued
// (the effects answering it) are one step, committed on the next task with each signal's value before and after. Values are kept by reference, not copied: an
// object the app mutates in place shows its current contents. The buffer is bounded: the oldest steps are dropped first.
import type { Preview } from "./devtools.js";
import { peekNode } from "./signals.js";

/** At most this many steps are kept... */
export const MAX_HISTORY_STEPS = 300;
/** ...and this many writes across them. */
export const MAX_HISTORY_WRITES = 2000;
/** Writes one step keeps; the rest are counted in its `more` (going back across it is then incomplete). */
export const MAX_STEP_WRITES = 500;

/** One signal write inside a {@link HistoryStep}: which signal and its value before and after. */
export interface HistoryWrite {
  /** The signal's devtools id. */
  id: string;
  name: string;
  /** The component that owns it, or null (a service's, a store's). */
  owner: string | null;
  before: Preview;
  after: Preview;
}

/** One recorded batch of signal writes, the unit the time-travel history moves between. */
export interface HistoryStep {
  seq: number;
  /** `performance.now()` when the step was committed. */
  at: number;
  /** `app`: the app's own code. `designer`: a tool wrote it through `setSignal`. */
  source: "app" | "designer";
  writes: HistoryWrite[];
  /** Writes left out of this step (past MAX_STEP_WRITES). */
  more: number;
}

/** A snapshot of the signal history: its steps, where time travel stands and the recording bounds. */
export interface HistoryInfo {
  recording: boolean;
  steps: HistoryStep[];
  /** The step whose state the app was last put back to by `travel`; null when it runs live (no travel since the last step). */
  cursor: number | null;
  /** Steps dropped from the start to stay within the bounds. */
  dropped: number;
  maxSteps: number;
  maxWrites: number;
}

/**
 * The outcome of moving the app to a recorded step: `ok` with how many signals were restored (and whether the restore was partial), or an `error` message.
 */
export type TravelResult =
  | {
      ok: true;
      seq: number;
      /** Signals written to reach that state. */
      applied: number;
      /** Signals of that state that no longer exist (a destroyed component's, a hot update's), so were left out. */
      gone: number;
      /** A step on the way left writes out (MAX_STEP_WRITES): the state is only partly restored. */
      incomplete: boolean;
    }
  | { ok: false; error: string };

/** What the history asks of the devtools layer about a state node. */
export interface HistoryHost {
  describe(node: object): { id: string; name: string; owner: string | null; live: boolean; set(value: unknown): void } | null;
  preview(value: unknown): Preview;
  /** A step was recorded, or the history was cleared (`seq` 0). */
  changed(seq: number): void;
  now(): number;
}

interface Write {
  ref: WeakRef<object>;
  id: string;
  name: string;
  owner: string | null;
  before: unknown;
  after: unknown;
  shown: { before: Preview; after: Preview };
}

interface Step {
  seq: number;
  at: number;
  source: "app" | "designer";
  writes: Write[];
  more: number;
}

export class SignalHistory {
  recording = false;
  #steps: Step[] = [];
  #writeCount = 0;
  #seq = 0;
  #dropped = 0;
  #cursor: number | null = null;
  /** Nodes written in this task, with their value before the first write. */
  #pending = new Map<object, unknown>();
  #queued = false;
  /** True while travel writes, and until the app's effects have answered them: those writes are not the app's own steps. */
  #muted = false;

  constructor(private host: HistoryHost) {}

  record(on: boolean): void {
    this.recording = on;
    if (!on) this.#pending.clear();
  }

  /** A state node is about to be written by the app. */
  willWrite(node: object): void {
    if (this.#muted || !this.recording) return;
    if (!this.#pending.has(node)) this.#pending.set(node, peekNode(node));
    if (this.#queued) return;
    this.#queued = true;
    setTimeout(() => this.#commit(), 0);
  }

  /** A tool writes a signal (`setSignal`): its own step, after the app's writes of this task so far. */
  designerWrite(node: object, write: () => void): void {
    if (!this.recording) return write();
    this.#commit();
    const before = peekNode(node);
    this.#muted = true;
    try {
      write();
    } finally {
      this.#muted = false;
    }
    const after = peekNode(node);
    const d = this.host.describe(node);
    if (d && !Object.is(before, after)) this.#push("designer", [this.#write(node, d, before, after)], 0);
  }

  info(): HistoryInfo {
    return {
      recording: this.recording,
      steps: this.#steps.map((s) => ({ seq: s.seq, at: s.at, source: s.source, more: s.more, writes: s.writes.map((w) => ({ id: w.id, name: w.name, owner: w.owner, ...w.shown })) })),
      cursor: this.#cursor,
      dropped: this.#dropped,
      maxSteps: MAX_HISTORY_STEPS,
      maxWrites: MAX_HISTORY_WRITES,
    };
  }

  /**
   * Puts the app back to its state just after step `seq` (`seq` one before the first step: the state before it). Each signal
   * the history touched gets its value at that point: the `after` of the last step up to `seq` that wrote it, else the
   * `before` of the first later step. The app's effects then run as for any write; the writes they make in answer are not
   * recorded as steps.
   */
  travel(seq: number): TravelResult {
    this.#commit();
    const steps = this.#steps;
    if (!steps.length) return { ok: false, error: "No state history is recorded." };
    const first = steps[0]!.seq - 1;
    const last = steps[steps.length - 1]!.seq;
    if (!Number.isInteger(seq) || seq < first || seq > last) return { ok: false, error: `No step ${seq}: the history holds steps ${first + 1} to ${last} (${first} is the state before them).` };
    const upTo = new Map<string, { w: Write; value: unknown }>();
    const later = new Map<string, { w: Write; value: unknown }>();
    let incomplete = false;
    for (const s of steps) {
      if (s.more) incomplete = true;
      for (const w of s.writes) {
        if (s.seq <= seq) upTo.set(w.id, { w, value: w.after });
        else if (!upTo.has(w.id) && !later.has(w.id)) later.set(w.id, { w, value: w.before });
      }
    }
    let applied = 0;
    let gone = 0;
    this.#muted = true;
    try {
      for (const { w, value } of [...upTo.values(), ...later.values()]) {
        const node = w.ref.deref();
        const d = node && this.host.describe(node);
        if (!node || !d || !d.live) {
          gone++;
          continue;
        }
        if (Object.is(peekNode(node), value)) continue;
        d.set(value);
        applied++;
      }
    } finally {
      // The effects answering these writes run in microtasks before any task: unmute after them.
      setTimeout(() => (this.#muted = false), 0);
    }
    this.#cursor = seq === last ? null : seq;
    return { ok: true, seq, applied, gone, incomplete };
  }

  clear(): void {
    this.#steps = [];
    this.#writeCount = 0;
    this.#pending.clear();
    this.#cursor = null;
    this.#dropped = 0;
    this.host.changed(0);
  }

  #commit(): void {
    this.#queued = false;
    if (!this.#pending.size) return;
    const pending = this.#pending;
    this.#pending = new Map();
    const writes: Write[] = [];
    let more = 0;
    for (const [node, before] of pending) {
      const after = peekNode(node);
      if (Object.is(before, after)) continue;
      const d = this.host.describe(node);
      if (!d) continue;
      if (writes.length >= MAX_STEP_WRITES) more++;
      else writes.push(this.#write(node, d, before, after));
    }
    if (writes.length) this.#push("app", writes, more);
  }

  #write(node: object, d: { id: string; name: string; owner: string | null }, before: unknown, after: unknown): Write {
    // Shown as they were when written (an object mutated later still shows what it held then).
    return { ref: new WeakRef(node), id: d.id, name: d.name, owner: d.owner, before, after, shown: { before: this.host.preview(before), after: this.host.preview(after) } };
  }

  #push(source: Step["source"], writes: Write[], more: number): void {
    this.#steps.push({ seq: ++this.#seq, at: this.host.now(), source, writes, more });
    this.#writeCount += writes.length;
    while (this.#steps.length > MAX_HISTORY_STEPS || (this.#writeCount > MAX_HISTORY_WRITES && this.#steps.length > 1)) {
      this.#writeCount -= this.#steps.shift()!.writes.length;
      this.#dropped++;
    }
    this.#cursor = null;
    this.host.changed(this.#seq);
  }
}
