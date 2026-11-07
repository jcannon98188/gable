import { html, signal } from '@gable/core';
import { MenuTrigger, UiButton, UiButtonGroup, UiButtonGroupText, UiDropdownMenu, UiIcon, type MenuEntry } from '@gable/ui';

/** Button group (TASK-73): horizontal and vertical groups, a text addon and the split-button recipe. */
export class ButtonGroupDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiButton, UiButtonGroup, UiButtonGroupText, UiDropdownMenu, MenuTrigger, UiIcon],
    template: html`
      <main class="mx-auto flex max-w-xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold">Button group</h1>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Horizontal and vertical</h2>
          <ui-button-group label="Text alignment">
            <button uiButton variant="outline">Left</button>
            <button uiButton variant="outline">Center</button>
            <button uiButton variant="outline">Right</button>
          </ui-button-group>
          <ui-button-group label="Zoom" orientation="vertical">
            <button uiButton variant="outline">Zoom in</button>
            <button uiButton variant="outline">Zoom out</button>
          </ui-button-group>
          <ui-button-group label="Address">
            <span uiButtonGroupText>https://</span>
            <button uiButton variant="outline">Open</button>
          </ui-button-group>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Split button</h2>
          <ui-button-group label="Save options">
            <button uiButton class="split-main" (click)="save()">Save</button>
            <ui-dropdown-menu [entries]="entries" (selected)="picked.set($event)" placement="bottom-end">
              <button slot="trigger" menuTrigger uiButton size="icon" aria-label="More save options" class="split-chevron"><svg uiIcon="chevron-down"></svg></button>
            </ui-dropdown-menu>
          </ui-button-group>
          <p class="text-sm text-muted-foreground">Saved <span id="saved">{{ saved() }}</span> times. Last menu pick: <span id="picked">{{ picked() }}</span>.</p>
        </section>
      </main>
    `,
  };

  saved = signal(0);
  picked = signal('none');
  entries: MenuEntry[] = [
    { value: 'draft', label: 'Save as draft' },
    { value: 'copy', label: 'Save a copy' },
    { type: 'separator' },
    { value: 'discard', label: 'Discard changes', destructive: true },
  ];

  save() {
    this.saved.update((n) => n + 1);
  }
}
