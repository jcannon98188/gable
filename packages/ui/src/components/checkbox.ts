import { computed, html, inject, input, model, output } from "@gable/core";
import { CheckboxState, UiProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";

const CONTROL =
  "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs transition-shadow outline-none dark:bg-input/30 " +
  "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground " +
  "data-[focus-visible]:border-ring data-[focus-visible]:ring-[3px] data-[focus-visible]:ring-ring/50 data-[invalid]:border-destructive data-[invalid]:ring-destructive/20 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

/**
 * A checkbox with an optional label (the projected content).
 *
 *   <ui-checkbox [(value)]="accepted">Accept the terms</ui-checkbox>
 *   <ui-checkbox [field]="form.terms">Accept the terms</ui-checkbox>
 *
 * The boolean is the `value` model, which is what makes it bindable with `[field]` (a custom control convention: `disabled`,
 * `readonly` and `invalid` follow the field, `touched` fires on blur). `indeterminate` draws a dash and wins over `value`.
 * Space toggles it (a Zag checkbox drives a visually hidden native input, so it also works inside a `<form>`).
 */
export class UiCheckbox {
  static meta = {
    selector: "ui-checkbox",
    host: { class: "inline-flex" },
    providers: [CheckboxState],
    imports: [UiProps, UiIcon],
    template: html`
      <label [uiProps]="rootProps()" class="group flex items-center gap-2 text-sm leading-none font-medium select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50">
        <input [uiProps]="inputProps()" (blur)="touched.emit()" />
        <span [uiProps]="controlProps()" [attr.class]="controlClasses()">
          <span [uiProps]="indicatorProps()" class="flex items-center justify-center text-current"><svg [uiIcon]="icon()" class="size-3.5"></svg></span>
        </span>
        <span [uiProps]="labelProps()" class="empty:hidden"><slot></slot></span>
      </label>
    `,
  };

  /** Two-way: `[(value)]="accepted"`. */
  value = model(false);
  indeterminate = input<boolean>(false);
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  invalid = input<boolean>(false);
  name = input<string>("");
  /** Extra classes for the box; they win over the defaults. */
  controlClass = input<string>("");
  /** Fires when the checkbox loses focus (`[field]` marks the field touched). */
  touched = output();

  state = inject(CheckboxState).bind(() => ({
    checked: this.indeterminate() ? ("indeterminate" as const) : this.value(),
    onCheckedChange: (details) => this.value.set(details.checked === true),
    disabled: this.disabled(),
    readOnly: this.readonly(),
    invalid: this.invalid(),
    ...(this.name() ? { name: this.name() } : {}),
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  inputProps = computed(() => this.state.api().getHiddenInputProps());
  controlProps = computed(() => this.state.api().getControlProps());
  indicatorProps = computed(() => this.state.api().getIndicatorProps());
  labelProps = computed(() => this.state.api().getLabelProps());
  icon = computed(() => (this.indeterminate() ? "minus" : "check"));
  controlClasses = computed(() => cn(CONTROL, this.controlClass()));
}
