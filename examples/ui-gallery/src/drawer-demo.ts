import { html, signal } from '@gable/core';
import { DialogTrigger, UiButton, UiDrawer } from '@gable/ui';

/**
 * Drawers from each edge, with drag to dismiss and snap points. Drag a panel (or its grab handle) toward its edge with a
 * mouse, finger or pen: past halfway or with a quick flick it closes. Open `/drawer.html` in the dev server.
 */
export class DrawerDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiDrawer, DialogTrigger, UiButton],
    template: html`
      <main class="flex flex-col items-start gap-6 p-8">
        <h1 class="text-2xl font-semibold">Drawer</h1>

        <section class="flex flex-col items-start gap-2">
          <h2 class="font-medium">Bottom (default)</h2>
          <ui-drawer [(open)]="bottom" heading="Move goal" description="Set your daily activity goal.">
            <button data-t="open-bottom" slot="trigger" dialogTrigger uiButton variant="outline">Open drawer</button>
            <p class="py-2 text-sm">Drag the handle down to close it, or press Escape.</p>
            <div slot="footer">
              <button data-t="submit" uiButton (click)="bottom.set(false)">Submit</button>
            </div>
          </ui-drawer>
        </section>

        <section class="flex flex-col items-start gap-2">
          <h2 class="font-medium">Snap points</h2>
          <ui-drawer [(open)]="snapping" [snapPoints]="snapPoints" [(snap)]="snap" heading="Snap points" description="Rests at 40%, or fully open.">
            <button data-t="open-snap" slot="trigger" dialogTrigger uiButton variant="outline">Open with snap points</button>
            <p class="py-2 text-sm">Resting at {{ snapLabel() }}. A flick moves one step; dragging below the lowest closes it.</p>
            <div class="h-96"></div>
          </ui-drawer>
        </section>

        <section class="flex flex-col items-start gap-2">
          <h2 class="font-medium">From the right</h2>
          <ui-drawer [(open)]="right" side="right" heading="Notifications" description="Drag to the right to dismiss.">
            <button data-t="open-right" slot="trigger" dialogTrigger uiButton variant="outline">Open from the right</button>
            <p class="py-2 text-sm">Nothing new.</p>
          </ui-drawer>
        </section>
      </main>
    `,
  };
  bottom = signal(false);
  snapping = signal(false);
  right = signal(false);
  snapPoints = [0.4, 1];
  snap = signal<number | null>(null);
  snapLabel = () => `${Math.round((this.snap() ?? 1) * 100)}%`;
}
