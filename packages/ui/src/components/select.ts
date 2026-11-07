import { computed, html, inject, input, model } from "@gable/core";
import {
  SelectState,
  UiPortal,
  UiSelectContent,
  UiSelectItem,
  UiSelectPositioner,
  UiProps,
  UiSelectValueText,
  selectCollection,
  type SelectItem,
} from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";

export type { SelectItem };

const TRIGGER =
  "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder-shown]:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50";

const CONTENT =
  "z-50 max-h-(--available-height) min-w-(--reference-width) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 " +
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";

const ITEM =
  "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none " +
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

/**
 * A select. The options are data (see docs/ui-items.md): pass a list of `{ value, label, disabled? }` and bind the value.
 *
 *   <ui-select [items]="fruits" [(value)]="fruit" placeholder="Pick a fruit" triggerClass="w-[180px]"></ui-select>
 *
 * Arrow keys, Home and End move the highlight (skipping disabled options), Enter or a click picks it, typing jumps to a
 * matching label, Escape closes. The list is portalled, sized to the trigger and kept on screen; `data-state` animates it.
 * The trigger is named by its text (the selected label or the placeholder), which is exposed as `aria-label`; pass `label` (aria-label) or `labelledBy` (an element id) for a
 * better name. `value` is the selected option's value, or an empty string for none.
 */
export class UiSelect {
  static meta = {
    selector: "ui-select",
    host: { class: "inline-block" },
    providers: [SelectState],
    imports: [UiPortal, UiProps, UiSelectValueText, UiSelectPositioner, UiSelectContent, UiSelectItem, UiIcon],
    template: html`
      <button [uiProps]="triggerProps()" [attr.class]="triggerClasses()">
        <span uiSelectValueText class="truncate">{{ text() }}</span>
        <svg uiIcon="chevron-down" class="size-4 opacity-50"></svg>
      </button>
      <ui-portal>
        <div uiSelectPositioner>
          <div uiSelectContent [attr.class]="contentClasses">
            @for (row of rows(); track row.value) {
              <div [uiSelectItem]="row" [attr.class]="itemClasses">
                <span class="absolute right-2 flex size-3.5 items-center justify-center">
                  @if (row.selected) {
                    <svg uiIcon="check" class="size-4"></svg>
                  }
                </span>
                <span>{{ row.label }}</span>
              </div>
            }
          </div>
        </div>
      </ui-portal>
    `,
  };

  items = input<SelectItem[]>([]);
  /** Two-way: `[(value)]="fruit"`. */
  value = model("");
  placeholder = input<string>("Select...");
  disabled = input<boolean>(false);
  /** Accessible name for the trigger (`aria-label`). Without it, and without `labelledBy`, the trigger is named by its text (the selected label or the placeholder). */
  label = input<string>("");
  /** Id of the element that labels the trigger (`aria-labelledby`). */
  labelledBy = input<string>("");
  /** Extra classes for the trigger button; they win over the defaults (`w-full`). */
  triggerClass = input<string>("");
  triggerClasses = computed(() => cn(TRIGGER, this.triggerClass()));

  contentClasses = CONTENT;
  itemClasses = ITEM;

  select = inject(SelectState).bind(() => ({
    collection: selectCollection(this.items()),
    value: this.value() ? [this.value()] : [],
    onValueChange: (details) => this.value.set(details.value[0] ?? ""),
    disabled: this.disabled(),
    positioning: { placement: "bottom-start", sameWidth: true, offset: { mainAxis: 4 } },
  }));
  /** Zag points `aria-labelledby` at a label part this component does not render, which leaves the button unnamed; use ours, else `label`, else the shown text. */
  triggerProps = computed(() => ({ ...this.select.api().getTriggerProps(), "aria-labelledby": this.labelledBy() || undefined, "aria-label": this.labelledBy() ? undefined : this.label() || this.text() }));
  /** Templates cannot call `getItemState`, so each option's context (selected, highlighted, disabled) is a computed row. */
  rows = computed(() => {
    const api = this.select.api();
    return this.items().map((item) => ({ ...item, ...api.getItemState({ item }) }));
  });
  text = computed(() => this.select.api().valueAsString || this.placeholder());
}
