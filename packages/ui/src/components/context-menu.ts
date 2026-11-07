import { computed, html, inject, input, model, output } from "@gable/core";
import { MenuState, UiPopup, UiPortal, UiProps, bindProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import type { InputDensity } from "./input.js";
import { MENU_CONTENT, UiMenuRows, type MenuEntry } from "./dropdown-menu.js";

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
    imports: [UiPortal, UiPopup, UiProps, UiMenuRows],
    template: html`
      <slot></slot>
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
  contentClass = input<string>("");
  /** `"compact"` is the dense variant: 24px rows and 12px text. */
  density = input<InputDensity>("default");
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
}
