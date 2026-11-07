import { html, signal } from '@gable/core';
import { MenuTrigger, UiButton, UiButtonGroup, UiButtonGroupText, UiDropdownMenu, UiIcon, UiToggleGroup, type MenuEntry, type ToggleGroupItem } from '@gable/ui';

/** Button group (TASK-73): horizontal and vertical groups, a text addon and the split-button recipe. */
export class ButtonGroupDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiButton, UiButtonGroup, UiButtonGroupText, UiDropdownMenu, MenuTrigger, UiIcon, UiToggleGroup],
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

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Segmented control, small</h2>
          <ui-toggle-group class="modes" aria-label="Mode" [items]="modes" [(value)]="mode" [segmented]="true" size="sm"></ui-toggle-group>
          <ui-button-group label="Device" [segmented]="true" size="sm" class="devices">
            <button uiButton variant="ghost" [attr.aria-pressed]="phoneOn()" (click)="device.set('phone')">Phone</button>
            <button uiButton variant="ghost" [attr.aria-pressed]="tabletOn()" (click)="device.set('tablet')">Tablet</button>
            <button uiButton variant="ghost" [attr.aria-pressed]="desktopOn()" (click)="device.set('desktop')">Desktop</button>
          </ui-button-group>
          <p class="text-sm text-muted-foreground">Mode <span id="mode">{{ mode() }}</span>, device <span id="device">{{ device() }}</span>. The toggle group is one tab stop with arrow keys; the button group is one tab stop per button.</p>
        </section>
      </main>
    `,
  };

  modes: ToggleGroupItem[] = [
    { value: 'design', label: 'Design' },
    { value: 'code', label: 'Code' },
    { value: 'preview', label: 'Preview' },
    { value: 'calendar', label: 'Schedule view', icon: 'calendar', iconOnly: true },
  ];
  mode = signal<string[]>(['design']);
  device = signal('phone');
  phoneOn = () => (this.device() === 'phone' ? 'true' : 'false');
  tabletOn = () => (this.device() === 'tablet' ? 'true' : 'false');
  desktopOn = () => (this.device() === 'desktop' ? 'true' : 'false');
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
