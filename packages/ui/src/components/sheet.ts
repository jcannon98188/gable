import { computed, contentChild, effect, html, inject, input, model } from "@gable/core";
import { DialogState, UiDialogBackdrop, UiDialogClose, UiDialogContent, UiDialogDescription, UiDialogTitle, UiPortal } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";
import { DialogTrigger } from "./dialog.js";

/** The screen edge a `ui-sheet` slides in from. */
export type SheetSide = "top" | "right" | "bottom" | "left";

const BASE =
  "fixed z-50 flex flex-col gap-4 bg-background shadow-lg outline-none transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500";
const SIDES: Record<SheetSide, string> = {
  right: "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
  left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
  top: "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
  bottom: "inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
};

/**
 * A panel that slides in from an edge: a modal dialog (focus trap, Escape, outside click, scroll lock) styled as a sheet.
 *
 *   <ui-sheet [(open)]="open" side="right" heading="Edit profile" description="Make changes here.">
 *     <button slot="trigger" dialogTrigger uiButton variant="outline">Open</button>
 *     ...the body...
 *     <div slot="footer"><button uiButton (click)="open.set(false)">Save</button></div>
 *   </ui-sheet>
 *
 * The trigger is the same `dialogTrigger` directive `<ui-dialog>` uses (import `DialogTrigger` from the dialog component).
 */
export class UiSheet {
  static meta = {
    selector: "ui-sheet",
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
          <div class="flex flex-col gap-1.5 p-4">
            <h2 uiDialogTitle class="font-semibold text-foreground">{{ heading() }}</h2>
            @if (description()) {
              <p uiDialogDescription class="text-sm text-muted-foreground">{{ description() }}</p>
            }
          </div>
          <div class="flex-1 overflow-y-auto px-4"><slot></slot></div>
          <div class="mt-auto flex flex-col gap-2 p-4 empty:hidden"><slot name="footer"></slot></div>
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
  side = input<SheetSide>("right");
  heading = input<string>("");
  description = input<string>("");
  contentClass = input<string>("");
  contentClasses = computed(() => cn(BASE, SIDES[this.side()], this.contentClass()));

  state = inject(DialogState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
  }));
  trigger = contentChild(DialogTrigger);
  private link = effect(() => this.trigger()?.owner.set(this.state));
}
