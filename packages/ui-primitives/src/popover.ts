import { inject } from "@gable/core";
import * as popover from "@zag-js/popover";
import { bindProps } from "./props.js";
import { machineState } from "./state.js";
import { delayHidden, usePresence } from "./presence.js";

/**
 * The machine behind one popover. The component that declares the popover template lists it in `providers` and binds it in Setup:
 *
 *   static meta = { providers: [PopoverState], imports: [...POPOVER], template: ... };
 *   popover = inject(PopoverState).bind(() => ({ open: this.open(), onOpenChange: (d) => this.open.set(d.open) }));
 *
 * Wrap the positioner in `<ui-portal>` to render it in the overlay root (see portal.ts). The trigger needs the machine's
 * `getTriggerProps()`: use `uiPopoverTrigger` in the declaring template, or, for a trigger that is projected content
 * (it cannot inject the state), hand the state to it from the declaring component, as gable-ui's popover does.
 */
export class PopoverState extends machineState<popover.Props, popover.Api>("popover", popover.machine, popover.connect) {}

export class UiPopoverTrigger {
  static meta = { selector: "[uiPopoverTrigger]" };
  state = inject(PopoverState);
  _p = bindProps(() => this.state.api().getTriggerProps());
}
export class UiPopoverPositioner {
  static meta = { selector: "[uiPopoverPositioner]" };
  state = inject(PopoverState);
  _p = bindProps(() => this.state.api().getPositionerProps());
}
export class UiPopoverContent {
  static meta = { selector: "[uiPopoverContent]" };
  state = inject(PopoverState);
  presence = usePresence(() => this.state.api().open);
  _p = bindProps(() => delayHidden(this.state.api().getContentProps(), this.presence));
}
export class UiPopoverTitle {
  static meta = { selector: "[uiPopoverTitle]" };
  state = inject(PopoverState);
  _p = bindProps(() => this.state.api().getTitleProps());
}
export class UiPopoverDescription {
  static meta = { selector: "[uiPopoverDescription]" };
  state = inject(PopoverState);
  _p = bindProps(() => this.state.api().getDescriptionProps());
}
export class UiPopoverClose {
  static meta = { selector: "[uiPopoverClose]" };
  state = inject(PopoverState);
  _p = bindProps(() => this.state.api().getCloseTriggerProps());
}

/** Everything a template imports to build a popover. */
export const POPOVER = [UiPopoverTrigger, UiPopoverPositioner, UiPopoverContent, UiPopoverTitle, UiPopoverDescription, UiPopoverClose] as const;
