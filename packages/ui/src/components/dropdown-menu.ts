import { type ComponentMeta, computed, contentChild, effect, html, inject, input, model, output, signal, untracked } from "@gable/core";
import { MenuState, UiPopup, UiPortal, UiProps, bindProps, type PropBag } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";
import type { Placement } from "../lib/placement.js";
import type { InputDensity } from "./input.js";

/** An option of a radio group in a menu. */
export interface MenuRadioItem {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * One line of a menu. Items are data (see docs/ui-items.md): a plain item, a checkbox item, a radio group (one line per
 * option, `value` is the chosen one), a submenu (its own `entries`), a heading or a separator. Values must be unique
 * across the whole menu, submenus included.
 */
export type MenuEntry =
  | { type?: "item"; value: string; label: string; disabled?: boolean; destructive?: boolean; shortcut?: string }
  | { type: "checkbox"; value: string; label: string; checked: boolean; disabled?: boolean; shortcut?: string }
  | { type: "radio-group"; name: string; label: string; value: string; items: MenuRadioItem[] }
  | { type: "submenu"; value: string; label: string; entries: MenuEntry[]; disabled?: boolean }
  | { type: "label"; label: string }
  | { type: "separator" };

/** The Tailwind classes of a menu panel (popover surface, border, enter and exit animation), shared by the dropdown and context menus. Reuse it to style a custom menu panel the same way. */
export const MENU_CONTENT =
  "z-50 max-h-(--available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

const ITEM =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";
/** Added to the item classes in the compact density (24px rows, 12px text); `cn` lets it win over the defaults. */
const COMPACT_ITEM = "min-h-6 py-0.5 text-xs";
const COMPACT_LABEL = "px-2 py-1 text-xs font-medium";
const SUB_TRIGGER = cn(ITEM, "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground");
const DESTRUCTIVE = "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive dark:data-[highlighted]:bg-destructive/20";

/** A rendered line: the template cannot call prop getters, so every part is precomputed; `kind` picks the markup. */
export interface MenuRow {
  key: string;
  disabled: boolean;
  kind: "item" | "checkbox" | "radio-group" | "submenu" | "label" | "separator";
  label: string;
  shortcut: string;
  checked: boolean;
  props: PropBag | null;
  indicatorProps: PropBag | null;
  /** The label element of a radio group. */
  labelProps: PropBag | null;
  /** The options of a radio group: rows with props, indicatorProps, checked and classes. */
  options: MenuRow[];
  /** The entries of a submenu. */
  entries: MenuEntry[];
  classes: string;
}

/**
 * Turns entries into rows for `@for`. `onCheckedChange` is called when a checkbox entry is toggled and `onRadioChange` when
 * a radio option is chosen: the entries are data, so the owner updates them (and the rows follow). Used by the dropdown,
 * the context menu and submenus.
 */
export function menuRows(
  entries: MenuEntry[],
  api: ReturnType<MenuState["api"]>,
  onCheckedChange: (value: string, checked: boolean) => void,
  onRadioChange: (group: string, value: string) => void = () => {},
  density: InputDensity = "default",
): MenuRow[] {
  const compact = density === "compact";
  const item = compact ? cn(ITEM, COMPACT_ITEM) : ITEM;
  const label = compact ? COMPACT_LABEL : "px-2 py-1.5 text-sm font-medium";
  return entries.map((entry, index) => {
    const base: MenuRow = {
      key: entry.type === "radio-group" ? `group-${entry.name}` : "value" in entry ? entry.value : `${entry.type}-${index}`,
      disabled: entry.type === "submenu" ? !!entry.disabled : false,
      kind: "item",
      label: "label" in entry ? entry.label : "",
      shortcut: "shortcut" in entry ? (entry.shortcut ?? "") : "",
      checked: false,
      props: null,
      indicatorProps: null,
      labelProps: null,
      options: [],
      entries: [],
      classes: "",
    };
    if (entry.type === "separator") return { ...base, kind: "separator", props: api.getSeparatorProps(), classes: "-mx-1 my-1 h-px bg-border" };
    if (entry.type === "label") return { ...base, kind: "label", classes: label };
    if (entry.type === "submenu") return { ...base, kind: "submenu", entries: entry.entries };
    if (entry.type === "radio-group") {
      const options = entry.items.map((item): MenuRow => {
        const option = { type: "radio" as const, value: item.value, checked: item.value === entry.value, disabled: item.disabled, onCheckedChange: () => onRadioChange(entry.name, item.value) };
        return { ...base, key: item.value, label: item.label, checked: option.checked, props: api.getOptionItemProps(option), indicatorProps: api.getItemIndicatorProps(option), classes: cn(item, "pr-2 pl-8") };
      });
      return { ...base, kind: "radio-group", options, props: api.getItemGroupProps({ id: entry.name }), labelProps: api.getItemGroupLabelProps({ htmlFor: entry.name }), classes: label };
    }
    if (entry.type === "checkbox") {
      const option = { type: "checkbox" as const, value: entry.value, checked: entry.checked, disabled: entry.disabled, onCheckedChange: (checked: boolean) => onCheckedChange(entry.value, checked) };
      return { ...base, kind: "checkbox", checked: entry.checked, props: api.getOptionItemProps(option), indicatorProps: api.getItemIndicatorProps(option), classes: cn(item, "pr-2 pl-8") };
    }
    return { ...base, kind: "item", props: api.getItemProps({ value: entry.value, disabled: entry.disabled, valueText: entry.label }), classes: cn(item, entry.destructive && DESTRUCTIVE) };
  });
}

/**
 * The lines of a menu or submenu, rendered from entries. The dropdown, the context menu and every submenu use this one
 * component for their panel contents, so the row markup lives here only. It renders a `ui-menu-sub` for a submenu entry,
 * and `ui-menu-sub` renders `ui-menu-rows` for its own entries: the two reference each other, so `UiMenuSub` is added to
 * this component's imports after both classes exist. Internal: not used on its own.
 */
export class UiMenuRows {
  static meta: ComponentMeta = {
    selector: "ui-menu-rows",
    host: { class: "contents", role: "none" },
    imports: [UiProps, UiIcon],
    template: html`
      @for (row of rows(); track row.key) {
        @if (row.kind === 'separator') {
          <div [uiProps]="row.props" [attr.class]="row.classes"></div>
        }
        @if (row.kind === 'label') {
          <div [attr.class]="row.classes">{{ row.label }}</div>
        }
        @if (row.kind === 'item') {
          <div [uiProps]="row.props" [attr.class]="row.classes">
            {{ row.label }}
            @if (row.shortcut) {
              <span class="ml-auto text-xs tracking-widest text-muted-foreground">{{ row.shortcut }}</span>
            }
          </div>
        }
        @if (row.kind === 'checkbox') {
          <div [uiProps]="row.props" [attr.class]="row.classes">
            <span [uiProps]="row.indicatorProps" class="absolute left-2 flex size-3.5 items-center justify-center"><svg uiIcon="check" class="size-4"></svg></span>
            {{ row.label }}
          </div>
        }
        @if (row.kind === 'radio-group') {
          <div [uiProps]="row.props">
            <div [uiProps]="row.labelProps" [attr.class]="row.classes">{{ row.label }}</div>
            @for (option of row.options; track option.key) {
              <div [uiProps]="option.props" [attr.class]="option.classes">
                <span [uiProps]="option.indicatorProps" class="absolute left-2 flex size-3.5 items-center justify-center"><svg uiIcon="circle" class="size-2 fill-current"></svg></span>
                {{ option.label }}
              </div>
            }
          </div>
        }
        @if (row.kind === 'submenu') {
          <ui-menu-sub [parent]="state()" [value]="row.key" [label]="row.label" [disabled]="row.disabled" [entries]="row.entries" [density]="density()" (selected)="selected.emit($event)" (checkedChange)="checkedChange.emit($event)" (radioChange)="radioChange.emit($event)"></ui-menu-sub>
        }
      }
    `,
  };

  /** The menu these lines belong to. */
  state = input<MenuState | null>(null);
  entries = input<MenuEntry[]>([]);
  density = input<InputDensity>("default");
  selected = output<string>();
  checkedChange = output<{ value: string; checked: boolean }>();
  radioChange = output<{ group: string; value: string }>();
  rows = computed(() => {
    const state = this.state();
    if (!state) return [];
    return menuRows(
      this.entries(),
      state.api(),
      (value, checked) => this.checkedChange.emit({ value, checked }),
      (group, value) => this.radioChange.emit({ group, value }),
      this.density(),
    );
  });
}

/**
 * A submenu inside a menu: the trigger line (with a chevron) and its own panel. The menus render it for a `submenu` entry;
 * it is not used on its own. ArrowRight (or Enter) on the trigger opens it, ArrowLeft or Escape closes it and returns to
 * the trigger. A `disabled` submenu entry shows a dimmed line that cannot be highlighted or opened. Its outputs bubble up
 * to the root menu's outputs.
 */
export class UiMenuSub {
  static meta: ComponentMeta = {
    selector: "ui-menu-sub",
    host: { class: "contents", role: "none" },
    providers: [MenuState],
    imports: [UiPortal, UiPopup, UiProps, UiIcon, UiMenuRows],
    template: html`
      <div [uiProps]="triggerProps()" [attr.class]="triggerClasses()">
        {{ label() }}
        <svg uiIcon="chevron-right" class="ml-auto size-4"></svg>
      </div>
      <ui-portal>
        <div [uiProps]="positionerProps()">
          <div [uiPopup]="contentProps()" [popupOpen]="open()" [attr.class]="contentClasses">
            <ui-menu-rows [state]="state" [entries]="entries()" [density]="density()" (selected)="selected.emit($event)" (checkedChange)="checkedChange.emit($event)" (radioChange)="radioChange.emit($event)"></ui-menu-rows>
          </div>
        </div>
      </ui-portal>
    `,
  };

  /** The menu this one opens from. */
  parent = input<MenuState | null>(null);
  /** The submenu entry's value (its id among the parent's items). */
  value = input<string>("");
  label = input<string>("");
  disabled = input<boolean>(false);
  entries = input<MenuEntry[]>([]);
  density = input<InputDensity>("default");
  selected = output<string>();
  checkedChange = output<{ value: string; checked: boolean }>();
  radioChange = output<{ group: string; value: string }>();
  triggerClasses = computed(() => (this.density() === "compact" ? cn(SUB_TRIGGER, COMPACT_ITEM) : SUB_TRIGGER));
  contentClasses = MENU_CONTENT;

  state = inject(MenuState).bind(() => ({
    onSelect: (details) => this.selected.emit(details.value),
    positioning: { placement: "right-start" as const, offset: { mainAxis: 2, crossAxis: -4 } },
  }));
  open = computed(() => this.state.api().open);
  triggerProps = computed(() => {
    const parent = this.parent()?.api();
    if (!parent) return null;
    // Disabled: a plain disabled item of the parent (skipped by arrow keys and typeahead, never opens the child).
    if (this.disabled()) return { ...parent.getItemProps({ value: this.value(), disabled: true, valueText: this.label() }), "aria-haspopup": "menu" } as PropBag;
    return parent.getTriggerItemProps(this.state.api());
  });
  positionerProps = computed(() => this.state.api().getPositionerProps());
  contentProps = computed(() => this.state.api().getContentProps());
  private link = effect(() => {
    const parent = this.parent();
    if (!parent) return;
    untracked(() => {
      parent.api().setChild(this.state.binding.service);
      this.state.api().setParent(parent.binding.service);
    });
  });
}
(UiMenuRows.meta.imports as unknown[]).push(UiMenuSub);

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
 * `entries` is data (submenus and radio groups included: `{ type: "submenu", value, label, entries }`,
 * `{ type: "radio-group", name, label, value, items }`; `radioChange` emits `{ group, value }`): `{ value, label, shortcut?, disabled?, destructive? }` items, `{ type: "checkbox", value, label, checked }`,
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
    imports: [UiPortal, UiPopup, UiProps, UiMenuRows],
    template: html`
      <slot name="trigger"></slot>
      <ui-portal>
        <div [uiProps]="positionerProps()">
          <div [uiPopup]="contentProps()" [popupOpen]="open()" [attr.class]="contentClasses()">
            <ui-menu-rows [state]="state" [entries]="entries()" [density]="density()" (selected)="selected.emit($event)" (checkedChange)="checkedChange.emit($event)" (radioChange)="radioChange.emit($event)"></ui-menu-rows>
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
  /** `"compact"` is the dense variant: 24px rows and 12px text, submenus included. */
  density = input<InputDensity>("default");
  /** The value of the chosen item. */
  selected = output<string>();
  /** A checkbox item was toggled. */
  checkedChange = output<{ value: string; checked: boolean }>();
  /** A radio option was chosen: set the group's `value` in your data. */
  radioChange = output<{ group: string; value: string }>();
  contentClasses = computed(() => cn(MENU_CONTENT, this.contentClass()));

  state = inject(MenuState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
    onSelect: (details) => this.selected.emit(details.value),
    positioning: { placement: this.placement(), offset: { mainAxis: 4 } },
  }));
  positionerProps = computed(() => this.state.api().getPositionerProps());
  contentProps = computed(() => this.state.api().getContentProps());
  trigger = contentChild(MenuTrigger);
  private link = effect(() => this.trigger()?.owner.set(this.state));
}
