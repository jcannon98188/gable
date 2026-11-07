import { computed, contentChild, effect, html, inject, input, model, signal } from "@gable/core";
import {
  DialogState,
  UiDialogBackdrop,
  UiDialogClose,
  UiDialogContent,
  UiDialogDescription,
  UiDialogTitle,
  UiPortal,
  bindProps,
} from "@gable/ui-primitives";
import { cn } from "../../lib/ui/cn.js";
import { UiIcon } from "../../lib/ui/icon.js";

const CONTENT =
  "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none duration-200 sm:max-w-lg " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

/**
 * Marks the element that opens a dialog: `<button slot="trigger" dialogTrigger uiButton>Open</button>`.
 * The dialog hands its machine state to the trigger (projected content is injected from the component that declares it,
 * so the trigger cannot inject the state itself), which then gets `aria-haspopup`, `aria-expanded` and the click handler.
 */
export class DialogTrigger {
  static meta = { selector: "[dialogTrigger]" };
  owner = signal<DialogState | null>(null);
  private props = bindProps(() => this.owner()?.api().getTriggerProps() ?? null);
}

/**
 * A modal dialog.
 *
 *   <ui-dialog [(open)]="open" heading="Edit profile" description="Make changes here.">
 *     <button slot="trigger" dialogTrigger uiButton variant="outline">Edit</button>
 *     ...the body...
 *     <div slot="footer"><button uiButton (click)="open.set(false)">Save</button></div>
 *   </ui-dialog>
 *
 * Focus is trapped and restored, Escape and an outside click close it, the page behind is inert and does not scroll.
 * The panel is portalled to the overlay root; its `data-state` drives the enter and exit animation (the exit
 * finishes before the panel is hidden).
 */
export class UiDialog {
  static meta = {
    selector: "ui-dialog",
    providers: [DialogState],
    imports: [UiPortal, UiDialogBackdrop, UiDialogContent, UiDialogTitle, UiDialogDescription, UiDialogClose, UiIcon],
    template: html`
      <slot name="trigger"></slot>
      <ui-portal>
        <div
          uiDialogBackdrop
          class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        ></div>
        <div uiDialogContent [attr.class]="contentClasses()">
          <div class="flex flex-col gap-2 text-center sm:text-left">
            <h2 uiDialogTitle class="text-lg leading-none font-semibold">{{ heading() }}</h2>
            @if (description()) {
              <p uiDialogDescription class="text-sm text-muted-foreground">{{ description() }}</p>
            }
          </div>
          <slot></slot>
          <div class="flex flex-col-reverse gap-2 empty:hidden sm:flex-row sm:justify-end"><slot name="footer"></slot></div>
          <button
            uiDialogClose
            class="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <svg uiIcon="x" class="size-4"></svg>
            <span class="sr-only">Close</span>
          </button>
        </div>
      </ui-portal>
    `,
  };

  /** Two-way: `[(open)]="open"`. */
  open = model(false);
  heading = input<string>("");
  description = input<string>("");
  /** Extra classes for the panel; they win over the defaults (`sm:max-w-sm`). */
  contentClass = input<string>("");
  contentClasses = computed(() => cn(CONTENT, this.contentClass()));

  state = inject(DialogState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
  }));
  trigger = contentChild(DialogTrigger);
  private link = effect(() => this.trigger()?.owner.set(this.state));
}
