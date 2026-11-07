import { computed, contentChild, effect, html, inject, input, model } from "@gable/core";
import { DialogState, UiDialogBackdrop, UiDialogContent, UiDialogDescription, UiDialogTitle, UiDrawerDrag, UiPortal } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { DialogTrigger } from "./dialog.js";

export type DrawerSide = "top" | "right" | "bottom" | "left";

const BASE =
  "fixed z-50 flex flex-col bg-background shadow-lg outline-none transition ease-in-out data-[dragging]:select-none data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500 data-[dragged]:data-[state=closed]:animate-none";
const SIDES: Record<DrawerSide, string> = {
  bottom: "inset-x-0 bottom-0 mt-24 max-h-[80vh] rounded-t-lg border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
  top: "inset-x-0 top-0 mb-24 max-h-[80vh] rounded-b-lg border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
  right: "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
  left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
};

/**
 * A panel that slides in from an edge (the bottom by default) and can be dragged closed with a mouse, finger or pen:
 * a modal dialog (focus trap, Escape, outside click, scroll lock) with drag-to-dismiss, like shadcn's Drawer (vaul).
 *
 *   <ui-drawer [(open)]="open" heading="Move goal" description="Set your daily activity goal.">
 *     <button slot="trigger" dialogTrigger uiButton variant="outline">Open</button>
 *     ...the body...
 *     <div slot="footer"><button uiButton (click)="open.set(false)">Submit</button></div>
 *   </ui-drawer>
 *
 * Releasing a drag closes the drawer when it was pulled more than halfway or flung faster than 0.4px/ms. `[snapPoints]="[0.4, 1]"`
 * adds resting positions (fractions of the panel that stay visible; `[(snap)]` reads or sets the current one): a release
 * settles on the nearest, a fling moves one step, and dragging below the lowest one closes it. Touch drags start from the
 * grab handle and header (they have `touch-action: none`); a mouse or pen can drag from anywhere that is not a control, and
 * from scrolled content only once it is back at the top. Mark elements `data-drawer-no-drag` to exclude them.
 *
 * The trigger is the same `dialogTrigger` directive `<ui-dialog>` uses (import `DialogTrigger` from the dialog component).
 * The drag logic is `DrawerDragEngine` / `uiDrawerDrag` in `@gable/ui-primitives`.
 */
export class UiDrawer {
  static meta = {
    selector: "ui-drawer",
    providers: [DialogState],
    imports: [UiPortal, UiDialogBackdrop, UiDialogContent, UiDialogTitle, UiDialogDescription, UiDrawerDrag],
    template: html`
      <slot name="trigger"></slot>
      <ui-portal>
        <div
          uiDialogBackdrop
          class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        ></div>
        <div
          uiDialogContent
          uiDrawerDrag
          [side]="side()"
          [open]="open()"
          [snapPoints]="snapPoints()"
          [activeSnap]="snap()"
          [enabled]="dragToClose()"
          (dismiss)="open.set(false)"
          (snapChange)="snap.set($event)"
          [attr.class]="contentClasses()"
        >
          <div class="touch-none">
            @if (showHandle()) {
              <div data-slot="drawer-handle" aria-hidden="true" class="mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted"></div>
            }
            <div class="flex flex-col gap-1.5 p-4 text-center sm:text-left">
              <h2 uiDialogTitle class="font-semibold text-foreground">{{ heading() }}</h2>
              @if (description()) {
                <p uiDialogDescription class="text-sm text-muted-foreground">{{ description() }}</p>
              }
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-4"><slot></slot></div>
          <div class="mt-auto flex flex-col gap-2 p-4 empty:hidden"><slot name="footer"></slot></div>
        </div>
      </ui-portal>
    `,
  };

  /** Two-way: `[(open)]="open"`. */
  open = model(false);
  /** The edge it opens from. */
  side = input<DrawerSide>("bottom");
  heading = input<string>("");
  description = input<string>("");
  /** Visible fractions of the panel it can rest at, ascending, e.g. `[0.4, 1]`. Default: fully open only. */
  snapPoints = input<readonly number[]>([1]);
  /** Two-way: the snap fraction the drawer rests at. `null` means the largest snap point. */
  snap = model<number | null>(null);
  /** Turn drag-to-dismiss off with `[dragToClose]="false"`. */
  dragToClose = input<boolean>(true);
  contentClass = input<string>("");
  contentClasses = computed(() => cn(BASE, SIDES[this.side()], this.contentClass()));
  showHandle = computed(() => this.side() === "bottom" && this.dragToClose());

  state = inject(DialogState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
  }));
  trigger = contentChild(DialogTrigger);
  private link = effect(() => this.trigger()?.owner.set(this.state));
}
