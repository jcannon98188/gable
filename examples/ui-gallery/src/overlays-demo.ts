import { computed, html, signal } from '@gable/core';
import { DialogTrigger, UiBindingPicker, UiButton, UiDialog, UiTooltip, type CommandItem } from '@gable/ui';

const SIGNALS: CommandItem[] = [
  { value: 'count', label: 'count', badge: 'number', group: 'Component' },
  { value: 'name', label: 'name', badge: 'string', group: 'Component' },
  { value: 'items', label: 'items', badge: 'Item[]', group: 'Component' },
  { value: 'theme', label: 'theme', badge: 'Theme', group: 'App' },
  { value: 'online', label: 'online', badge: 'boolean', group: 'App' },
];

/** A binding picker (popover + command with type tags), a tooltip on a disabled control, and a dialog footer. */
export class OverlaysDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiBindingPicker, UiButton, UiDialog, DialogTrigger, UiTooltip],
    template: html`
      <main class="mx-auto flex max-w-xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Overlays</h1>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Binding picker</h2>
          <ui-binding-picker id="picker" class="w-64" [items]="signals" [(value)]="bound" (picked)="count.update(plusOne)"></ui-binding-picker>
          <p class="text-sm text-muted-foreground">Bound to: <span id="bound">{{ boundText() }}</span> (picked {{ count() }} times)</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Tooltip on a disabled control</h2>
          <span id="wrap" uiTooltip="Unavailable on macOS and Linux" [focusable]="true" class="inline-flex w-fit [&>*]:pointer-events-none">
            <button uiButton variant="outline" disabled>Install service</button>
          </span>
          <p class="text-sm text-muted-foreground">Hover the button or Tab to it: the wrapper takes focus and the button stays disabled.</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Dialog footer</h2>
          <ui-dialog [(open)]="open" heading="Discard changes" description="Your edits to this route will be lost.">
            <button id="open-dialog" slot="trigger" dialogTrigger uiButton variant="outline">Discard...</button>
            <div slot="footer">
              <button id="cancel" uiButton variant="outline" (click)="open.set(false)">Cancel</button>
              <button id="discard" uiButton variant="destructive" (click)="open.set(false)">Discard</button>
            </div>
          </ui-dialog>
        </section>
      </main>
    `,
  };

  signals = SIGNALS;
  bound = signal<string | null>(null);
  boundText = computed(() => this.bound() ?? 'nothing');
  count = signal(0);
  plusOne = (n: number) => n + 1;
  open = signal(false);
}
