import { inject } from "@gable/core";
import * as dialog from "@zag-js/dialog";
import { bindProps } from "./props.js";
import { useMachine, type MachineBinding } from "./machine.js";
import { uniqueId } from "./id.js";
import { delayHidden, usePresence } from "./presence.js";

/**
 * The machine behind one dialog. The component that declares the dialog template lists it in `providers` and binds it in Setup:
 *
 *   static meta = { providers: [DialogState], imports: [...DIALOG], template: ... };
 *   dialog = inject(DialogState).bind(() => ({ open: this.open(), onOpenChange: (d) => this.open.set(d.open) }));
 *
 * To render the backdrop and positioner outside the dialog's ancestors (escaping overflow, z-index and transform), wrap them in
 * `<ui-portal>` (see portal.ts) and add `UiPortal` to `imports`; DialogState still resolves because projected content is
 * injected from the declaring component.
 *
 * (A wrapper `<ui-dialog>` component cannot provide it: projected content is injected from the component that declares
 * it, not from the slot owner.)
 */
export class DialogState {
  id = uniqueId("dialog");
  binding!: MachineBinding<any, dialog.Api>;
  get api() {
    return this.binding.api;
  }
  bind(props: () => Partial<dialog.Props>): this {
    this.binding = useMachine<any, dialog.Api>(dialog.machine as any, () => ({ id: this.id, ...props() }), dialog.connect as any);
    return this;
  }
}

export class UiDialogTrigger {
  static meta = { selector: "[uiDialogTrigger]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getTriggerProps());
}
export class UiDialogBackdrop {
  static meta = { selector: "[uiDialogBackdrop]" };
  state = inject(DialogState);
  presence = usePresence(() => this.state.api().open);
  _p = bindProps(() => delayHidden(this.state.api().getBackdropProps(), this.presence));
}
export class UiDialogPositioner {
  static meta = { selector: "[uiDialogPositioner]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getPositionerProps());
}
export class UiDialogContent {
  static meta = { selector: "[uiDialogContent]" };
  state = inject(DialogState);
  presence = usePresence(() => this.state.api().open);
  _p = bindProps(() => delayHidden(this.state.api().getContentProps(), this.presence));
}
export class UiDialogTitle {
  static meta = { selector: "[uiDialogTitle]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getTitleProps());
}
export class UiDialogDescription {
  static meta = { selector: "[uiDialogDescription]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getDescriptionProps());
}
export class UiDialogClose {
  static meta = { selector: "[uiDialogClose]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getCloseTriggerProps());
}

/** Everything a template imports to build a dialog. */
export const DIALOG = [UiDialogTrigger, UiDialogBackdrop, UiDialogPositioner, UiDialogContent, UiDialogTitle, UiDialogDescription, UiDialogClose] as const;
