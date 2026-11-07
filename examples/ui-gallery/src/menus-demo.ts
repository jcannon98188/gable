import { html, signal } from '@gable/core';
import { MenuTrigger, UiButton, UiContextMenu, UiDropdownMenu, UiRangeSlider, type MenuEntry } from '@gable/ui';

const flip = (list: MenuEntry[], value: string, checked: boolean): MenuEntry[] =>
  list.map((entry) => (entry.type === 'checkbox' && entry.value === value ? { ...entry, checked } : entry.type === 'submenu' ? { ...entry, entries: flip(entry.entries, value, checked) } : entry));

/** Submenus, radio items and the range slider (TASK-54): a dropdown menu, a context menu and a two-thumb slider. */
export class MenusDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiButton, UiDropdownMenu, MenuTrigger, UiContextMenu, UiRangeSlider],
    template: html`
      <main class="mx-auto flex max-w-xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold">Menus and range slider</h1>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Dropdown menu</h2>
          <ui-dropdown-menu [entries]="entries()" (selected)="last.set($event)" (checkedChange)="onChecked($event)" (radioChange)="onRadio($event)">
            <button slot="trigger" menuTrigger uiButton variant="outline" class="menu-trigger">Open menu</button>
          </ui-dropdown-menu>
          <p class="text-sm text-muted-foreground">Last picked: <span id="last">{{ last() }}</span>. Theme: <span id="theme">{{ theme() }}</span>. ArrowRight opens a submenu, ArrowLeft closes it.</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Context menu</h2>
          <ui-context-menu [entries]="entries()" (selected)="last.set($event)" (checkedChange)="onChecked($event)" (radioChange)="onRadio($event)" class="block h-32 rounded-md border border-dashed p-4 text-sm">
            Right click here
          </ui-context-menu>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Range slider</h2>
          <ui-range-slider [(value)]="price" [min]="0" [max]="500" [step]="10" [minGap]="1" [labels]="priceLabels"></ui-range-slider>
          <p class="text-sm text-muted-foreground">Price: <span id="price">{{ price() }}</span></p>
        </section>
      </main>
    `,
  };

  last = signal('none');
  theme = signal('light');
  price = signal([100, 300]);
  priceLabels = ['Minimum price', 'Maximum price'];
  entries = signal<MenuEntry[]>([
    { type: 'label', label: 'File' },
    { value: 'new', label: 'New file', shortcut: 'Ctrl+N' },
    {
      type: 'submenu',
      value: 'share',
      label: 'Share',
      entries: [
        { value: 'email', label: 'Email' },
        { value: 'link', label: 'Copy link' },
        { type: 'checkbox', value: 'public', label: 'Public', checked: false },
        { type: 'submenu', value: 'social', label: 'Social', entries: [{ value: 'mastodon', label: 'Mastodon' }, { value: 'bluesky', label: 'Bluesky' }] },
      ],
    },
    { type: 'separator' },
    {
      type: 'radio-group',
      name: 'theme',
      label: 'Theme',
      value: 'light',
      items: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'system', label: 'System' },
      ],
    },
  ]);

  onChecked(event: { value: string; checked: boolean }): void {
    this.entries.update((list) => flip(list, event.value, event.checked));
  }
  onRadio(event: { group: string; value: string }): void {
    this.theme.set(event.value);
    this.entries.update((list) => list.map((entry) => (entry.type === 'radio-group' && entry.name === event.group ? { ...entry, value: event.value } : entry)));
  }
}
