import { computed, html, inject, input, model, output } from "@gable/core";
import { ToggleGroupState, UiProps } from "@gable/ui-primitives";
import { cn } from "../../lib/ui/cn.js";
import { toggleVariants, type ToggleSize, type ToggleVariant } from "./toggle.js";

/** One button of a toggle group: `label` is its text. */
export interface ToggleGroupItem {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * A group of toggle buttons.
 *
 *   <ui-toggle-group [items]="styles" [(value)]="chosen" type="multiple" variant="outline"></ui-toggle-group>
 *
 * `value` is the list of pressed values (the model, so `[field]` works); `type="single"` keeps at most one. Arrow keys move
 * between the buttons.
 */
export class UiToggleGroup {
  static meta = {
    selector: "ui-toggle-group",
    host: { class: "inline-block" },
    providers: [ToggleGroupState],
    imports: [UiProps],
    template: html`
      <div [uiProps]="rootProps()" [attr.class]="rootClasses()">
        @for (row of rows(); track row.value) {
          <button [uiProps]="row.props" [attr.class]="itemClasses()" (blur)="touched.emit()">{{ row.label }}</button>
        }
      </div>
    `,
  };

  items = input<ToggleGroupItem[]>([]);
  /** Two-way: `[(value)]="chosen"`. */
  value = model<string[]>([]);
  type = input<"single" | "multiple">("single");
  variant = input<ToggleVariant>("default");
  size = input<ToggleSize>("default");
  orientation = input<"horizontal" | "vertical">("horizontal");
  disabled = input<boolean>(false);
  class = input<string>("");
  touched = output();

  state = inject(ToggleGroupState).bind(() => ({
    value: this.value(),
    onValueChange: (details) => this.value.set(details.value),
    multiple: this.type() === "multiple",
    orientation: this.orientation(),
    disabled: this.disabled(),
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  rootClasses = computed(() =>
    cn("flex w-fit items-center rounded-md data-[orientation=vertical]:flex-col data-[variant=outline]:shadow-xs", this.class()),
  );
  itemClasses = computed(() =>
    toggleVariants({
      variant: this.variant(),
      size: this.size(),
      class: "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
    }),
  );
  rows = computed(() => {
    const api = this.state.api();
    return this.items().map((item) => ({ ...item, props: { ...api.getItemProps({ value: item.value, disabled: item.disabled }), "data-variant": this.variant() } }));
  });
}
