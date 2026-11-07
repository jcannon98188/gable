import { computed, html, inject, input, model, output } from "@gable/core";
import { ToggleGroupState, UiProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";
import { toggleVariants, type ToggleSize, type ToggleVariant } from "./toggle.js";

/** One button of a toggle group: `label` is its text. */
export interface ToggleGroupItem {
  value: string;
  label: string;
  disabled?: boolean;
  /** Name of an icon registered in `lib/icon.ts`. */
  icon?: string;
  /** Show only the icon: `label` stays the accessible name (screen-reader text) and the tooltip (`title`). */
  iconOnly?: boolean;
}

/**
 * A group of toggle buttons.
 *
 *   <ui-toggle-group [items]="styles" [(value)]="chosen" type="multiple" variant="outline"></ui-toggle-group>
 *
 * `value` is the list of pressed values (the model, so `[field]` works); `type="single"` keeps at most one. Arrow keys move
 * between the buttons. `segmented` draws it as a connected segmented control (one bordered track, the selected segment
 * raised): `size="sm"` makes it the small one used for mode, breakpoint and device switches. An item with an `icon`
 * and `iconOnly` shows just the icon; its `label` is still the button's accessible name.
 */
export class UiToggleGroup {
  static meta = {
    selector: "ui-toggle-group",
    host: { class: "inline-block" },
    providers: [ToggleGroupState],
    imports: [UiProps, UiIcon],
    template: html`
      <div [uiProps]="rootProps()" [attr.class]="rootClasses()">
        @for (row of rows(); track row.value) {
          <button [uiProps]="row.props" [attr.class]="itemClasses()" [attr.title]="row.title" (blur)="touched.emit()">
            @if (row.icon) {
              <svg [uiIcon]="row.icon" aria-hidden="true"></svg>
            }
            <span [attr.class]="row.labelClass">{{ row.label }}</span>
          </button>
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
  /** Connected segmented-control look (a bordered track, the selected segment raised). */
  segmented = input<boolean>(false);
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
    cn("flex w-fit items-center rounded-md data-[orientation=vertical]:flex-col data-[variant=outline]:shadow-xs", this.segmented() && "gap-0 overflow-hidden border bg-muted/40 shadow-xs", this.class()),
  );
  itemClasses = computed(() =>
    toggleVariants({
      variant: this.segmented() ? "default" : this.variant(),
      size: this.segmented() && this.size() === "sm" ? "compact" : this.size(),
      class: (this.segmented() ? "border-l first:border-l-0 data-[state=on]:bg-background data-[state=on]:font-semibold data-[state=on]:shadow-xs " : "") + "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
    }),
  );
  rows = computed(() => {
    const api = this.state.api();
    return this.items().map((item) => ({
      ...item,
      icon: item.icon ?? "",
      title: item.iconOnly ? item.label : undefined,
      labelClass: item.iconOnly ? "sr-only" : "",
      props: { ...api.getItemProps({ value: item.value, disabled: item.disabled }), "data-variant": this.variant() },
    }));
  });
}
