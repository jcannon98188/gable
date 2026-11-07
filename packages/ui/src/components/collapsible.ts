import { computed, contentChild, effect, html, inject, input, model, signal } from "@gable/core";
import { CollapsibleState, UiPopup, UiProps, bindProps } from "@gable/ui-primitives";

/** Marks the element that toggles a collapsible: `<button slot="trigger" collapsibleTrigger uiButton>Toggle</button>`. */
export class CollapsibleTrigger {
  static meta = { selector: "[collapsibleTrigger]" };
  owner = signal<CollapsibleState | null>(null);
  private props = bindProps(() => this.owner()?.api().getTriggerProps() ?? null);
}

/**
 * A collapsible region.
 *
 *   <ui-collapsible [(open)]="open">
 *     <button slot="trigger" collapsibleTrigger uiButton variant="ghost">Show more</button>
 *     <p>The hidden content.</p>
 *   </ui-collapsible>
 *
 * The trigger gets `aria-expanded` and `aria-controls`; the content animates its height (`animate-accordion-down/up`).
 */
export class UiCollapsible {
  static meta = {
    selector: "ui-collapsible",
    host: { class: "block" },
    providers: [CollapsibleState],
    imports: [UiProps, UiPopup],
    template: html`
      <slot name="trigger"></slot>
      <div [uiProps]="rootProps()">
        <div [uiPopup]="contentProps()" [popupOpen]="open()" class="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"><slot></slot></div>
      </div>
    `,
  };
  /** Two-way: `[(open)]="open"`. */
  open = model(false);
  disabled = input<boolean>(false);

  state = inject(CollapsibleState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
    disabled: this.disabled(),
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  contentProps = computed(() => this.state.api().getContentProps());
  trigger = contentChild(CollapsibleTrigger);
  private link = effect(() => this.trigger()?.owner.set(this.state));
}
