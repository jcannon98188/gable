import { computed, html, signal } from '@gable/core';
import { UiButton, UiCommand, UiCommandDialog, type CommandItem } from '@gable/ui';

const COMMANDS: CommandItem[] = [
  { value: 'calendar', label: 'Calendar', group: 'Suggestions' },
  { value: 'emoji', label: 'Search Emoji', group: 'Suggestions', keywords: ['smile', 'face'] },
  { value: 'calculator', label: 'Calculator', group: 'Suggestions', disabled: true },
  { value: 'profile', label: 'Profile', group: 'Settings', shortcut: 'Alt+P', keywords: ['account'] },
  { value: 'billing', label: 'Billing', group: 'Settings', shortcut: 'Alt+B' },
  { value: 'settings', label: 'Settings', group: 'Settings', shortcut: 'Alt+S', keywords: ['preferences'] },
];

/** A command list on the page, and the same list as a dialog palette (open it with the button or Ctrl+K). */
export class CommandDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiButton, UiCommand, UiCommandDialog],
    template: html`
      <main class="mx-auto flex max-w-xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Command</h1>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Inline</h2>
          <ui-command id="inline" class="rounded-lg border shadow-md" [items]="commands" (selected)="ran.set($event)"></ui-command>
          <p class="text-sm text-muted-foreground">Last command: <span id="ran">{{ ranLabel() }}</span></p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">In a dialog</h2>
          <div class="flex items-center gap-3">
            <button id="open" uiButton variant="outline" (click)="open.set(true)">Open palette</button>
            <span class="text-sm text-muted-foreground">or press Ctrl+K. The Alt+P, Alt+B and Alt+S shortcuts shown in the list work anywhere on this page.</span>
          </div>
          <ui-command-dialog [(open)]="open" [items]="commands" (selected)="ran.set($event)"></ui-command-dialog>
        </section>
      </main>
    `,
  };

  commands = COMMANDS;
  open = signal(false);
  ran = signal('');
  ranLabel = computed(() => COMMANDS.find((c) => c.value === this.ran())?.label ?? 'none');

  // A command item's `shortcut` is only a label: the app binds the keys itself. Alt+letter avoids the browser's own Ctrl shortcuts.
  private _keys = typeof document === 'undefined' ? null : document.addEventListener('keydown', (e) => this.onKey(e));

  onKey(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.open.set(true);
      return;
    }
    const hit = e.altKey && !e.ctrlKey && !e.metaKey ? COMMANDS.find((c) => c.shortcut === `Alt+${key.toUpperCase()}`) : undefined;
    if (hit) {
      e.preventDefault();
      this.ran.set(hit.value);
    }
  }
}
