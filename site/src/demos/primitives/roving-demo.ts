import { computed, html, signal } from "@gable/core";
import { UiRoving, UiRovingItem } from "@gable/ui-primitives";
import { primitivesStyles } from "./primitives-style.js";

/**
 * `uiRoving` on a toolbar: exactly one button is in the tab order, arrows, Home and End move between enabled buttons,
 * and Tab leaves the group. The orientation is a signal bound to the directive's input.
 */
export class RovingDemo {
  static meta = {
    selector: "roving-demo",
    imports: [UiRoving, UiRovingItem],
    styles: [
      ...primitivesStyles,
      `
.bar{display:flex;gap:6px;flex-wrap:wrap;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--bg2)}
.bar.vertical{flex-direction:column;align-items:flex-start}
.after{align-self:flex-start}
`,
    ],
    template: html`
<div class="demo">
<div class="dh">
<h3>Roving tabindex</h3>
<p>Press <kbd>Tab</kbd> once to enter the toolbar, use the arrow keys inside it, and <kbd>Tab</kbd> again to leave.</p>
</div>
<div class="db">
<div class="row" role="group" aria-label="Orientation">
<button class="btn" type="button" [attr.aria-pressed]="horizontal()" (click)="setOrientation('horizontal')">Horizontal</button>
<button class="btn" type="button" [attr.aria-pressed]="vertical()" (click)="setOrientation('vertical')">Vertical</button>
</div>
<div class="bar" [class.vertical]="vertical()" uiRoving role="toolbar" aria-label="Text tools" [orientation]="orientation()">
<button class="btn" type="button" uiRovingItem (focus)="seen('Cut')">Cut</button>
<button class="btn" type="button" uiRovingItem (focus)="seen('Copy')">Copy</button>
<button class="btn" type="button" uiRovingItem disabled>Paste (disabled)</button>
<button class="btn" type="button" uiRovingItem (focus)="seen('Undo')">Undo</button>
</div>
<button class="btn after" type="button">Next control after the toolbar</button>
<p class="status" aria-live="polite">{{ message() }}</p>
<p class="note">Ends wrap around (<code>loop</code> is on) and the disabled button is skipped. Arrows for the other direction are ignored.</p>
</div>
</div>
    `,
  };

  orientation = signal<"horizontal" | "vertical">("horizontal");
  horizontal = computed(() => this.orientation() === "horizontal");
  vertical = computed(() => this.orientation() === "vertical");
  last = signal("");
  message = computed(() => (this.last() ? `Focus is on: ${this.last()}` : "Tab into the toolbar to start."));

  setOrientation(value: "horizontal" | "vertical") {
    this.orientation.set(value);
  }
  seen(name: string) {
    this.last.set(name);
  }
}
