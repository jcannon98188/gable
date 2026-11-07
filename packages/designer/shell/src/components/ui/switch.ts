import { computed, html, inject, input, model, output } from "@gable/core";
import { SwitchState, UiProps } from "@gable/ui-primitives";
import { cn } from "../../lib/ui/cn.js";

const CONTROL =
  "inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none bg-input dark:bg-input/80 " +
  "data-[state=checked]:bg-primary data-[focus-visible]:border-ring data-[focus-visible]:ring-[3px] data-[focus-visible]:ring-ring/50 data-[invalid]:ring-destructive/20 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

/**
 * A switch with an optional label (the projected content).
 *
 *   <ui-switch [(value)]="airplane">Airplane mode</ui-switch>
 *
 * `value` is the model (so `[field]` works); Space toggles it.
 */
export class UiSwitch {
  static meta = {
    selector: "ui-switch",
    host: { class: "inline-flex" },
    providers: [SwitchState],
    imports: [UiProps],
    template: html`
      <label [uiProps]="rootProps()" class="flex items-center gap-2 text-sm font-medium select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50">
        <input [uiProps]="inputProps()" (blur)="touched.emit()" />
        <span [uiProps]="controlProps()" [attr.class]="controlClasses()"><span [uiProps]="thumbProps()" class="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"></span></span>
        <span [uiProps]="labelProps()" class="empty:hidden"><slot></slot></span>
      </label>
    `,
  };

  /** Two-way: `[(value)]="on"`. */
  value = model(false);
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  invalid = input<boolean>(false);
  name = input<string>("");
  controlClass = input<string>("");
  touched = output();

  state = inject(SwitchState).bind(() => ({
    checked: this.value(),
    onCheckedChange: (details) => this.value.set(details.checked),
    disabled: this.disabled(),
    readOnly: this.readonly(),
    invalid: this.invalid(),
    ...(this.name() ? { name: this.name() } : {}),
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  inputProps = computed(() => this.state.api().getHiddenInputProps());
  controlProps = computed(() => this.state.api().getControlProps());
  thumbProps = computed(() => this.state.api().getThumbProps());
  labelProps = computed(() => this.state.api().getLabelProps());
  controlClasses = computed(() => cn(CONTROL, this.controlClass()));
}
