import { computed, html, inject, signal } from "@gable/core";
import { DIALOG, DialogState } from "@gable/ui-primitives";
import { primitivesStyles } from "./primitives-style.js";

/**
 * A modal dialog from the headless parts. `DialogState` owns the Zag dialog machine; the `uiDialog*` directives only apply
 * the machine's attributes. Focus moves into the dialog, Tab stays inside, Escape closes, and focus returns to the trigger.
 * The backdrop and positioner are absolutely positioned inside the stage (not the viewport) so the demo stays on the page.
 */
export class DialogDemo {
  static meta = {
    selector: "dialog-demo",
    providers: [DialogState],
    imports: [...DIALOG],
    styles: [
      ...primitivesStyles,
      `
.stage{align-items:flex-start}
[uiDialogBackdrop]{position:absolute;inset:0;background:rgba(0,0,0,.45);animation:fade .15s ease-out}
[uiDialogBackdrop][data-state=closed]{animation:none}
[uiDialogPositioner]{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px}
[uiDialogContent]{width:min(340px,100%);background:var(--card);color:var(--tx);border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.3);animation:pop .15s ease-out}
[uiDialogContent][data-state=closed]{animation:none}
[uiDialogTitle]{margin:0 0 6px;font-size:16px}
[uiDialogDescription]{margin:0 0 12px;font-size:14px;color:var(--mut)}
.field{width:100%;box-sizing:border-box;min-height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--tx);font:14px Inter,system-ui,sans-serif;margin-bottom:12px}
.field:focus-visible{outline:2px solid var(--acc);outline-offset:1px}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>Dialog, headless</h3>
<p>Open it, then try <kbd>Tab</kbd>, <kbd>Shift</kbd>+<kbd>Tab</kbd> and <kbd>Esc</kbd>.</p>
</div>
<div class="db">
<div class="stage">
<div class="row">
<button class="btn pri" type="button" uiDialogTrigger>Rename project</button>
</div>
<p class="keys">The trigger gets <code>aria-haspopup</code>, <code>aria-expanded</code> and <code>aria-controls</code>.</p>
<div uiDialogBackdrop></div>
<div uiDialogPositioner>
<div uiDialogContent>
<h4 uiDialogTitle>Rename project</h4>
<p uiDialogDescription>Focus is trapped here until you close the dialog.</p>
<input class="field" type="text" aria-label="Project name" value="Gable demo" />
<div class="row">
<button class="btn pri" type="button" (click)="save()">Save</button>
<button class="btn" type="button" uiDialogClose>Cancel</button>
</div>
</div>
</div>
</div>
<p class="status" aria-live="polite">{{ message() }}</p>
<p class="note">Nothing here is styled by the library: the CSS keys off <code>data-state</code>, <code>hidden</code> and the ARIA attributes the directives set.</p>
</div>
</div>
    `,
  };

  open = signal(false);
  saved = signal(0);
  dialog = inject(DialogState).bind(() => ({
    open: this.open(),
    onOpenChange: (d: { open: boolean }) => this.open.set(d.open),
  }));
  message = computed(() => (this.open() ? "Dialog open: focus is inside it." : this.saved() > 0 ? `Saved ${this.saved()} time(s). Focus returned to the trigger.` : "Dialog closed."));

  save() {
    this.saved.update((n) => n + 1);
    this.open.set(false);
  }
}
