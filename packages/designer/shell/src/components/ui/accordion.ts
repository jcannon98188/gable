import { computed, contentChildren, effect, html, inject, input, model, signal } from "@gable/core";
import { AccordionState, UiPopup, UiProps, bindProps } from "@gable/ui-primitives";
import { UiIcon } from "../../lib/ui/icon.js";

/**
 * One section of `<ui-accordion>`: `<ui-accordion-item value="a" label="Is it accessible?">Yes.</ui-accordion-item>`.
 * The accordion hands it its machine state (projected content is injected from the component that declares it, so an item
 * cannot inject the state itself), the same owner push `<ui-tab>` uses.
 */
export class UiAccordionItem {
  static meta = {
    selector: "ui-accordion-item",
    host: { class: "block border-b last:border-b-0" },
    imports: [UiProps, UiPopup, UiIcon],
    template: html`
      <div [uiProps]="itemProps()">
        <h3 class="flex">
          <button
            [uiProps]="triggerProps()"
            class="flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180"
          >
            {{ label() }}
            <svg uiIcon="chevron-down" class="pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-200"></svg>
          </button>
        </h3>
        <div [uiPopup]="contentProps()" [popupOpen]="expanded()" class="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div class="pt-0 pb-4"><slot></slot></div>
        </div>
      </div>
    `,
  };
  value = input<string>("");
  label = input<string>("");
  disabled = input<boolean>(false);
  owner = signal<AccordionState | null>(null);

  private part = <T>(read: (owner: AccordionState, props: { value: string; disabled: boolean }) => T) =>
    computed(() => {
      const owner = this.owner();
      return owner && this.value() ? read(owner, { value: this.value(), disabled: this.disabled() }) : null;
    });
  itemProps = this.part((o, p) => o.api().getItemProps(p));
  triggerProps = this.part((o, p) => o.api().getItemTriggerProps(p));
  contentProps = this.part((o, p) => o.api().getItemContentProps(p));
  expanded = computed(() => {
    const owner = this.owner();
    return owner ? owner.api().getItemState({ value: this.value() }).expanded : false;
  });
  item = computed(() => ({ value: this.value(), disabled: this.disabled() }));
}

/**
 * An accordion.
 *
 *   <ui-accordion [(value)]="open" type="single" [collapsible]="true">
 *     <ui-accordion-item value="a" label="Is it accessible?">Yes. It follows the WAI-ARIA pattern.</ui-accordion-item>
 *     <ui-accordion-item value="b" label="Is it styled?">Yes.</ui-accordion-item>
 *   </ui-accordion>
 *
 * `value` is the list of open items. `type="multiple"` lets several be open; with `single` (the default), `collapsible`
 * allows closing the open one. Arrow keys, Home and End move between triggers.
 */
export class UiAccordion {
  static meta = { selector: "ui-accordion", host: { class: "block w-full" }, providers: [AccordionState], template: html`<slot></slot>` };
  /** Two-way: `[(value)]="open"`. */
  value = model<string[]>([]);
  type = input<"single" | "multiple">("single");
  collapsible = input<boolean>(true);
  disabled = input<boolean>(false);

  state = inject(AccordionState).bind(() => ({
    value: this.value(),
    onValueChange: (details) => this.value.set(details.value),
    multiple: this.type() === "multiple",
    collapsible: this.collapsible(),
    disabled: this.disabled(),
  }));
  private root = bindProps(() => this.state.api().getRootProps());
  items = contentChildren(UiAccordionItem);
  private link = effect(() => {
    for (const item of this.items()) item.owner.set(this.state);
  });
}
