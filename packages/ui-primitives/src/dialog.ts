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
 *
 * @example
 * class ConfirmDialog {
 *   static meta = {
 *     selector: "confirm-dialog",
 *     providers: [DialogState],
 *     imports: [...DIALOG],
 *     template: html`
 *       <button uiDialogTrigger>Delete</button>
 *       <div uiDialogBackdrop></div>
 *       <div uiDialogPositioner>
 *         <div uiDialogContent>
 *           <h2 uiDialogTitle>Delete this item?</h2>
 *           <button uiDialogClose>Cancel</button>
 *         </div>
 *       </div>`,
 *   };
 *   open = signal(false);
 *   dialog = inject(DialogState).bind(() => ({ open: this.open(), onOpenChange: (d) => this.open.set(d.open) }));
 * }
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

/** `[uiDialogTrigger]`: the element that opens the dialog. Gets the trigger props (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`) from the injected `DialogState`. */
export class UiDialogTrigger {
  static meta = { selector: "[uiDialogTrigger]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getTriggerProps());
}
/** `[uiDialogBackdrop]`: the dimmed layer behind the dialog. Stays mounted until its exit animation finishes so `data-state="closed"` can animate out. */
export class UiDialogBackdrop {
  static meta = { selector: "[uiDialogBackdrop]" };
  state = inject(DialogState);
  presence = usePresence(() => this.state.api().open);
  _p = bindProps(() => delayHidden(this.state.api().getBackdropProps(), this.presence));
}
/** `[uiDialogPositioner]`: the full-viewport wrapper that positions the dialog content (centering is up to your CSS). */
export class UiDialogPositioner {
  static meta = { selector: "[uiDialogPositioner]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getPositionerProps());
}
/** `[uiDialogContent]`: the dialog panel. Gets `role="dialog"`, `aria-labelledby`/`aria-describedby` and `aria-modal`; focus is trapped inside while open and returns to the trigger on close. Hidden only after the exit animation finishes. */
export class UiDialogContent {
  static meta = { selector: "[uiDialogContent]" };
  state = inject(DialogState);
  presence = usePresence(() => this.state.api().open);
  _p = bindProps(() => delayHidden(this.state.api().getContentProps(), this.presence));
}
/** `[uiDialogTitle]`: the dialog's heading. Its id is what the content's `aria-labelledby` points at. */
export class UiDialogTitle {
  static meta = { selector: "[uiDialogTitle]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getTitleProps());
}
/** `[uiDialogDescription]`: the dialog's description text. Its id is what the content's `aria-describedby` points at. */
export class UiDialogDescription {
  static meta = { selector: "[uiDialogDescription]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getDescriptionProps());
}
/** `[uiDialogClose]`: a button that closes the dialog. */
export class UiDialogClose {
  static meta = { selector: "[uiDialogClose]" };
  state = inject(DialogState);
  _p = bindProps(() => this.state.api().getCloseTriggerProps());
}

/** Everything a template imports to build a dialog. */
export const DIALOG = [UiDialogTrigger, UiDialogBackdrop, UiDialogPositioner, UiDialogContent, UiDialogTitle, UiDialogDescription, UiDialogClose] as const;
