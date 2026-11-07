import { inject, input } from "@gable/core";
import * as tabs from "@zag-js/tabs";
import { bindProps } from "./props.js";
import { useMachine, type MachineBinding } from "./machine.js";
import { uniqueId } from "./id.js";

/**
 * The machine behind one set of tabs. The component that declares the tabs template lists it in `providers`
 * and binds it in Setup (see `DialogState` for why the wrapper cannot be a component of its own):
 *
 *   static meta = { providers: [TabsState], imports: [...TABS], template: ... };
 *   tabs = inject(TabsState).bind(() => ({ value: this.tab(), onValueChange: (d) => this.tab.set(d.value) }));
 */
export class TabsState {
  id = uniqueId("tabs");
  binding!: MachineBinding<any, tabs.Api>;
  get api() {
    return this.binding.api;
  }
  bind(props: () => Partial<tabs.Props>): this {
    this.binding = useMachine<any, tabs.Api>(tabs.machine as any, () => ({ id: this.id, ...props() }), tabs.connect as any);
    return this;
  }
}

export class UiTabsRoot {
  static meta = { selector: "[uiTabsRoot]" };
  state = inject(TabsState);
  _p = bindProps(() => this.state.api().getRootProps());
}
export class UiTabsList {
  static meta = { selector: "[uiTabsList]" };
  state = inject(TabsState);
  _p = bindProps(() => this.state.api().getListProps());
}
/** `<button uiTabTrigger="one">`: the tab's value is the directive's own input. */
export class UiTabTrigger {
  static meta = { selector: "[uiTabTrigger]" };
  state = inject(TabsState);
  uiTabTrigger = input<string>("");
  disabled = input<boolean>(false);
  _p = bindProps(() => (this.uiTabTrigger() ? this.state.api().getTriggerProps({ value: this.uiTabTrigger(), disabled: this.disabled() }) : null));
}
export class UiTabContent {
  static meta = { selector: "[uiTabContent]" };
  state = inject(TabsState);
  uiTabContent = input<string>("");
  _p = bindProps(() => (this.uiTabContent() ? this.state.api().getContentProps({ value: this.uiTabContent() }) : null));
}

export const TABS = [UiTabsRoot, UiTabsList, UiTabTrigger, UiTabContent] as const;
