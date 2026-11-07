import { inject, input } from "@gable/core";
import * as select from "@zag-js/select";
import { bindProps } from "./props.js";
import { machineState } from "./state.js";
import { delayHidden, usePresence } from "./presence.js";

/** One option of a select: items are data (see docs/ui-items.md). */
export interface SelectItem {
  value: string;
  label: string;
  disabled?: boolean;
}

/** The collection a select machine takes for a list of items: `collection: selectCollection(this.items())`. */
export const selectCollection = (items: SelectItem[]) => select.collection({ items });

/**
 * The machine behind one select. Items are data: the declaring component builds the machine's collection from a signal
 * and renders the options with `@for` and `[uiSelectItem]`:
 *
 *   static meta = { providers: [SelectState], imports: [...SELECT], template: ... };
 *   select = inject(SelectState).bind(() => ({ collection: select.collection({ items: this.items() }), ... }));
 *   rows = computed(() => this.items().map((item) => ({ ...item, ...this.select.api().getItemState({ item }) })));
 */
export class SelectState extends machineState<select.Props, select.Api>("select", select.machine, select.connect) {}

export class UiSelectLabel {
  static meta = { selector: "[uiSelectLabel]" };
  state = inject(SelectState);
  _p = bindProps(() => this.state.api().getLabelProps());
}
export class UiSelectControl {
  static meta = { selector: "[uiSelectControl]" };
  state = inject(SelectState);
  _p = bindProps(() => this.state.api().getControlProps());
}
export class UiSelectTrigger {
  static meta = { selector: "[uiSelectTrigger]" };
  state = inject(SelectState);
  _p = bindProps(() => this.state.api().getTriggerProps());
}
export class UiSelectValueText {
  static meta = { selector: "[uiSelectValueText]" };
  state = inject(SelectState);
  _p = bindProps(() => this.state.api().getValueTextProps());
}
export class UiSelectPositioner {
  static meta = { selector: "[uiSelectPositioner]" };
  state = inject(SelectState);
  _p = bindProps(() => this.state.api().getPositionerProps());
}
export class UiSelectContent {
  static meta = { selector: "[uiSelectContent]" };
  state = inject(SelectState);
  presence = usePresence(() => this.state.api().open);
  _p = bindProps(() => delayHidden(this.state.api().getContentProps(), this.presence));
}
/** `<div [uiSelectItem]="item">`: the item is the directive's own input (non-required, null-guarded: inputs bind after Setup). */
export class UiSelectItem {
  static meta = { selector: "[uiSelectItem]" };
  state = inject(SelectState);
  uiSelectItem = input<SelectItem | null>(null);
  _p = bindProps(() => {
    const item = this.uiSelectItem();
    return item ? this.state.api().getItemProps({ item }) : null;
  });
}

/** Everything a template imports to build a select. */
export const SELECT = [UiSelectLabel, UiSelectControl, UiSelectTrigger, UiSelectValueText, UiSelectPositioner, UiSelectContent, UiSelectItem] as const;
