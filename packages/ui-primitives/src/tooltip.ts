import { inject } from "@gable/core";
import * as tooltip from "@zag-js/tooltip";
import { bindProps } from "./props.js";
import { machineState } from "./state.js";
import { delayHidden, usePresence } from "./presence.js";

/**
 * The machine behind one tooltip. The component that declares the tooltip template lists it in `providers` and binds it in Setup:
 *
 *   static meta = { providers: [TooltipState], imports: [...TOOLTIP], template: ... };
 *   tooltip = inject(TooltipState).bind(() => ({ openDelay: 300 }));
 *
 * A tooltip trigger is usually somebody else's element, so gable-ui's `uiTooltip` directive instead owns its own state
 * and creates the content through the renderer, using `bindProps(bag, { renderer, host })` for the parts it creates.
 */
export class TooltipState extends machineState<tooltip.Props, tooltip.Api>("tooltip", tooltip.machine, tooltip.connect) {}

export class UiTooltipTrigger {
  static meta = { selector: "[uiTooltipTrigger]" };
  state = inject(TooltipState);
  _p = bindProps(() => this.state.api().getTriggerProps());
}
export class UiTooltipPositioner {
  static meta = { selector: "[uiTooltipPositioner]" };
  state = inject(TooltipState);
  _p = bindProps(() => this.state.api().getPositionerProps());
}
export class UiTooltipContent {
  static meta = { selector: "[uiTooltipContent]" };
  state = inject(TooltipState);
  presence = usePresence(() => this.state.api().open);
  _p = bindProps(() => delayHidden(this.state.api().getContentProps(), this.presence));
}

/** Everything a template imports to build a tooltip. */
export const TOOLTIP = [UiTooltipTrigger, UiTooltipPositioner, UiTooltipContent] as const;
