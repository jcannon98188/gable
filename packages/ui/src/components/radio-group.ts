import { computed, html, inject, input, model, output } from "@gable/core";
import { RadioGroupState, UiProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";

/** One radio: items are data, like Select's options. */
export interface RadioItem {
  value: string;
  label: string;
  disabled?: boolean;
}

const CONTROL =
  "group/radio flex aspect-square size-4 shrink-0 items-center justify-center rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none dark:bg-input/30 " +
  "data-[focus-visible]:border-ring data-[focus-visible]:ring-[3px] data-[focus-visible]:ring-ring/50 data-[invalid]:border-destructive data-[invalid]:ring-destructive/20 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

/**
 * A radio group.
 *
 *   <ui-radio-group [items]="plans" [(value)]="plan"></ui-radio-group>
 *
 * `items` is a list of `{ value, label, disabled? }`; `value` is the chosen item's value or an empty string (the model,
 * so `[field]` works). Arrow keys move and select, as in a native radio group.
 */
export class UiRadioGroup {
  static meta = {
    selector: "ui-radio-group",
    host: { class: "block" },
    providers: [RadioGroupState],
    imports: [UiProps, UiIcon],
    template: html`
      <div [uiProps]="rootProps()" [attr.class]="rootClasses()">
        @for (row of rows(); track row.value) {
          <label [uiProps]="row.itemProps" class="flex items-center gap-2 text-sm font-medium data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50">
            <input [uiProps]="row.inputProps" (blur)="touched.emit()" />
            <span [uiProps]="row.controlProps" [attr.class]="controlClasses()">
              <svg uiIcon="circle" class="hidden size-2 fill-current stroke-current group-data-[state=checked]/radio:block"></svg>
            </span>
            <span [uiProps]="row.textProps">{{ row.label }}</span>
          </label>
        }
      </div>
    `,
  };

  items = input<RadioItem[]>([]);
  /** Two-way: `[(value)]="plan"`. */
  value = model("");
  orientation = input<"vertical" | "horizontal">("vertical");
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  invalid = input<boolean>(false);
  name = input<string>("");
  class = input<string>("");
  touched = output();

  state = inject(RadioGroupState).bind(() => ({
    value: this.value() || null,
    onValueChange: (details) => this.value.set(details.value ?? ""),
    orientation: this.orientation(),
    disabled: this.disabled(),
    readOnly: this.readonly(),
    invalid: this.invalid(),
    ...(this.name() ? { name: this.name() } : {}),
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  rootClasses = computed(() => cn(this.orientation() === "horizontal" ? "flex flex-wrap gap-4" : "grid gap-3", this.class()));
  controlClasses = computed(() => CONTROL);
  /** Templates cannot call prop getters, so each radio's parts are computed rows. */
  rows = computed(() => {
    const api = this.state.api();
    return this.items().map((item) => {
      const props = { value: item.value, disabled: item.disabled };
      return {
        ...item,
        itemProps: api.getItemProps(props),
        inputProps: api.getItemHiddenInputProps(props),
        controlProps: api.getItemControlProps(props),
        textProps: api.getItemTextProps(props),
      };
    });
  });
}
