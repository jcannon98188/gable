// Signal editing for the Preview agent: checked writes, pins, and the mounted Component's state as a Scene could hold it.
// All reads and writes go through the devtools hook of @gable/core (`signalJson`, `setSignal`), so a pin or a poke is exactly what
// the Inspector's raw edit does, plus a shape check against the value the signal holds now.
import type { DevtoolsEvent, DevtoolsMethods, GableDevtoolsHook, SignalInfo } from "@gable/core/devtools";
import type { SceneStateField, SceneStateReport, SignalPin, SignalWriteResult } from "../protocol.js";
import { parseValue, shapeProblems } from "../signal-value.js";

/** A pin the app overwrites more often than this in a second is suspended: the app is driving that signal, not the user. */
export const FIGHT_LIMIT = 20;

const FIELD = /^[A-Za-z_$][\w$]*$/;

interface Pin {
  id: string;
  name: string;
  owner: string | null;
  text: string;
  status: SignalPin["status"];
  reason?: string;
  /** When it was re-applied, for the fight guard (the last second only). */
  writes: number[];
}

export interface SceneHostInfo {
  module: string;
  component: string;
  current: string;
}

export class SignalState {
  readonly #devtools: () => GableDevtoolsHook | undefined;
  readonly #host: () => SceneHostInfo | undefined;
  readonly #now: () => number;
  readonly #pins = new Map<string, Pin>();
  /** Signals written from the Designer since the current root mounted. */
  readonly #poked = new Map<string, { name: string; owner: { id: string; name: string } | null }>();
  #root: string | null = null;
  /** The root's field values (JSON text, or null when not plain data) when it mounted. */
  #baseline = new Map<string, string | null>();
  #reapplying = false;

  constructor(devtools: () => GableDevtoolsHook | undefined, host: () => SceneHostInfo | undefined, now: () => number = () => performance.now()) {
    this.#devtools = devtools;
    this.#host = host;
    this.#now = now;
  }

  async #call<M extends keyof DevtoolsMethods>(method: M, params: DevtoolsMethods[M]["params"]): Promise<DevtoolsMethods[M]["result"]> {
    const hook = this.#devtools();
    if (!hook) throw new Error("The devtools hook is not installed in this page.");
    return await hook.call(method, params);
  }

  /** A checked write: the text must parse, and fit the shape of the current value unless `force`. */
  async set(id: string, text: string, force = false): Promise<SignalWriteResult> {
    await this.sync();
    const result = await this.#write(id, text, force);
    if (result.ok) await this.#remember(id);
    return result;
  }

  async #write(id: string, text: string, force: boolean): Promise<SignalWriteResult> {
    const parsed = parseValue(text);
    if (!parsed.ok) return parsed;
    const current = await this.#call("signalJson", { id });
    if (!current.ok && current.kind === null) return { ok: false, error: current.error };
    if (!current.writable) return { ok: false, error: "This signal is not writable (a computed or a read-only source)." };
    if (!force) {
      // A value that is not plain data has no JSON shape to compare with: writing JSON over it needs `force`.
      if (!current.ok) return { ok: false, error: `${current.error} Its type cannot be checked; force the write to replace it anyway.` };
      const was = parseValue(current.text);
      const problems = was.ok ? shapeProblems(was.value, parsed.value) : [];
      if (problems.length) return { ok: false, error: "The value does not have the shape of the current one.", problems };
    }
    return await this.#call("setSignal", { id, text });
  }

  async #remember(id: string): Promise<void> {
    const info = await this.#call("signal", { id });
    if (info) this.#poked.set(id, { name: info.name, owner: info.owner });
  }

  /** Pins (or with `text: null`, unpins) a signal. */
  async pin(id: string, text: string | null, force = false): Promise<SignalWriteResult> {
    if (text === null) {
      this.#pins.delete(id);
      return { ok: true };
    }
    await this.sync();
    const result = await this.#write(id, text, force);
    if (!result.ok) return result;
    const info = await this.#call("signal", { id });
    this.#pins.set(id, { id, name: info?.name ?? id, owner: info?.owner?.name ?? null, text: text.trim(), status: "active", writes: [] });
    await this.#remember(id);
    return result;
  }

  pins(): SignalPin[] {
    return [...this.#pins.values()].map(({ writes: _, ...pin }) => pin);
  }

  /** Called with every devtools event: a flush may have overwritten a pin, a tree change may be a new root. */
  onEvent(event: DevtoolsEvent): void {
    if (event.type === "tree") void this.#checkRoot();
    if ((event.type === "flush" || event.type === "tree" || event.type === "hmr") && this.#pins.size && !this.#reapplying) {
      // Not inside the flush that is being reported: re-apply after it.
      this.#reapplying = true;
      queueMicrotask(() => void this.#reapply().finally(() => (this.#reapplying = false)));
    }
  }

  async #reapply(): Promise<void> {
    for (const pin of this.#pins.values()) {
      if (pin.status !== "active") continue;
      const now = await this.#call("signalJson", { id: pin.id });
      if (!now.ok && now.kind === null) {
        pin.status = "gone";
        pin.reason = "The signal no longer exists: its component was remounted or hot-updated. Pin it again.";
        continue;
      }
      if (now.ok && now.text === pin.text) continue;
      const t = this.#now();
      pin.writes = pin.writes.filter((w) => t - w < 1000);
      pin.writes.push(t);
      if (pin.writes.length > FIGHT_LIMIT) {
        pin.status = "suspended";
        pin.reason = `The app overwrote it more than ${FIGHT_LIMIT} times in a second, so the pin stopped re-applying. Something in the app drives this signal.`;
        continue;
      }
      const written = await this.#call("setSignal", { id: pin.id, text: pin.text });
      if (!written.ok) {
        pin.status = "suspended";
        pin.reason = written.error;
      }
    }
  }

  async #rootId(): Promise<string | null> {
    const host = this.#host();
    if (!host) return null;
    const tree = await this.#call("tree", undefined);
    return tree.find((n) => n.parent === null && n.name === host.component)?.id ?? null;
  }

  /**
   * Notices a new root (a scene mounted or remounted): what was poked is forgotten and the new root's values become the
   * baseline that `changed` compares with. Runs on every tree event, when the agent connects, and before a write.
   */
  sync(): Promise<void> {
    return this.#checkRoot();
  }

  async #checkRoot(): Promise<void> {
    const root = await this.#rootId();
    if (root === this.#root) return;
    this.#root = root;
    this.#poked.clear();
    this.#baseline = new Map((await this.#fields(root)).map((f) => [f.field, f.text]));
  }

  async #fields(root: string | null): Promise<Array<{ info: SignalInfo; kind: SceneStateField["kind"]; field: string; text: string | null; error?: string }>> {
    if (!root) return [];
    const detail = await this.#call("component", { id: root });
    if (!detail) return [];
    const out = [];
    const all = [...detail.inputs.map((info) => ({ info, kind: "input" as const })), ...detail.signals.filter((s) => s.kind === "state" && s.writable).map((info) => ({ info, kind: "state" as const }))];
    for (const { info, kind } of all) {
      // Only fields a Scene can name: devtools names a signal by the Component field that holds it, and an unnamed one
      // ("state #12", made inside a function) is not reachable from a Scene.
      if (!FIELD.test(info.name)) continue;
      const json = await this.#call("signalJson", { id: info.id });
      out.push({ info, kind, field: info.name, text: json.ok ? json.text : null, ...(json.ok ? {} : { error: json.error }) });
    }
    return out;
  }

  /** The mounted Component's inputs and writable signals, which of them were poked or changed, and what cannot be saved. */
  async sceneState(): Promise<SceneStateReport | null> {
    const host = this.#host();
    if (!host) return null;
    const root = await this.#rootId();
    if (root !== this.#root) await this.#checkRoot();
    const fields = await this.#fields(root);
    const ids = new Set(fields.map((f) => f.info.id));
    const skipped = [...this.#poked.entries()]
      .filter(([id]) => !ids.has(id))
      .map(([, p]) => ({
        name: p.name,
        owner: p.owner?.name ?? null,
        reason: p.owner && p.owner.id !== root ? `It belongs to ${p.owner.name}, not ${host.component}: a Scene only sets the mounted Component's fields.` : "It is not a field of the mounted Component (a service or a store).",
      }));
    return {
      module: host.module,
      component: host.component,
      scene: host.current,
      fields: fields.map(({ info, kind, field, text, error }) => ({
        field,
        kind,
        id: info.id,
        text,
        ...(error ? { error } : {}),
        poked: this.#poked.has(info.id),
        changed: this.#baseline.has(field) && this.#baseline.get(field) !== text,
      })),
      skipped,
    };
  }
}
