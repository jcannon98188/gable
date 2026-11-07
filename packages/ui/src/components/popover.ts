import { computed, contentChild, effect, html, inject, input, model, signal } from "@gable/core";
import { PopoverState, UiPopoverContent, UiPopoverPositioner, UiPortal, bindProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import type { Placement } from "../lib/placement.js";

const CONTENT =
  "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 " +
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";

/**
 * Marks the element that toggles a popover: `<button slot="trigger" popoverTrigger uiButton>Open</button>`.
 * Like `DialogTrigger`, the popover hands its machine state to it (projected content cannot inject it).
 */
export class PopoverTrigger {
  static meta = { selector: "[popoverTrigger]" };
  owner = signal<PopoverState | null>(null);
  private props = bindProps(() => this.owner()?.api().getTriggerProps() ?? null);
}

/**
 * A popover: arbitrary content in a floating panel anchored to a trigger.
 *
 *   <ui-popover [(open)]="open" placement="bottom-start">
 *     <button slot="trigger" popoverTrigger uiButton variant="outline">Dimensions</button>
 *     ...the panel's content...
 *   </ui-popover>
 *
 * Positioned with Zag (flips and shifts to stay on screen); Escape and an outside click close it and focus returns to the
 * trigger. `data-state` and `data-side` on the panel drive the animation.
 */
export class UiPopover {
  static meta = {
    selector: "ui-popover",
    providers: [PopoverState],
    imports: [UiPortal, UiPopoverPositioner, UiPopoverContent],
    template: html`
      <slot name="trigger"></slot>
      <ui-portal>
        <div uiPopoverPositioner>
          <div uiPopoverContent [attr.class]="contentClasses()"><slot></slot></div>
        </div>
      </ui-portal>
    `,
  };

  /** Two-way: `[(open)]="open"`. */
  open = model(false);
  placement = input<Placement>("bottom");
  /** Distance from the trigger in px. */
  offset = input<number>(4);
  /** Extra classes for the panel; they win over the defaults (`w-72`). */
  contentClass = input<string>("");
  contentClasses = computed(() => cn(CONTENT, this.contentClass()));

  state = inject(PopoverState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
    positioning: { placement: this.placement(), offset: { mainAxis: this.offset() } },
  }));
  trigger = contentChild(PopoverTrigger);
  private link = effect(() => this.trigger()?.owner.set(this.state));
}
