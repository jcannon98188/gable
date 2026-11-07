import { computed, contentChild, effect, html, input, output, signal } from "@gable/core";
import type { ErrorObject, FieldState, SubmitAction, SubmitResult } from "@gable/core/forms";
import { bindProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";

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
 * and `aria-invalid`.
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

export class UiField {
  static meta = {
    selector: "ui-field",
    host: { class: "grid gap-2" },
    imports: [],
    template: html`
      @if (label()) {
        <label [attr.for]="controlId" [attr.class]="labelClasses()">{{ label() }}</label>
      }
      <slot></slot>
      @if (description()) {
        <p [attr.id]="descriptionId" class="text-sm text-muted-foreground">{{ description() }}</p>
      }
      @if (hasErrors()) {
        <p [attr.id]="errorId" role="alert" class="text-sm font-medium text-destructive">{{ firstError() }}</p>
      }
    `,
  };

  /** The state of the form field this shows errors for: `[state]="form.email.state"`. */
  state = input.required<FieldState>();
  label = input<string>("");
  description = input<string>("");
  /** Messages by error kind, e.g. `{ required: "Tell us your name." }`. */
  messages = input<Record<string, string>>({});

  readonly controlId = `ui-field-${++nextId}`;
  readonly descriptionId = `${this.controlId}-description`;
  readonly errorId = `${this.controlId}-error`;

  /** Errors show once the field was touched or the form was submitted. */
  hasErrors = computed(() => {
    const state = this.state();
    return (state.touched() || state.submitted()) && state.errors().length > 0;
  });
  firstError = computed(() => {
    const error = this.state().errors()[0];
    if (!error) return "";
    return error.message ?? this.messages()[error.kind] ?? DEFAULT_MESSAGES[error.kind]?.(error) ?? "Invalid value.";
  });
  describedBy = computed(() => [this.description() ? this.descriptionId : "", this.hasErrors() ? this.errorId : ""].filter(Boolean).join(" ") || undefined);
  labelClasses = computed(() => cn("text-sm leading-none font-medium select-none", this.hasErrors() && "text-destructive"));

  control = contentChild(UiFieldControl);
  private link = effect(() => this.control()?.owner.set(this));
}
