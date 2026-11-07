import { computed, html, inject, input, model, output, signal } from "@gable/core";
import { ComboboxState, UiPopup, UiPortal, UiProps } from "@gable/ui-primitives";
import * as combobox from "@zag-js/combobox";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";

/** One option of a combobox: items are data, like Select's options. */
export interface ComboboxItem {
  value: string;
  label: string;
  disabled?: boolean;
}

const INPUT =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent py-1 pr-9 pl-3 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm dark:bg-input/30 " +
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";
const CONTENT =
  "z-50 max-h-(--available-height) min-w-(--reference-width) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";
const ITEM =
  "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

/**
 * A combobox: a text input that filters a list of options, and picks one.
 *
 *   <ui-combobox [items]="frameworks" [(value)]="framework" placeholder="Search frameworks..."></ui-combobox>
 *
 * `items` is `{ value, label, disabled? }` data; `value` is the chosen item's value or an empty string (the model, so
 * `[field]` works). Typing filters by label (case-insensitive substring); arrow keys highlight, Enter picks, Escape closes.
 * It uses real DOM APIs (`CSS.escape`, focus), so it is tested in jsdom.
 */
export class UiCombobox {
  static meta = {
    selector: "ui-combobox",
    host: { class: "block" },
    providers: [ComboboxState],
    imports: [UiPortal, UiPopup, UiProps, UiIcon],
    template: html`
      <div [uiProps]="rootProps()" class="relative">
        <div [uiProps]="controlProps()" class="relative">
          <input [uiProps]="inputProps()" [attr.class]="inputClasses()" [attr.placeholder]="placeholder()" (blur)="touched.emit()" />
          <button [uiProps]="triggerProps()" class="absolute top-0 right-0 flex h-9 w-9 items-center justify-center text-muted-foreground outline-none disabled:opacity-50">
            <svg uiIcon="chevrons-up-down" class="size-4 opacity-50"></svg>
          </button>
        </div>
      </div>
      <ui-portal>
        <div [uiProps]="positionerProps()">
          <ul [uiPopup]="contentProps()" [popupOpen]="open()" [attr.class]="contentClasses">
            @for (row of rows(); track row.value) {
              <li [uiProps]="row.props" [attr.class]="itemClasses">
                <span>{{ row.label }}</span>
                @if (row.selected) {
                  <svg uiIcon="check" class="absolute right-2 size-4"></svg>
                }
              </li>
            } @empty {
              <li class="py-6 text-center text-sm text-muted-foreground">{{ emptyText() }}</li>
            }
          </ul>
        </div>
      </ui-portal>
    `,
  };

  items = input<ComboboxItem[]>([]);
  /** Two-way: `[(value)]="framework"`. */
  value = model("");
  placeholder = input<string>("Search...");
  emptyText = input<string>("No results found.");
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  invalid = input<boolean>(false);
  class = input<string>("");
  touched = output();

  contentClasses = CONTENT;
  itemClasses = ITEM;
  inputClasses = computed(() => cn(INPUT, this.class()));
  open = signal(false);
  /** What the user typed since the last pick; the list is filtered by it (an empty query shows everything). */
  query = signal("");
  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.items().filter((item) => item.label.toLowerCase().includes(q)) : this.items();
  });

  state = inject(ComboboxState).bind(() => ({
    collection: combobox.collection({ items: this.filtered() }),
    value: this.value() ? [this.value()] : [],
    onValueChange: (details) => this.value.set(details.value[0] ?? ""),
    onInputValueChange: (details) => this.query.set(details.reason === "input-change" ? details.inputValue : ""),
    onOpenChange: (details) => this.open.set(details.open),
    openOnClick: true,
    disabled: this.disabled(),
    readOnly: this.readonly(),
    invalid: this.invalid(),
    positioning: { placement: "bottom-start", sameWidth: true, offset: { mainAxis: 4 } },
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  controlProps = computed(() => this.state.api().getControlProps());
  inputProps = computed(() => this.state.api().getInputProps());
  triggerProps = computed(() => this.state.api().getTriggerProps());
  positionerProps = computed(() => this.state.api().getPositionerProps());
  contentProps = computed(() => this.state.api().getContentProps());
  rows = computed(() => {
    const api = this.state.api();
    return this.filtered().map((item) => ({ ...item, props: api.getItemProps({ item }), selected: api.getItemState({ item }).selected }));
  });
}

const MULTI_CONTROL =
  "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent py-1 pr-9 pl-2 text-base shadow-xs transition-[color,box-shadow] md:text-sm dark:bg-input/30 " +
  "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
const MULTI_INPUT = "min-w-16 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed";
const CHIP = "inline-flex items-center gap-1 rounded-sm bg-secondary py-0.5 pr-0.5 pl-2 text-xs font-medium text-secondary-foreground";

/**
 * A multi-select combobox: the single combobox's input and list, with the picked options shown as removable chips.
 *
 *   <ui-multi-combobox [items]="frameworks" [(value)]="picked" placeholder="Add frameworks..."></ui-multi-combobox>
 *
 * `items` is `{ value, label, disabled? }` data; `value` is the array of picked values (the model, so `[field]` works with an
 * array value). Typing filters the list, Enter (or a click) toggles the highlighted option and the list stays open;
 * each chip has a remove button, and Backspace in the empty input removes the last chip. It reuses the combobox machine
 * (`multiple`), so arrow keys, highlighting and Escape are the same as the single combobox.
 */
export class UiMultiCombobox {
  static meta = {
    selector: "ui-multi-combobox",
    host: { class: "block" },
    providers: [ComboboxState],
    imports: [UiPortal, UiPopup, UiProps, UiIcon],
    template: html`
      <div [uiProps]="rootProps()" class="relative">
        <div [uiProps]="controlProps()" [attr.class]="controlClasses()" [attr.aria-disabled]="ariaDisabled()">
          @for (chip of chips(); track chip.value) {
            <span data-chip [attr.class]="chipClasses">
              {{ chip.label }}
              <button
                type="button"
                data-chip-remove
                tabindex="-1"
                [attr.aria-label]="chip.removeLabel"
                [attr.disabled]="chip.locked"
                class="flex size-4 items-center justify-center rounded-sm outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                (click)="remove(chip.value)"
              >
                <svg uiIcon="x" class="size-3"></svg>
              </button>
            </span>
          }
          <input [uiProps]="inputProps()" [attr.class]="inputClasses" [attr.placeholder]="hint()" [attr.aria-label]="label()" (blur)="touched.emit()" (keydown)="onKeydown($event)" />
          <button [uiProps]="triggerProps()" class="absolute top-0 right-0 flex h-9 w-9 items-center justify-center text-muted-foreground outline-none disabled:opacity-50">
            <svg uiIcon="chevrons-up-down" class="size-4 opacity-50"></svg>
          </button>
        </div>
      </div>
      <ui-portal>
        <div [uiProps]="positionerProps()">
          <ul [uiPopup]="contentProps()" [popupOpen]="open()" [attr.class]="contentClasses">
            @for (row of rows(); track row.value) {
              <li [uiProps]="row.props" [attr.class]="itemClasses">
                <span>{{ row.label }}</span>
                @if (row.selected) {
                  <svg uiIcon="check" class="absolute right-2 size-4"></svg>
                }
              </li>
            } @empty {
              <li class="py-6 text-center text-sm text-muted-foreground">{{ emptyText() }}</li>
            }
          </ul>
        </div>
      </ui-portal>
    `,
  };

  items = input<ComboboxItem[]>([]);
  /** Two-way: `[(value)]="picked"`, the picked values in the order they were picked. */
  value = model<string[]>([]);
  placeholder = input<string>("Search...");
  /** Accessible name of the input. */
  label = input<string>("");
  emptyText = input<string>("No results found.");
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  invalid = input<boolean>(false);
  class = input<string>("");
  touched = output();

  contentClasses = CONTENT;
  itemClasses = ITEM;
  chipClasses = CHIP;
  inputClasses = MULTI_INPUT;
  controlClasses = computed(() => cn(MULTI_CONTROL, this.invalid() && "border-destructive ring-destructive/20", this.class()));
  ariaDisabled = computed(() => (this.disabled() ? "true" : null));
  open = signal(false);
  query = signal("");
  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.items().filter((item) => item.label.toLowerCase().includes(q)) : this.items();
  });
  /** The placeholder shows only while nothing is picked. */
  hint = computed(() => (this.value().length ? "" : this.placeholder()));
  chips = computed(() => {
    const items = this.items();
    const locked = this.disabled() || this.readonly() ? "" : null;
    return this.value().map((value) => {
      const label = items.find((item) => item.value === value)?.label ?? value;
      return { value, label, removeLabel: `Remove ${label}`, locked };
    });
  });

  state = inject(ComboboxState).bind(() => ({
    collection: combobox.collection({ items: this.filtered() }),
    value: [...this.value()],
    multiple: true,
    closeOnSelect: false,
    selectionBehavior: "clear" as const,
    onValueChange: (details) => this.value.set([...details.value]),
    onInputValueChange: (details) => this.query.set(details.reason === "input-change" ? details.inputValue : ""),
    onOpenChange: (details) => this.open.set(details.open),
    openOnClick: true,
    disabled: this.disabled(),
    readOnly: this.readonly(),
    invalid: this.invalid(),
    positioning: { placement: "bottom-start", sameWidth: true, offset: { mainAxis: 4 } },
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  controlProps = computed(() => this.state.api().getControlProps());
  inputProps = computed(() => this.state.api().getInputProps());
  triggerProps = computed(() => this.state.api().getTriggerProps());
  positionerProps = computed(() => this.state.api().getPositionerProps());
  contentProps = computed(() => this.state.api().getContentProps());
  rows = computed(() => {
    const api = this.state.api();
    return this.filtered().map((item) => ({ ...item, props: api.getItemProps({ item }), selected: api.getItemState({ item }).selected }));
  });

  remove(value: string): void {
    if (this.disabled() || this.readonly()) return;
    this.value.set(this.value().filter((v) => v !== value));
  }

  /** Backspace in an empty input removes the last chip. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Backspace" || this.disabled() || this.readonly()) return;
    const input = event.target as HTMLInputElement | null;
    if (input && input.value !== "") return;
    const picked = this.value();
    if (picked.length) this.value.set(picked.slice(0, -1));
  }
}
