import { computed, html, inject, input, model, output } from "@gable/core";
import { MenuState, UiPopup, UiPortal, UiProps, bindProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";
import { MENU_CONTENT, UiMenuSub, menuRows, type MenuEntry } from "./dropdown-menu.js";

/**
 * A context menu: right-click (or long-press on touch, or the Menu key) inside the element opens it at the pointer.
 *
 *   <ui-context-menu [entries]="entries" (selected)="run($event)" class="block h-40 w-72 rounded-md border border-dashed">
 *     Right click here
 *   </ui-context-menu>
 *
 * The element itself is the trigger area; the menu is the dropdown menu's (same `entries` data, same `selected` and
 * `checkedChange` and `radioChange` outputs, submenus and radio groups included, see `dropdown-menu.ts`), positioned at the pointer.
 */
export class UiContextMenu {
  static meta = {
    selector: "ui-context-menu",
    host: { class: "block" },
    providers: [MenuState],
    imports: [UiPortal, UiPopup, UiProps, UiIcon, UiMenuSub],
    template: html`
      <slot></slot>
      <ui-portal>
        <div [uiProps]="positionerProps()">
          <div [uiPopup]="contentProps()" [popupOpen]="open()" [attr.class]="contentClasses()">
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
                <ui-menu-sub [parent]="state" [label]="row.label" [entries]="row.entries" (selected)="selected.emit($event)" (checkedChange)="checkedChange.emit($event)" (radioChange)="radioChange.emit($event)"></ui-menu-sub>
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
  contentClass = input<string>("");
  selected = output<string>();
  checkedChange = output<{ value: string; checked: boolean }>();
  radioChange = output<{ group: string; value: string }>();
  contentClasses = computed(() => cn(MENU_CONTENT, this.contentClass()));

  state = inject(MenuState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
    onSelect: (details) => this.selected.emit(details.value),
  }));
  private area = bindProps(() => this.state.api().getContextTriggerProps());
  positionerProps = computed(() => this.state.api().getPositionerProps());
  contentProps = computed(() => this.state.api().getContentProps());
  rows = computed(() => menuRows(this.entries(), this.state.api(), (value, checked) => this.checkedChange.emit({ value, checked }), (group, value) => this.radioChange.emit({ group, value })));
}
