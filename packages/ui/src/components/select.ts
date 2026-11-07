import { computed, effect, html, inject, input, model, output, signal } from "@gable/core";
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
import type { InputDensity } from "./input.js";

export type { SelectItem };

/** What a `ui-select` needs from the `ui-field` around it (structural, so this file does not import form.ts). */
export interface SelectFieldOwner {
  labelId: string;
  label(): string;
  describedBy(): string | undefined;
  hasErrors(): boolean;
  targetId: { set(id: string): void };
}

const TRIGGER =
  "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder-shown]:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50";

/** Per-density size of the trigger and the option rows. */
const DENSITY = {
  default: { trigger: "h-9 px-3 py-2 text-sm", item: "py-1.5 text-sm" },
  compact: { trigger: "h-6.5 px-2 py-0 text-xs", item: "py-0.5 text-xs" },
} as const;

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
      <button [uiProps]="triggerProps()" [attr.class]="triggerClasses()" (blur)="touched.emit()">
        <span uiSelectValueText class="truncate">{{ text() }}</span>
        <svg uiIcon="chevron-down" [class]="chevronClasses()"></svg>
      </button>
      <ui-portal>
        <div uiSelectPositioner>
          <div uiSelectContent [attr.class]="contentClasses">
            @for (row of rows(); track row.value) {
              <div [uiSelectItem]="row" [attr.class]="itemClasses()">
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
  /** Marks the trigger `aria-invalid` and draws the destructive ring; `[field]` fills it. */
  invalid = input<boolean>(false);
  /** Fires when focus leaves the trigger (`[field]` marks the field touched). */
  touched = output();
  /** Set by an enclosing `ui-field` (owner push): names the trigger by the field's label and links its hint and error. */
  fieldOwner = signal<SelectFieldOwner | null>(null);
  /** Extra classes for the trigger button; they win over the defaults (`w-full`). */
  triggerClass = input<string>("");
  /** `"compact"` is the dense variant: a 26px trigger and 12px text. */
  density = input<InputDensity>("default");
  triggerClasses = computed(() => cn(TRIGGER, DENSITY[this.density()].trigger, this.triggerClass()));
  chevronClasses = computed(() => (this.density() === "compact" ? "size-3.5 opacity-50" : "size-4 opacity-50"));

  contentClasses = CONTENT;
  itemClasses = computed(() => cn(ITEM, DENSITY[this.density()].item));

  select = inject(SelectState).bind(() => ({
    collection: selectCollection(this.items()),
    value: this.value() ? [this.value()] : [],
    onValueChange: (details) => this.value.set(details.value[0] ?? ""),
    disabled: this.disabled(),
    positioning: { placement: "bottom-start", sameWidth: true, offset: { mainAxis: 4 } },
  }));
  /** Zag points `aria-labelledby` at a label part this component does not render, which leaves the button unnamed; use ours, else `label`, else the shown text. */
  triggerProps = computed(() => {
    const owner = this.fieldOwner();
    const fieldLabel = owner && owner.label() ? owner.labelId : "";
    const labelledBy = this.labelledBy() || fieldLabel;
    return {
      ...this.select.api().getTriggerProps(),
      "aria-labelledby": labelledBy || undefined,
      "aria-label": labelledBy ? undefined : this.label() || this.text(),
      "aria-describedby": owner?.describedBy(),
      "aria-invalid": this.invalid() || owner?.hasErrors() ? "true" : undefined,
    };
  });
  /** Points a field's label at the trigger. */
  private linkTarget = effect(() => {
    const id = this.select.api().getTriggerProps()["id"];
    if (typeof id === "string") this.fieldOwner()?.targetId.set(id);
  });
  /** Templates cannot call `getItemState`, so each option's context (selected, highlighted, disabled) is a computed row. */
  rows = computed(() => {
    const api = this.select.api();
    return this.items().map((item) => ({ ...item, ...api.getItemState({ item }) }));
  });
  text = computed(() => this.select.api().valueAsString || this.placeholder());
}
