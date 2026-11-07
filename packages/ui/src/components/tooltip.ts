import { computed, effect, injectHost, input } from "@gable/core";
import { TooltipState, bindProps, delayHidden, usePresence } from "@gable/ui-primitives";
import { currentScope } from "@gable/core/internal";
import { cn } from "../lib/cn.js";
import type { Placement } from "../lib/placement.js";

const CONTENT =
  "z-50 w-fit rounded-md bg-primary px-3 py-1.5 text-xs text-balance text-primary-foreground " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 " +
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";

/**
 * `<button uiButton uiTooltip="Save changes">Save</button>`: a tooltip on any element.
 *
 * A tooltip trigger is somebody else's element, so this is a directive on that element rather than a wrapper component.
 * It owns a Zag tooltip machine and creates the tooltip itself (a positioner and a panel in the overlay root) through the
 * renderer, since a directive has no template. It opens after `delay` ms of hover and on keyboard focus, closes on leave,
 * blur, Escape and click, and describes the trigger with `aria-describedby`.
 */
export class UiTooltip {
  static meta = { selector: "[uiTooltip]" };

  /** The tooltip text. Empty disables the tooltip. */
  uiTooltip = input<string>("");
  placement = input<Placement>("top");
  /** Milliseconds of hover before it opens. */
  delay = input<number>(300);
  /** Extra classes for the panel; they win over the defaults. */
  tooltipClass = input<string>("");
  private classes = computed(() => cn(CONTENT, this.tooltipClass()));

  private host = injectHost();
  private state = new TooltipState().bind(() => ({
    openDelay: this.delay(),
    disabled: !this.uiTooltip(),
    positioning: { placement: this.placement(), offset: { mainAxis: 4 } },
  }));
  private build = (() => {
    const { renderer, host } = this.host;
    if (!renderer.overlayRoot) throw new Error(`uiTooltip needs a renderer with overlayRoot(); the "${renderer.name ?? "unnamed"}" renderer has none.`);
    const root = renderer.overlayRoot();
    const positioner = renderer.createElement("div", root);
    const content = renderer.createElement("div", positioner);
    const text = renderer.createText("");
    renderer.insert(content, text);
    renderer.insert(positioner, content);
    renderer.insert(root, positioner);
    currentScope()?.onDispose(() => renderer.remove(positioner));

    const api = this.state.api;
    const presence = usePresence(() => api().open, { renderer, host: content });
    bindProps(() => api().getTriggerProps(), { renderer, host });
    bindProps(() => api().getPositionerProps(), { renderer, host: positioner });
    bindProps(() => delayHidden(api().getContentProps(), presence), { renderer, host: content });
    effect(() => renderer.setAttribute(content, "class", this.classes()));
    effect(() => renderer.setText(text, this.uiTooltip()));
  })();
}
