import { computed, effect, contentChild, html, inject, input, model, output } from "@gable/core";
import { DialogState, UiDialogBackdrop, UiDialogClose, UiDialogContent, UiDialogDescription, UiDialogTitle, UiPortal } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiButton, type ButtonVariant } from "./button.js";
import { DialogTrigger } from "./dialog.js";

const CONTENT =
  "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none duration-200 sm:max-w-lg " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

/**
 * A confirmation dialog that needs an answer: `role="alertdialog"`, no close button, and an outside click does not dismiss it.
 *
 *   <ui-alert-dialog [(open)]="open" heading="Delete the project?" description="This cannot be undone."
 *       confirmLabel="Delete" actionVariant="destructive" (confirmed)="remove()">
 *     <button slot="trigger" dialogTrigger uiButton variant="outline">Delete</button>
 *   </ui-alert-dialog>
 *
 * Cancel and Escape close it; the action button emits `confirmed` and closes it. The trigger is the same `dialogTrigger`
 * directive `<ui-dialog>` uses (import `DialogTrigger` from the dialog component).
 */
export class UiAlertDialog {
  static meta = {
    selector: "ui-alert-dialog",
    providers: [DialogState],
    imports: [UiPortal, UiDialogBackdrop, UiDialogContent, UiDialogTitle, UiDialogDescription, UiDialogClose, UiButton],
    template: html`
      <slot name="trigger"></slot>
      <ui-portal>
        <div
          uiDialogBackdrop
          class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        ></div>
        <div uiDialogContent [attr.class]="contentClasses()">
          <div class="flex flex-col gap-2 text-center sm:text-left">
            <h2 uiDialogTitle class="text-lg font-semibold">{{ heading() }}</h2>
            <p uiDialogDescription class="text-sm text-muted-foreground">{{ description() }}</p>
          </div>
          <slot></slot>
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button uiDialogClose uiButton variant="outline">{{ cancelLabel() }}</button>
            <button uiButton [variant]="actionVariant()" (click)="confirm()">{{ confirmLabel() }}</button>
          </div>
        </div>
      </ui-portal>
    `,
  };

  /** Two-way: `[(open)]="open"`. */
  open = model(false);
  heading = input<string>("");
  description = input<string>("");
  confirmLabel = input<string>("Continue");
  cancelLabel = input<string>("Cancel");
  actionVariant = input<ButtonVariant>("default");
  contentClass = input<string>("");
  /** Fires when the action button is pressed. */
  confirmed = output();
  contentClasses = computed(() => cn(CONTENT, this.contentClass()));

  state = inject(DialogState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
    role: "alertdialog" as const,
    closeOnInteractOutside: false,
  }));
  trigger = contentChild(DialogTrigger);
  private link = effect(() => this.trigger()?.owner.set(this.state));
  confirm() {
    this.confirmed.emit();
    this.open.set(false);
  }
}
