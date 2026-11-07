// Signal state editing (TASK-56.17): the Inspector's Edit and Pin, the Poked state section, and "Save as Scenario". The
// Preview agent does the checked writes and keeps the pins (`src/agent/signal-state.ts`); this service asks it and shows what
// it says. Saving writes a Scene through the edit service like the New Scenario dialog, so it is one undoable change.
import { effect, inject, signal, untracked } from "@gable/core";
import type { SceneStateField, SceneStateReport, SignalPin, SignalWriteResult } from "../../../src/protocol.js";
import { defaultSceneFields, sceneValues } from "../../../src/signal-value.js";
import { DesignerState } from "./designer-state.js";
import { EditState } from "./edit-state.js";

export class SignalEdits {
  static scope = "root";
  state = inject(DesignerState);
  edit = inject(EditState);

  pins = signal<SignalPin[]>([]);
  scene = signal<SceneStateReport | null>(null);
  /** Why the last save did not happen. */
  saveError = signal("");

  #timer: ReturnType<typeof setTimeout> | undefined;
  /** Signal values change with every flush, and a pin may have been suspended: refresh, at most every 200ms. */
  watch = effect(() => {
    this.state.flushes();
    this.state.component();
    this.state.sceneInfo();
    const ready = this.state.connection() === "ready";
    untracked(() => {
      if (!ready) return void (this.pins.set([]), this.scene.set(null));
      this.#timer ??= setTimeout(() => {
        this.#timer = undefined;
        void this.refresh();
      }, 200);
    });
  });

  async refresh(): Promise<void> {
    const p = this.state.preview;
    const [pins, scene] = await Promise.all([p.call("pins", undefined).catch(() => []), p.call("sceneState", undefined).catch(() => null)]);
    this.pins.set(pins);
    this.scene.set(scene);
  }

  /** The signal's current value as JSON text for the editor, or why it cannot be edited as text. */
  async read(id: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    const r = await this.state.preview.call("signalJson", { id });
    return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error };
  }

  async set(id: string, text: string, force = false): Promise<SignalWriteResult> {
    const r = await this.state.preview.call("setSignalValue", { id, text, force });
    await this.refresh();
    return r;
  }

  /** Pins `id` to `text`, or unpins it (`null`). */
  async pin(id: string, text: string | null, force = false): Promise<SignalWriteResult> {
    const r = await this.state.preview.call("pinSignal", { id, text, force });
    await this.refresh();
    return r;
  }

  pinOf(id: string): SignalPin | undefined {
    return this.pins().find((p) => p.id === id);
  }

  /** The fields "Save as Scenario" writes by default: what was poked from here or changed since the scene mounted. */
  static picked(scene: SceneStateReport | null): SceneStateField[] {
    const names = new Set(defaultSceneFields(scene?.fields ?? []));
    return (scene?.fields ?? []).filter((f) => names.has(f.field));
  }

  /**
   * Writes a new Scene: a copy of the mounted one with the chosen fields' current values (inputs into `inputs`, signals into
   * `state`), then shows it once the scenes file's hot update lists it. Resolves to the edit's diff label, or null on failure
   * (`saveError` says why).
   */
  async saveScenario(name: string, description: string, fields: string[]): Promise<string | null> {
    this.saveError.set("");
    const target = this.state.target();
    const scene = this.scene();
    if (target.kind !== "component" || !scene) return this.#refuse("Save as Scenario works in component mode, on a mounted scene.");
    const values = sceneValues(scene.fields, fields);
    if (!values.ok) return this.#refuse(values.error);
    const { inputs, state } = values;
    const r = await this.edit.apply({
      op: "addScene",
      file: target.scenes,
      name: name.trim(),
      description: description.trim(),
      from: scene.scene,
      ...(Object.keys(inputs).length ? { inputs } : {}),
      ...(Object.keys(state).length ? { state } : {}),
    });
    if (!r) return this.#refuse("Another edit is running; try again.");
    if (!r.ok) return this.#refuse(r.error);
    await this.showWhenListed(name.trim());
    return r.label;
  }

  /** Waits (up to 15s) for the scenes file's hot update to list `name`, then mounts it. */
  async showWhenListed(name: string): Promise<boolean> {
    for (let i = 0; i < 150; i++) {
      if (this.state.sceneInfo()?.scenes.some((s) => s.name === name)) {
        await this.state.chooseScene(name);
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  #refuse(why: string): null {
    this.saveError.set(why);
    return null;
  }
}
