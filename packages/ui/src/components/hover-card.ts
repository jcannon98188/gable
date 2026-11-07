import { computed, contentChild, effect, html, inject, input, model, signal } from "@gable/core";
import { HoverCardState, UiPopup, UiPortal, UiProps, bindProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import type { Placement } from "../lib/placement.js";

const CONTENT =
  "z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 " +
  "data-[placement^=bottom]:slide-in-from-top-2 data-[placement^=left]:slide-in-from-right-2 data-[placement^=right]:slide-in-from-left-2 data-[placement^=top]:slide-in-from-bottom-2";

/** Marks the element that opens a hover card on hover or focus: `<a slot="trigger" hoverCardTrigger href="...">@ada</a>`. */
export class HoverCardTrigger {
  static meta = { selector: "[hoverCardTrigger]" };
  owner = signal<HoverCardState | null>(null);
  private props = bindProps(() => this.owner()?.api().getTriggerProps() ?? null);
}

/**
 * A card that previews content while the pointer rests on (or focus is in) the trigger.
 *
 *   <ui-hover-card placement="bottom">
 *     <a slot="trigger" hoverCardTrigger href="/ada">@ada</a>
 *     <p>Ada Lovelace, mathematician.</p>
 *   </ui-hover-card>
 *
 * Opens after `openDelay` ms and closes after `closeDelay` ms (the pointer may move into the card). Hover timers are
 * a DOM effect, so they are tested in jsdom; with `[(open)]` the state can also be driven from outside.
 */
export class UiHoverCard {
  static meta = {
    selector: "ui-hover-card",
    host: { class: "inline-block" },
    providers: [HoverCardState],
    imports: [UiPortal, UiPopup, UiProps],
    template: html`
      <slot name="trigger"></slot>
      <ui-portal>
        <div [uiProps]="positionerProps()">
          <div [uiPopup]="contentProps()" [popupOpen]="open()" [attr.class]="contentClasses()"><slot></slot></div>
        </div>
      </ui-portal>
    `,
  };
  /** Two-way: `[(open)]="open"`. */
  open = model(false);
  placement = input<Placement>("bottom");
  openDelay = input<number>(700);
  closeDelay = input<number>(300);
  contentClass = input<string>("");
  contentClasses = computed(() => cn(CONTENT, this.contentClass()));

  state = inject(HoverCardState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
    openDelay: this.openDelay(),
    closeDelay: this.closeDelay(),
    positioning: { placement: this.placement(), offset: { mainAxis: 4 } },
  }));
  positionerProps = computed(() => this.state.api().getPositionerProps());
  contentProps = computed(() => this.state.api().getContentProps());
  trigger = contentChild(HoverCardTrigger);
  private link = effect(() => this.trigger()?.owner.set(this.state));
}
