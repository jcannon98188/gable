import { computed, html, injectHost, input, model, output } from "@gable/core";
import type { Placement } from "../lib/placement.js";
import { UiButton } from "./button.js";
import { UiCommand, type CommandItem } from "./command.js";
import { PopoverTrigger, UiPopover } from "./popover.js";

/**
 * A binding picker: a button that opens a popover with a searchable list of typed signals (a `ui-command` in a `ui-popover`).
 *
 *   <ui-binding-picker [items]="signals" [(value)]="bound" placeholder="Bind to..." (picked)="bind($event)"></ui-binding-picker>
 *
 * `items` are command items; give each a `badge` for its type tag (`{ value: "count", label: "count", badge: "number" }`; the tag is
 * searchable). The button shows the chosen item's label (or `placeholder`). Choosing an item closes the popover, returns focus to
 * the button, sets `value` and fires `picked` with the item's value. Escape and an outside click close it without choosing.
 */
export class UiBindingPicker {
  static meta = {
    selector: "ui-binding-picker",
    host: { class: "inline-block" },
    imports: [UiPopover, PopoverTrigger, UiButton, UiCommand],
    template: html`
      <ui-popover [(open)]="open" [placement]="placement()" [label]="label()" contentClass="w-72 p-0">
        <button slot="trigger" popoverTrigger uiButton variant="outline" type="button" [attr.class]="triggerClass()">
          {{ text() }}
        </button>
        <ui-command [items]="items()" [label]="label()" [placeholder]="searchPlaceholder()" [emptyText]="emptyText()" [(query)]="query" (selected)="choose($event)"></ui-command>
      </ui-popover>
    `,
  };

  items = input<CommandItem[]>([]);
  /** Two-way: the value of the bound item, or null. */
  value = model<string | null>(null);
  /** Two-way: whether the popover is open. */
  open = model(false);
  /** The button's text while nothing is bound. */
  placeholder = input<string>("Bind to...");
  /** Accessible name of the popover and its list. */
  label = input<string>("Bind to a signal");
  searchPlaceholder = input<string>("Search signals...");
  emptyText = input<string>("No signals found.");
  placement = input<Placement>("bottom-start");
  triggerClass = input<string>("w-full justify-between font-mono");
  /** Fires with the value of the item the user chose. */
  picked = output<string>();

  query = model("");
  text = computed(() => this.items().find((i) => i.value === this.value())?.label ?? this.placeholder());

  choose(value: string): void {
    this.value.set(value);
    this.picked.emit(value);
    this.query.set("");
    this.open.set(false);
    this.restoreFocus();
  }

  private host = injectHost();

  /** Zag restores focus on its own close paths (Escape, outside press); a programmatic close needs the trigger focused here. */
  private restoreFocus(): void {
    const host = this.host.host as { querySelector?(selector: string): { focus?(): void } | null };
    queueMicrotask(() => host.querySelector?.("[aria-haspopup]")?.focus?.());
  }
}
