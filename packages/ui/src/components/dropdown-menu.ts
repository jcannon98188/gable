import { computed, contentChild, effect, html, inject, input, model, output, signal } from "@gable/core";
import { MenuState, UiPopup, UiPortal, UiProps, bindProps, type PropBag } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";
import type { Placement } from "../lib/placement.js";

/** One line of a menu. Items are data (see docs/ui-items.md): a plain item, a checkbox item, a heading or a separator. */
export type MenuEntry =
  | { type?: "item"; value: string; label: string; disabled?: boolean; destructive?: boolean; shortcut?: string }
  | { type: "checkbox"; value: string; label: string; checked: boolean; disabled?: boolean; shortcut?: string }
  | { type: "label"; label: string }
  | { type: "separator" };

export const MENU_CONTENT =
  "z-50 max-h-(--available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

const ITEM =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";
const DESTRUCTIVE = "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive dark:data-[highlighted]:bg-destructive/20";

// TODO(TASK-36): with `===` in templates the isItem/isCheckbox/isLabel/isSeparator flags could be a single `kind` compared in `@if`.
/** A rendered line: the template cannot call prop getters or compare, so every part and flag is precomputed. */
export interface MenuRow {
  key: string;
  isItem: boolean;
  isCheckbox: boolean;
  isLabel: boolean;
  isSeparator: boolean;
  label: string;
  shortcut: string;
  checked: boolean;
  props: PropBag | null;
  indicatorProps: PropBag | null;
  classes: string;
}

/**
 * Turns entries into rows for `@for`. `onCheckedChange` is called when a checkbox entry is toggled: the entries are data,
 * so the owner updates them (and the rows follow). Used by the dropdown and the context menu.
 */
export function menuRows(entries: MenuEntry[], api: ReturnType<MenuState["api"]>, onCheckedChange: (value: string, checked: boolean) => void): MenuRow[] {
  return entries.map((entry, index) => {
    const base: MenuRow = {
      key: "value" in entry ? entry.value : `${entry.type}-${index}`,
      isItem: false,
      isCheckbox: false,
      isLabel: false,
      isSeparator: false,
      label: "label" in entry ? entry.label : "",
      shortcut: "shortcut" in entry ? (entry.shortcut ?? "") : "",
      checked: false,
      props: null,
      indicatorProps: null,
      classes: "",
    };
    if (entry.type === "separator") return { ...base, isSeparator: true, props: api.getSeparatorProps(), classes: "-mx-1 my-1 h-px bg-border" };
    if (entry.type === "label") return { ...base, isLabel: true, classes: "px-2 py-1.5 text-sm font-medium" };
    if (entry.type === "checkbox") {
      const option = { type: "checkbox" as const, value: entry.value, checked: entry.checked, disabled: entry.disabled, onCheckedChange: (checked: boolean) => onCheckedChange(entry.value, checked) };
      return { ...base, isCheckbox: true, checked: entry.checked, props: api.getOptionItemProps(option), indicatorProps: api.getItemIndicatorProps(option), classes: cn(ITEM, "pr-2 pl-8") };
    }
    return { ...base, isItem: true, props: api.getItemProps({ value: entry.value, disabled: entry.disabled, valueText: entry.label }), classes: cn(ITEM, entry.destructive && DESTRUCTIVE) };
  });
}

/** Marks the element that opens a dropdown menu: `<button slot="trigger" menuTrigger uiButton>Open</button>`. */
export class MenuTrigger {
  static meta = { selector: "[menuTrigger]" };
  owner = signal<MenuState | null>(null);
  private props = bindProps(() => this.owner()?.api().getTriggerProps() ?? null);
}

/**
 * A dropdown menu.
 *
 *   <ui-dropdown-menu [entries]="entries" (selected)="run($event)" (checkedChange)="toggle($event)">
 *     <button slot="trigger" menuTrigger uiButton variant="outline">Open</button>
 *   </ui-dropdown-menu>
 *
 * `entries` is data: `{ value, label, shortcut?, disabled?, destructive? }` items, `{ type: "checkbox", value, label, checked }`,
 * `{ type: "label", label }` and `{ type: "separator" }`. `selected` emits an item's value; `checkedChange` emits
 * `{ value, checked }` for a checkbox item (update its `checked` in your data). Arrow keys, Home/End, typeahead and
 * Enter work as in a native menu; Escape and an outside click close it and focus returns to the trigger.
 * The menu reads its items from the DOM, so it needs a browser (jsdom in tests).
 */
export class UiDropdownMenu {
  static meta = {
    selector: "ui-dropdown-menu",
    host: { class: "inline-block" },
    providers: [MenuState],
    imports: [UiPortal, UiPopup, UiProps, UiIcon],
    template: html`
      <slot name="trigger"></slot>
      <ui-portal>
        <div [uiProps]="positionerProps()">
          <div [uiPopup]="contentProps()" [popupOpen]="open()" [attr.class]="contentClasses()">
            @for (row of rows(); track row.key) {
              @if (row.isSeparator) {
                <div [uiProps]="row.props" [attr.class]="row.classes"></div>
              }
              @if (row.isLabel) {
                <div [attr.class]="row.classes">{{ row.label }}</div>
              }
              @if (row.isItem) {
                <div [uiProps]="row.props" [attr.class]="row.classes">
                  {{ row.label }}
                  @if (row.shortcut) {
                    <span class="ml-auto text-xs tracking-widest text-muted-foreground">{{ row.shortcut }}</span>
                  }
                </div>
              }
              @if (row.isCheckbox) {
                <div [uiProps]="row.props" [attr.class]="row.classes">
                  <span [uiProps]="row.indicatorProps" class="absolute left-2 flex size-3.5 items-center justify-center"><svg uiIcon="check" class="size-4"></svg></span>
                  {{ row.label }}
                </div>
              }
            }
          </div>
        </div>
      </ui-portal>
    `,
  };

  entries = input<MenuEntry[]>([]);
  /** Two-way: `[(open)]="open"`. */
  open = model(false);
  placement = input<Placement>("bottom-start");
  contentClass = input<string>("");
  /** The value of the chosen item. */
  selected = output<string>();
  /** A checkbox item was toggled. */
  checkedChange = output<{ value: string; checked: boolean }>();
  contentClasses = computed(() => cn(MENU_CONTENT, this.contentClass()));

  state = inject(MenuState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
    onSelect: (details) => this.selected.emit(details.value),
    positioning: { placement: this.placement(), offset: { mainAxis: 4 } },
  }));
  positionerProps = computed(() => this.state.api().getPositionerProps());
  contentProps = computed(() => this.state.api().getContentProps());
  rows = computed(() => menuRows(this.entries(), this.state.api(), (value, checked) => this.checkedChange.emit({ value, checked })));
  trigger = contentChild(MenuTrigger);
  private link = effect(() => this.trigger()?.owner.set(this.state));
}
