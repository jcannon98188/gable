// The selected frame's network, for the Network panel and MCP. The Preview agent sees the page's requests and applies the
// network condition (agent/network.ts); this asks it for its log when the page says it made requests, when the frame loads
// or another frame is selected, and keeps the whole-frame offline switch (CDP, in the backend) in step with the condition.
// Recording ends as a Scenario written into a scenes file through the edit API, like every other source edit (ADR 0001):
// nothing recorded is kept by the Designer itself.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import {
  NORMAL_CONDITION,
  OFFLINE_NEEDS_CDP,
  mocksFromRecording,
  sanitizeCondition,
  type MockReplyPatch,
  type NetworkCommand,
  type NetworkCommandResult,
  type NetworkCondition,
  type NetworkSnapshot,
  type RecordedResponse,
  type SceneMocks,
} from "../../../src/network.js";
import type { EditError } from "../../../src/server/edit/types.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";
import type { Frame } from "./frames.js";
import { PageState } from "./page-state.js";

/** A call to a frame that reloads meanwhile is never answered: each one is bounded. */
const CALL_TIMEOUT_MS = 10000;
const RELOAD_TIMEOUT_MS = 25000;

const bounded = <T>(p: Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> =>
  new Promise<T>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("The frame did not answer (it may have reloaded).")), ms);
    p.then((v) => (clearTimeout(timer), ok(v)), (e: unknown) => (clearTimeout(timer), fail(e)));
  });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type MocksResult = { ok: true; file: string; scenes: SceneMocks[] } | EditError;

/** The scene whose mocks answer the selected frame: the page's Scenario, or the scene mounted in component mode. */
export interface ActiveScene {
  file: string;
  scene: string;
}

export interface SaveRecording {
  file: string;
  name: string;
  description?: string;
  /** Page mode: the URL the Scenario opens the app at. */
  url?: string;
}

export class NetworkState {
  static scope = "root";
  state = inject(DesignerState);
  page = inject(PageState);
  edit = inject(EditState);

  snapshot = signal<NetworkSnapshot | null>(null);
  /** Why the last request to the agent failed. */
  error = signal<string | null>(null);
  /** Why whole-frame offline did not apply to a frame, by frame id. */
  frameNote = signal<Record<string, string | null>>({});
  cdp = computed(() => this.state.frames.capabilities().cdp);
  condition = computed<NetworkCondition>(() => this.snapshot()?.condition ?? NORMAL_CONDITION);
  recording = computed(() => this.snapshot()?.recording ?? { on: false, count: 0, persisted: true });
  /** Recording was started with a reload and waits for the frame to come back. */
  reloading = signal(false);

  active = computed<ActiveScene | null>(() => {
    const t = this.state.target();
    if (t.kind === "component") {
      const scene = this.state.scene() ?? this.state.sceneInfo()?.current ?? null;
      return scene ? { file: t.scenes, scene } : null;
    }
    const s = this.state.pageScenario();
    return s ? { file: s.scenes, scene: s.name } : null;
  });
  mocks = signal<MocksResult | null>(null);
  activeMocks = computed(() => {
    const a = this.active();
    const m = this.mocks();
    if (!a || !m || !m.ok || m.file !== a.file) return null;
    return m.scenes.find((s) => s.scene === a.scene) ?? null;
  });
  /** The last recording saved as a Scenario, for the panel's "Use it" and what was left out. */
  saved = signal<{ file: string; name: string; mocks: number; left: Array<{ method: string; url: string; why: string }> } | null>(null);

  /** Whole-frame offline as the backend last confirmed it, by frame id. */
  #offline = new Map<string, boolean>();
  #running = false;
  #again = false;

  watch = effect(() => {
    const ready = this.state.connection() === "ready";
    this.state.loads();
    this.state.frames.selectedId();
    const a = this.state.activity();
    untracked(() => {
      if (!ready) return;
      if (a && a.what !== "network") return;
      void this.refresh();
    });
  });

  watchMocks = effect(() => {
    const file = this.active()?.file ?? null;
    this.edit.history();
    this.state.hmr().length;
    untracked(() => void (file ? this.loadMocks(file) : this.mocks.set(null)));
  });

  #frame(id?: string): Frame {
    const fs = this.state.frames;
    const frame = id ? fs.frames().find((f) => f.id === id) : fs.selected();
    if (!frame) throw new Error(`No frame ${id}; the frames are ${fs.frames().map((f) => f.id).join(", ")}.`);
    return frame;
  }

  /** Asks the selected frame for its network (a second request while one runs is made once, after it). */
  async refresh(clear = false): Promise<NetworkSnapshot | null> {
    if (this.#running && !clear) {
      this.#again = true;
      return null;
    }
    this.#running = true;
    const frame = this.state.frames.selected();
    try {
      const snap = await bounded(frame.client.call("network", clear ? { clear } : {}));
      if (frame !== this.state.frames.selected()) return null;
      this.snapshot.set(snap);
      this.error.set(null);
      void this.#keepOffline(frame, snap.condition.frame);
      return snap;
    } catch (e) {
      if (frame === this.state.frames.selected()) this.error.set(message(e));
      return null;
    } finally {
      this.#running = false;
      if (this.#again) {
        this.#again = false;
        void this.refresh();
      }
    }
  }

  clear(): Promise<NetworkSnapshot | null> {
    return this.refresh(true);
  }

  /**
   * Sets the frame's condition. The agent keeps it (across reloads of the frame); whole-frame offline is also asked of the
   * backend over CDP, and is refused up front without CDP so the condition never claims what was not done. Going back
   * online lifts CDP first: the agent of a frame that reloaded while offline is not there to answer. Changes to a frame
   * apply one after another, each on the condition the previous one left (two fields edited quickly both stick).
   */
  setCondition(patch: Partial<NetworkCondition>, frame = this.state.frames.selected()): Promise<{ condition: NetworkCondition; note: string | null }> {
    const prev = this.#conditionQueue.get(frame.id);
    const run = (async () => {
      const before = prev ? await prev.then((r) => r.condition, () => null) : null;
      return this.#applyCondition(patch, frame, before);
    })();
    this.#conditionQueue.set(frame.id, run);
    const done = () => void (this.#conditionQueue.get(frame.id) === run && this.#conditionQueue.delete(frame.id));
    run.then(done, done);
    return run;
  }

  #conditionQueue = new Map<string, Promise<{ condition: NetworkCondition; note: string | null }>>();

  async #applyCondition(patch: Partial<NetworkCondition>, frame: Frame, before: NetworkCondition | null): Promise<{ condition: NetworkCondition; note: string | null }> {
    const base = before ?? (frame === this.state.frames.selected() ? this.condition() : ((await bounded(frame.client.call("network", {})).catch(() => null))?.condition ?? NORMAL_CONDITION));
    const next = sanitizeCondition({ ...base, ...patch });
    let note: string | null = null;
    if (next.frame && !this.cdp()) {
      next.frame = false;
      note = OFFLINE_NEEDS_CDP;
    }
    if (!next.frame) note = (await this.#setOffline(frame, false)) ?? note;
    let condition = next;
    try {
      condition = await bounded(frame.client.call("setNetworkCondition", next));
    } catch (e) {
      note = `The frame did not take the condition: ${message(e)}${this.#offline.get(frame.id) === false ? " (whole-frame offline is lifted; reload the frame)" : ""}`;
    }
    if (condition.frame) note = (await this.#setOffline(frame, true)) ?? note;
    this.frameNote.update((m) => ({ ...m, [frame.id]: note }));
    if (frame === this.state.frames.selected()) await this.refresh();
    return { condition, note };
  }

  /** The backend's whole-frame offline follows the condition the agent kept (after a reload, a restart of the shell). */
  async #keepOffline(frame: Frame, offline: boolean): Promise<void> {
    if ((this.#offline.get(frame.id) ?? false) === offline || !this.cdp()) return;
    const note = await this.#setOffline(frame, offline);
    if (note) this.frameNote.update((m) => ({ ...m, [frame.id]: note }));
  }

  /** Null when the backend applied it. */
  async #setOffline(frame: Frame, offline: boolean): Promise<string | null> {
    if (!this.cdp()) return offline ? OFFLINE_NEEDS_CDP : null;
    if ((this.#offline.get(frame.id) ?? false) === offline) return null;
    const r = await this.state.api<{ ok: boolean; error?: string }>("/api/network/offline", { nonce: frame.client.nonce, offline }).catch((e: unknown) => ({ ok: false, error: message(e) }));
    if (r.ok) this.#offline.set(frame.id, offline);
    return r.ok ? null : `Whole-frame offline: ${r.error ?? "failed"}`;
  }

  /** Starts or stops recording, or clears it; with `reload`, the frame reloads so its first requests are recorded too. */
  async record(opts: { on?: boolean; clear?: boolean; reload?: boolean }, frame = this.state.frames.selected()): Promise<string | null> {
    await bounded(frame.client.call("record", { on: opts.on, clear: opts.clear }));
    let note: string | null = null;
    if (opts.reload) note = await this.#reload(frame);
    if (frame === this.state.frames.selected()) await this.refresh();
    return note;
  }

  async #reload(frame: Frame): Promise<string | null> {
    this.reloading.set(true);
    try {
      await bounded(frame.client.call("reload", undefined), 5000).catch(() => undefined);
      const t0 = Date.now();
      while (Date.now() - t0 < 1500 && frame.connection() === "ready") await sleep(50);
      while (Date.now() - t0 < RELOAD_TIMEOUT_MS && frame.connection() !== "ready") await sleep(100);
      return frame.connection() === "ready" ? null : "The frame did not come back after the reload.";
    } finally {
      this.reloading.set(false);
    }
  }

  recorded(frame = this.state.frames.selected()): Promise<RecordedResponse[]> {
    return bounded(frame.client.call("recording", undefined));
  }

  /**
   * Writes what was recorded as a new Scenario of `file` (one mock per method and URL), through the edit API, so it is a
   * source edit like any other: undoable, and in the scenes file where the app's own code can read it.
   */
  async saveRecording(save: SaveRecording): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
    const records = await this.recorded().catch((e: unknown) => message(e));
    if (typeof records === "string") return { ok: false, error: records };
    const { mocks, left } = mocksFromRecording(records);
    if (!mocks.length) return { ok: false, error: left.length ? `None of the ${left.length} recorded responses can be a mock (${left[0]!.why}).` : "Nothing was recorded: start recording and use the app." };
    const r = await this.edit.apply({ op: "addMockScene", file: save.file, name: save.name, description: save.description || undefined, url: save.url || undefined, mocks });
    if (!r) return { ok: false, error: "Another edit is running; try again." };
    if (!r.ok) return { ok: false, error: r.error };
    this.saved.set({ file: save.file, name: save.name, mocks: mocks.length, left });
    void this.page.refreshSource();
    return { ok: true, label: r.label };
  }

  /** Applies the Scenario just saved: page mode reloads the app under it, component mode mounts it. */
  useSaved(): void {
    const s = this.saved();
    if (!s) return;
    if (this.state.target().kind === "page") this.page.chooseScenario(`${s.file}|${s.name}`);
    else void this.state.chooseScene(s.name);
  }

  async loadMocks(file: string): Promise<void> {
    const r = await this.state.api<MocksResult>(`/api/mocks?file=${encodeURIComponent(file)}`).catch((e: unknown): MocksResult => ({ ok: false, code: "io", error: message(e) }));
    if (this.active()?.file === file) this.mocks.set(r);
  }

  async editMock(scene: string, index: number, reply: MockReplyPatch, expectUrl?: string): Promise<string | null> {
    const file = this.active()?.file;
    if (!file) return "No scenario is active.";
    const r = await this.edit.apply({ op: "setMock", file, scene, index, reply, expectUrl });
    return !r ? "Another edit is running; try again." : r.ok ? null : r.error;
  }

  async removeMock(scene: string, index: number, expectUrl?: string): Promise<string | null> {
    const file = this.active()?.file;
    if (!file) return "No scenario is active.";
    const r = await this.edit.apply({ op: "removeMock", file, scene, index, expectUrl });
    return !r ? "Another edit is running; try again." : r.ok ? null : r.error;
  }

  /** MCP: the same actions as the panel, on any frame. */
  async command(c: NetworkCommand): Promise<NetworkCommandResult> {
    const frame = this.#frame(c.frame);
    if (frame.connection() !== "ready" && !(c.action === "condition" && c.condition.mode === "normal")) throw new Error(`The frame ${frame.config().name} is not connected (${frame.connection()}).`);
    let note: string | null = null;
    let records: RecordedResponse[] | undefined;
    if (c.action === "condition") note = (await this.setCondition(c.condition, frame)).note;
    else if (c.action === "record") note = await this.record({ on: c.on, clear: c.clear, reload: c.reload }, frame);
    else if (c.action === "recording") records = await this.recorded(frame);
    const snapshot = await bounded(frame.client.call("network", c.action === "get" && c.clear ? { clear: true } : {}));
    if (frame === this.state.frames.selected()) this.snapshot.set(snapshot);
    return { frame: { id: frame.id, name: frame.config().name }, snapshot, ...(records ? { records } : {}), note };
  }
}
