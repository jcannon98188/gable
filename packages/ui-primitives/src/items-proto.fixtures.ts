// Throwaway prototypes for TASK-24 (items for Select/Combobox/Menu). Not exported from the package index.
import type { Provider } from "@gable/core";
import { provideTestDom } from "./test-dom.js";
import { inject, input } from "@gable/core";
import * as select from "@zag-js/select";
import * as combobox from "@zag-js/combobox";
import * as menu from "@zag-js/menu";
import { bindProps } from "./props.js";
import { useMachine, type MachineBinding } from "./machine.js";
import { uniqueId } from "./id.js";

export interface Item {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Generic machine state holder, the same shape as TabsState/DialogState. */
function stateFor<Api>(prefix: string, machine: unknown, connect: unknown) {
  return class State {
    id = uniqueId(prefix);
    binding!: MachineBinding<any, Api>;
    get api() {
      return this.binding.api;
    }
    bind(props: () => Record<string, unknown>): this {
      this.binding = useMachine<any, Api>(machine as any, () => ({ id: this.id, ...props() }) as any, connect as any);
      return this;
    }
  };
}
export class SelectState extends stateFor<select.Api>("select", select.machine, select.connect) {}
export class ComboboxState extends stateFor<combobox.Api>("combobox", combobox.machine, combobox.connect) {}
export class MenuState extends stateFor<menu.Api>("menu", menu.machine, menu.connect) {}

export class UiSelectTrigger {
  static meta = { selector: "[uiSelectTrigger]" };
  state = inject(SelectState);
  _p = bindProps(() => this.state.api().getTriggerProps());
}
export class UiSelectContent {
  static meta = { selector: "[uiSelectContent]" };
  state = inject(SelectState);
  _p = bindProps(() => this.state.api().getContentProps());
}
/** `<li [uiSelectItem]="item">`: the collection item is the directive's own input (non-required, null-guarded). */
export class UiSelectItem {
  static meta = { selector: "[uiSelectItem]" };
  state = inject(SelectState);
  uiSelectItem = input<Item | null>(null);
  _p = bindProps(() => {
    const item = this.uiSelectItem();
    return item ? this.state.api().getItemProps({ item }) : null;
  });
}
export const SELECT = [UiSelectTrigger, UiSelectContent, UiSelectItem] as const;

export class UiComboInput {
  static meta = { selector: "[uiComboInput]" };
  state = inject(ComboboxState);
  _p = bindProps(() => this.state.api().getInputProps());
}
export class UiComboContent {
  static meta = { selector: "[uiComboContent]" };
  state = inject(ComboboxState);
  _p = bindProps(() => this.state.api().getContentProps());
}
export class UiComboItem {
  static meta = { selector: "[uiComboItem]" };
  state = inject(ComboboxState);
  uiComboItem = input<Item | null>(null);
  _p = bindProps(() => {
    const item = this.uiComboItem();
    return item ? this.state.api().getItemProps({ item }) : null;
  });
}
export const COMBOBOX = [UiComboInput, UiComboContent, UiComboItem] as const;

export class UiMenuTrigger {
  static meta = { selector: "[uiMenuTrigger]" };
  state = inject(MenuState);
  _p = bindProps(() => this.state.api().getTriggerProps());
}
export class UiMenuContent {
  static meta = { selector: "[uiMenuContent]" };
  state = inject(MenuState);
  _p = bindProps(() => this.state.api().getContentProps());
}
export class UiMenuItem {
  static meta = { selector: "[uiMenuItem]" };
  state = inject(MenuState);
  uiMenuItem = input<string>("");
  disabled = input<boolean>(false);
  _p = bindProps(() => (this.uiMenuItem() ? this.state.api().getItemProps({ value: this.uiMenuItem(), disabled: this.disabled() }) : null));
}
export const MENU = [UiMenuTrigger, UiMenuContent, UiMenuItem] as const;

/** provideTestDom() plus the scroll methods select/combobox/menu call on their content (a gap in the test DOM facade). */
export function provideItemsDom(): Provider[] {
  const [base] = provideTestDom() as [{ provide: unknown; useValue: { effects: boolean; getRootNode: (host: unknown) => any } }];
  return [
    {
      provide: base.provide,
      useValue: {
        ...base.useValue,
        getRootNode: (host: unknown) => {
          const doc = base.useValue.getRootNode(host);
          const getElementById = doc.getElementById.bind(doc);
          doc.getElementById = (id: string) => {
            const el = getElementById(id);
            if (el) {
              el.scrollTo ??= () => {};
              el.scrollIntoView ??= () => {};
            }
            return el;
          };
          const q = (el: any) => el && ((el.scrollIntoView ??= () => {}), (el.scrollTo ??= () => {}), el);
          const qsa = doc.querySelectorAll?.bind(doc);
          if (qsa) doc.querySelectorAll = (s: string) => qsa(s).map(q);
          return doc;
        },
      },
    } as Provider,
  ];
}
