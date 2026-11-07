import { computed, contentChild, effect, html, input, output, signal } from "@gable/core";
import type { ErrorObject, FieldState, SubmitAction, SubmitResult } from "@gable/core/forms";
import { bindProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";
import type { InputDensity } from "./input.js";
import { UiSelect } from "./select.js";

/**
 * Form and Field: label, description and error display on top of `@gable/core/forms`.
 *
 *   <ui-form [submit]="form.submit" [action]="save" (submitted)="done($event)">
 *     <ui-field [state]="form.email.state" label="Email" description="We never share it.">
 *       <input uiInput uiFieldControl [field]="form.email" type="email" />
 *     </ui-field>
 *     <button uiButton type="submit">Save</button>
 *   </ui-form>
 *
 * `ui-form` stops the browser's own submit and calls `form.submit(action)`: every field is touched, the action runs only
 * when the form is valid, and `submitted` emits the result (`"ok"`, `"invalid"`, ...).
 * `ui-field` shows its errors once the field is touched or the form has been submitted. The message is the error's own
 * `message` when it has one, else `messages[kind]`, else a built-in default for the common rule kinds.
 * `uiFieldControl` goes on the control inside a field: it gives it an id (the label points at it), `aria-describedby`
 * and `aria-invalid`. It works on `input[uiInput]`, `textarea` and native `select`. A `ui-select` inside a field needs no
 * `uiFieldControl`: the field finds it, points the label at its trigger (`aria-labelledby`) and gives it `aria-describedby` and
 * `aria-invalid`.
 *
 * `layout="horizontal"` puts the label beside the control (the label column is `--ui-field-label-width`, 8rem by default);
 * `density="compact"` shrinks the label text. `hint` is an alias of `description`. Without a `state`, `error` shows a message
 * you control.
 */
export class UiForm {
  static meta = {
    selector: "ui-form",
    host: { class: "block" },
    template: html`<form novalidate [attr.class]="class()" (submit)="onSubmit($event)"><slot></slot></form>`,
  };

  /** The form's own `submit`: `[submit]="form.submit"`. (Passing the form itself would be a bare signal in a template.) */
  submit = input.required<(action: SubmitAction<any>) => Promise<SubmitResult>>();
  /** Runs when the form is valid. May return a promise or server errors (see `SubmitAction`). */
  action = input<SubmitAction<any>>(() => undefined);
  /** Classes for the inner `<form>`, e.g. `"grid gap-4"`. */
  class = input<string>("");
  submitted = output<SubmitResult>();

  onSubmit(event: Event) {
    event.preventDefault();
    void this.submit()(this.action()).then((result) => this.submitted.emit(result));
  }
}

/** Built-in messages for the rule kinds in `@gable/core/forms`, used when a validator gives none. */
export const DEFAULT_MESSAGES: Record<string, (error: ErrorObject) => string> = {
  required: () => "This field is required.",
  requiredTrue: () => "This must be checked.",
  email: () => "Enter a valid email address.",
  minLength: (e) => `Must be at least ${e["min"] ?? e["minLength"] ?? "?"} characters.`,
  maxLength: (e) => `Must be at most ${e["max"] ?? e["maxLength"] ?? "?"} characters.`,
  min: (e) => `Must be at least ${e["min"] ?? "?"}.`,
  max: (e) => `Must be at most ${e["max"] ?? "?"}.`,
  pattern: () => "Invalid format.",
};

let nextId = 0;

/** Put on the control inside a `ui-field`. It receives its wiring from the field (owner push, see docs/ui-primitives.md). */
export class UiFieldControl {
  static meta = { selector: "[uiFieldControl]" };
  /** Set by the enclosing `ui-field`. */
  owner = signal<UiField | null>(null);
  private props = bindProps(() => {
    const field = this.owner();
    if (!field) return null;
    return {
      id: field.controlId,
      "aria-describedby": field.describedBy(),
      "aria-invalid": field.hasErrors() ? "true" : undefined,
    };
  });
}

/**
 * `ui-field`: a label, a control, an optional description and an error message, wired together with the right ids and ARIA attributes (`aria-describedby`, `aria-invalid`, and the error as `role="alert"`).
 *
 * Pass the form field's `state` and errors appear once it was touched or the form was submitted; the text comes from the error's own message, `messages` or built-in defaults. Mark the control inside with `uiFieldControl` (a `ui-select` is wired automatically). A field itself is a bare signal in a template, so bind `form.email.state`, not `form.email`.
 *
 * @example
 * // Component class
 * model = signal({ email: "" });
 * form = form(this.model, (p) => {
 *   required(p.email);
 *   email(p.email);
 * });
 *
 * // Template (static html, no holes)
 * // <ui-field label="Email" description="We never share it." [state]="form.email.state">
 * //   <input uiInput uiFieldControl [field]="form.email" type="email" />
 * // </ui-field>
 */
export class UiField {
  static meta = {
    selector: "ui-field",
    imports: [],
    template: html`
      @if (label()) {
        <label [attr.id]="labelId" [attr.for]="labelFor()" [attr.class]="labelClasses()">{{ label() }}</label>
      }
      <div [attr.class]="bodyClasses()"><slot></slot></div>
      @if (hintText()) {
        <p [attr.id]="descriptionId" [attr.class]="hintClasses()">{{ hintText() }}</p>
      }
      @if (hasErrors()) {
        <p [attr.id]="errorId" role="alert" [attr.class]="errorClasses()">{{ firstError() }}</p>
      }
    `,
  };

  /** The state of the form field this shows errors for: `[state]="form.email.state"`. Optional: without it only `error` shows. */
  state = input<FieldState | null>(null);
  label = input<string>("");
  description = input<string>("");
  /** An alias of `description`. */
  hint = input<string>("");
  /** An error message you control, shown instead of the state's errors. */
  error = input<string>("");
  /** `"horizontal"` puts the label beside the control. */
  layout = input<"stacked" | "horizontal">("stacked");
  /** `"compact"` is the dense variant: 12px label and hint text. */
  density = input<InputDensity>("default");
  class = input<string>("");
  /** Messages by error kind, e.g. `{ required: "Tell us your name." }`. */
  messages = input<Record<string, string>>({});

  readonly controlId = `ui-field-${++nextId}`;
  readonly descriptionId = `${this.controlId}-description`;
  readonly errorId = `${this.controlId}-error`;
  readonly labelId = `${this.controlId}-label`;
  /** Set by a `ui-select` in the field: the id of its trigger, which the label then points at. */
  targetId = signal("");
  labelFor = computed(() => this.targetId() || this.controlId);
  hintText = computed(() => this.hint() || this.description());

  /** Errors show once the field was touched or the form was submitted. */
  hasErrors = computed(() => {
    if (this.error()) return true;
    const state = this.state();
    return !!state && (state.touched() || state.submitted()) && state.errors().length > 0;
  });
  firstError = computed(() => {
    if (this.error()) return this.error();
    const error = this.state()?.errors()[0];
    if (!error) return "";
    return error.message ?? this.messages()[error.kind] ?? DEFAULT_MESSAGES[error.kind]?.(error) ?? "Invalid value.";
  });
  describedBy = computed(() => [this.hintText() ? this.descriptionId : "", this.hasErrors() ? this.errorId : ""].filter(Boolean).join(" ") || undefined);
  private horizontal = computed(() => this.layout() === "horizontal");
  private compact = computed(() => this.density() === "compact");
  labelClasses = computed(() => cn("leading-none font-medium select-none", this.compact() ? "text-xs" : "text-sm", this.hasErrors() && "text-destructive"));
  bodyClasses = computed(() => cn("grid min-w-0", this.compact() ? "gap-1" : "gap-2", this.horizontal() && !this.label() && "col-span-2"));
  private messageClasses = computed(() => cn(this.compact() ? "text-xs" : "text-sm", this.horizontal() && (this.label() ? "col-start-2" : "col-span-2")));
  hintClasses = computed(() => cn(this.messageClasses(), "text-muted-foreground"));
  errorClasses = computed(() => cn(this.messageClasses(), "font-medium text-destructive"));
  private apply = useHostClass(() =>
    cn(
      this.horizontal() ? "grid grid-cols-[var(--ui-field-label-width,8rem)_minmax(0,1fr)] items-center gap-x-3" : "grid",
      this.horizontal() ? (this.compact() ? "gap-y-1" : "gap-y-1.5") : this.compact() ? "gap-1" : "gap-2",
      this.class(),
    ),
  );

  control = contentChild(UiFieldControl);
  private link = effect(() => this.control()?.owner.set(this));
  /** A `ui-select` in the field is wired the same way (owner push); it is not a native control, so it has its own hook. */
  select = contentChild(UiSelect);
  private linkSelect = effect(() => this.select()?.fieldOwner.set(this));
}
