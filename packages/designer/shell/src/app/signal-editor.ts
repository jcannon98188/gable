// The Inspector's signal editing (TASK-56.17): an Edit/Pin control on each writable signal or input row, and the "Poked
// state" section that saves what was set as a new Scenario. The writes, checks and pins happen in the Preview agent (see
// signal-edits.ts); these components only collect text and show the answers.
import { computed, html, inject, input, signal, type WritableSignal } from "@gable/core";
import { UiButton } from "../components/ui/button.js";
import { UiCheckbox } from "../components/ui/checkbox.js";
import { UiInput } from "../components/ui/input.js";
import { UiTextarea } from "../components/ui/textarea.js";
import { DesignerState } from "./designer-state.js";
import { SignalEdits } from "./signal-edits.js";

/** Edit and Pin for one signal row of the Inspector. Shows nothing for a signal that cannot be written. */
export class SignalEdit {
  static meta = {
    selector: "app-signal-edit",
    host: { class: "contents" },
    imports: [UiButton, UiTextarea],
    template: html`
      @if (writable()) {
        <span class="flex items-center gap-1" data-part="signal-actions">
          @if (pin().shown) {
            <span [attr.class]="pin().chip" [attr.title]="pin().reason" data-part="signal-pinned">{{ pin().label }}</span>
          }
          <button uiButton variant="ghost" size="sm" class="btn sm" data-part="signal-edit" [attr.aria-label]="labels().edit" [attr.aria-expanded]="open()" (click)="toggle()">Edit</button>
          @if (pin().shown) {
            <button uiButton variant="ghost" size="sm" class="btn sm" data-part="signal-unpin" [attr.aria-label]="labels().unpin" (click)="unpin()">Unpin</button>
          }
        </span>
      }
      @if (open()) {
        <div class="flex flex-col gap-2 pt-1" data-part="signal-editor">
          <textarea uiTextarea class="mono text-xs" rows="3" spellcheck="false" data-part="signal-text" [attr.aria-label]="labels().text" [value]="draft()" (input)="draft.set($event.currentTarget.value)" (keydown)="key($event)"></textarea>
          @if (error()) {
            <p class="callout err" role="alert" data-part="signal-error">{{ error() }}</p>
          }
          @for (p of problems(); track p) {
            <p class="callout warn" data-part="signal-problem">{{ p }}</p>
          }
          <span class="flex flex-wrap gap-1">
            <button uiButton size="sm" class="btn sm" data-part="signal-set" [disabled]="busy()" (click)="apply(false)">{{ labels().set }}</button>
            <button uiButton variant="outline" size="sm" class="btn sm" data-part="signal-pin" [disabled]="busy()" (click)="apply(true)">{{ labels().pin }}</button>
            <button uiButton variant="ghost" size="sm" class="btn sm" (click)="open.set(false)">Cancel</button>
          </span>
        </div>
      }
    `,
  };
  edits = inject(SignalEdits);
  sid = input.required<string>();
  name = input("");
  writable = input(false);

  open = signal(false);
  draft = signal("");
  error = signal("");
  problems = signal<string[]>([]);
  busy = signal(false);

  labels = computed(() => {
    const anyway = this.problems().length > 0 ? " anyway" : "";
    return { edit: `Edit ${this.name()}`, unpin: `Unpin ${this.name()}`, text: `New value of ${this.name()} (JSON)`, set: `Set${anyway}`, pin: `Pin${anyway}` };
  });

  pin = computed(() => {
    const p = this.edits.pins().find((x) => x.id === this.sid());
    if (!p) return { shown: false, chip: "chip", label: "", reason: "" };
    const active = p.status === "active";
    return { shown: true, chip: active ? "chip on" : "chip warn", label: active ? `pinned ${p.text}` : `pin ${p.status}`, reason: p.reason ?? `Pinned to ${p.text}` };
  });

  async toggle(): Promise<void> {
    if (this.open()) return void this.open.set(false);
    this.error.set("");
    this.problems.set([]);
    const r = await this.edits.read(this.sid());
    this.draft.set(r.ok ? r.text : "");
    if (!r.ok) this.error.set(`${r.error} Type JSON to replace it anyway.`);
    this.open.set(true);
  }

  key(e: KeyboardEvent): void {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void this.apply(false);
    } else if (e.key === "Escape") this.open.set(false);
  }

  /** Sets (or pins) the draft. A value whose shape differs from the current one is refused once, then forced on the second try. */
  async apply(pin: boolean): Promise<void> {
    const force = this.problems().length > 0 || this.error() !== "";
    this.busy.set(true);
    try {
      const r = pin ? await this.edits.pin(this.sid(), this.draft(), force) : await this.edits.set(this.sid(), this.draft(), force);
      if (r.ok) {
        this.open.set(false);
        this.problems.set([]);
        this.error.set("");
      } else {
        this.error.set(r.problems?.length ? "" : r.error);
        this.problems.set(r.problems ?? []);
      }
    } finally {
      this.busy.set(false);
    }
  }

  async unpin(): Promise<void> {
    await this.edits.pin(this.sid(), null);
  }
}

/** Component mode: what was set from the Designer, and "Save as Scenario" to keep it. */
export class SceneStatePanel {
  static meta = {
    selector: "app-scene-state",
    host: { class: "block" },
    imports: [UiButton, UiCheckbox, UiInput],
    template: html`
      @if (view().show) {
        <div class="sec" data-part="scene-state">
          <div class="sec-h">Poked state · {{ view().scene }}</div>
          @for (f of view().fields; track f.field) {
            <div class="inj-row">
              <ui-checkbox [(value)]="f.chosen" [attr.data-field]="f.field">
                <span class="mono">{{ f.field }}</span> <span class="chip">{{ f.kind }}</span> <span class="mono dim truncate">{{ f.text }}</span>
              </ui-checkbox>
            </div>
          }
          @for (s of view().skipped; track s.name) {
            <p class="callout info" data-part="scene-state-skipped">{{ s.name }} ({{ s.owner ?? 'no component' }}) is not saved: {{ s.reason }}</p>
          }
          <label class="form-row"><span>Name</span>
            <input uiInput class="fld" placeholder="Busy list" aria-label="New Scenario name" data-part="scene-state-name" [value]="name()" (input)="name.set($event.currentTarget.value)" />
          </label>
          <label class="form-row"><span>Description</span>
            <input uiInput class="fld" placeholder="Optional" aria-label="New Scenario description" data-part="scene-state-description" [value]="description()" (input)="description.set($event.currentTarget.value)" />
          </label>
          @if (edits.saveError()) {
            <p class="callout err" role="alert" data-part="scene-state-error">{{ edits.saveError() }}</p>
          }
          <span class="flex justify-end">
            <button uiButton size="sm" class="btn sm" data-part="scene-state-save" [disabled]="!canSave()" (click)="save()">Save as Scenario</button>
          </span>
        </div>
      }
    `,
  };
  state = inject(DesignerState);
  edits = inject(SignalEdits);
  name = signal("");
  description = signal("");
  saving = signal(false);

  /** One checkbox signal per field, kept across refreshes so a choice survives the next flush. */
  #chosen = new Map<string, WritableSignal<boolean>>();

  view = computed(() => {
    const scene = this.edits.scene();
    const fields = SignalEdits.picked(scene);
    const show = this.state.target().kind === "component" && !!scene && (fields.length > 0 || scene.skipped.length > 0);
    return {
      show,
      scene: scene?.scene ?? "",
      skipped: scene?.skipped ?? [],
      fields: fields.map((f) => {
        let chosen = this.#chosen.get(f.field);
        if (!chosen) this.#chosen.set(f.field, (chosen = signal(true)));
        return { field: f.field, kind: f.kind, text: f.text, chosen };
      }),
    };
  });

  canSave = computed(() => !this.saving() && this.name().trim() !== "" && this.view().fields.some((f) => f.chosen()));

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const fields = this.view().fields.filter((f) => f.chosen()).map((f) => f.field);
      const label = await this.edits.saveScenario(this.name(), this.description(), fields);
      if (label) {
        this.name.set("");
        this.description.set("");
        this.#chosen.clear();
      }
    } finally {
      this.saving.set(false);
    }
  }
}
