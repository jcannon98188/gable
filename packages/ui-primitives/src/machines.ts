import { input } from "@gable/core";
import * as accordion from "@zag-js/accordion";
import * as avatar from "@zag-js/avatar";
import * as checkbox from "@zag-js/checkbox";
import * as collapsible from "@zag-js/collapsible";
import * as combobox from "@zag-js/combobox";
import * as hoverCard from "@zag-js/hover-card";
import * as menu from "@zag-js/menu";
import * as pagination from "@zag-js/pagination";
import * as progress from "@zag-js/progress";
import * as radioGroup from "@zag-js/radio-group";
import * as scrollArea from "@zag-js/scroll-area";
import * as slider from "@zag-js/slider";
import * as switchMachine from "@zag-js/switch";
import * as toggle from "@zag-js/toggle";
import * as toggleGroup from "@zag-js/toggle-group";
import { bindProps, type PropBag } from "./props.js";
import { machineState } from "./state.js";
import { delayHidden, usePresence } from "./presence.js";

// One state class per Zag machine, the same shape as `DialogState` and `SelectState` (see state.ts): the component that
// declares the template lists it in `providers` and calls `inject(XState).bind(() => props)`. Directives that own their
// element (Toggle) create it with `new ToggleState().bind(...)` instead.
/**
 * The machine behind one accordion, the Zag `accordion` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(AccordionState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class AccordionState extends machineState<accordion.Props, accordion.Api>("accordion", accordion.machine, accordion.connect) {}
/**
 * The machine behind one avatar (image with fallback), the Zag `avatar` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(AvatarState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class AvatarState extends machineState<avatar.Props, avatar.Api>("avatar", avatar.machine, avatar.connect) {}
/**
 * The machine behind one checkbox, the Zag `checkbox` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(CheckboxState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class CheckboxState extends machineState<checkbox.Props, checkbox.Api>("checkbox", checkbox.machine, checkbox.connect) {}
/**
 * The machine behind one collapsible region, the Zag `collapsible` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(CollapsibleState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class CollapsibleState extends machineState<collapsible.Props, collapsible.Api>("collapsible", collapsible.machine, collapsible.connect) {}
/**
 * The machine behind one combobox (text input with a filtered option list), the Zag `combobox` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(ComboboxState).bind(() => props)`; read the live Zag api with `state.api()`. Items are data: pass a Zag collection built from a signal.
 */
export class ComboboxState extends machineState<combobox.Props, combobox.Api>("combobox", combobox.machine, combobox.connect) {}
/**
 * The machine behind one hover card (a preview card opened by hovering or focusing its trigger), the Zag `hoverCard` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(HoverCardState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class HoverCardState extends machineState<hoverCard.Props, hoverCard.Api>("hover-card", hoverCard.machine, hoverCard.connect) {}
/**
 * The machine behind one dropdown or context menu, the Zag `menu` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(MenuState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class MenuState extends machineState<menu.Props, menu.Api>("menu", menu.machine, menu.connect) {}
/**
 * The machine behind one pagination control, the Zag `pagination` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(PaginationState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class PaginationState extends machineState<pagination.Props, pagination.Api>("pagination", pagination.machine, pagination.connect) {}
/**
 * The machine behind one progress indicator, the Zag `progress` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(ProgressState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class ProgressState extends machineState<progress.Props, progress.Api>("progress", progress.machine, progress.connect) {}
/**
 * The machine behind one radio group, the Zag `radioGroup` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(RadioGroupState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class RadioGroupState extends machineState<radioGroup.Props, radioGroup.Api>("radio-group", radioGroup.machine, radioGroup.connect) {}
/**
 * The machine behind one custom scroll area, the Zag `scrollArea` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(ScrollAreaState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class ScrollAreaState extends machineState<scrollArea.Props, scrollArea.Api<any>>("scroll-area", scrollArea.machine, scrollArea.connect) {}
/**
 * The machine behind one slider, the Zag `slider` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(SliderState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class SliderState extends machineState<slider.Props, slider.Api>("slider", slider.machine, slider.connect) {}
/**
 * The machine behind one switch, the Zag `switch` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(SwitchState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class SwitchState extends machineState<switchMachine.Props, switchMachine.Api>("switch", switchMachine.machine, switchMachine.connect) {}
/**
 * The machine behind one toggle button, the Zag `toggle` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(ToggleState).bind(() => props)`; read the live Zag api with `state.api()`. Directives that own their element create it with `new ToggleState().bind(...)` instead of providing it.
 */
export class ToggleState extends machineState<toggle.Props, toggle.Api>("toggle", toggle.machine, toggle.connect) {}
/**
 * The machine behind one toggle group, the Zag `toggleGroup` machine wrapped in the standard state shape (see `machineState`).
 *
 * The component that declares the template lists it in `providers` and binds it in Setup with `inject(ToggleGroupState).bind(() => props)`; read the live Zag api with `state.api()`.
 */
export class ToggleGroupState extends machineState<toggleGroup.Props, toggleGroup.Api>("toggle-group", toggleGroup.machine, toggleGroup.connect) {}

/**
 * `<div [uiProps]="rootProps()">`: spreads a prop bag from a Zag prop getter onto the element. Templates cannot call
 * `api().getRootProps()`, so the component computes each part's bag (`rootProps = computed(() => this.state.api().getRootProps())`)
 * and binds it. Every Zag part of the newer components (accordion, checkbox, slider, menu, ...) goes through this one directive.
 */
export class UiProps {
  static meta = { selector: "[uiProps]" };
  uiProps = input<PropBag | null>(null);
  _p = bindProps(() => this.uiProps());
}

/**
 * `<div [uiPopup]="contentProps()" [popupOpen]="open()">`: like `uiProps` for a panel that is hidden when closed, but the
 * `hidden` attribute waits for the exit animation (see presence.ts), so `data-state="closed"` can animate out.
 */
export class UiPopup {
  static meta = { selector: "[uiPopup]" };
  uiPopup = input<PropBag | null>(null);
  popupOpen = input<boolean>(false);
  presence = usePresence(() => this.popupOpen());
  _p = bindProps(() => delayHidden(this.uiPopup(), this.presence));
}
