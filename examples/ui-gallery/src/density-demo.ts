import { html, signal } from '@gable/core';
import { form, required } from '@gable/core/forms';
import {
  MenuTrigger,
  UiButton,
  UiDropdownMenu,
  UiField,
  UiFieldControl,
  UiInput,
  UiInputClear,
  UiSectionHeader,
  UiSelect,
  UiTab,
  UiTabs,
  UiToggle,
  UiToggleGroup,
  type MenuEntry,
} from '@gable/ui';

/**
 * Compact density, Field layouts and the clearable input (TASK-76, TASK-78, TASK-83): the same controls at the default
 * size and at `compact` (26px controls, 12px text, 24px menu rows), a horizontal Field wrapping an input and a select, a
 * `ui-input-clear` bound to a signal and to a form field, and the 10.5px uppercase section header.
 */
export class DensityDemo {
  static meta = {
    selector: 'app-root',
    imports: [
      UiButton,
      UiInput,
      UiInputClear,
      UiSelect,
      UiToggle,
      UiToggleGroup,
      UiTabs,
      UiTab,
      UiField,
      UiFieldControl,
      UiDropdownMenu,
      MenuTrigger,
      UiSectionHeader,
    ],
    template: html`
      <main class="mx-auto flex max-w-2xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Density, fields and clearable input</h1>

        <section class="flex flex-col gap-3">
          <h2 uiSectionHeader>Compact controls</h2>
          <div class="flex flex-wrap items-center gap-2" id="compact-row">
            <button uiButton size="compact">Apply</button>
            <button uiButton variant="outline" size="compact">Cancel</button>
            <button uiButton variant="ghost" size="icon-compact" aria-label="Close">x</button>
            <input uiInput density="compact" class="w-40" placeholder="Compact input" aria-label="Compact input" />
            <ui-select density="compact" label="Compact select" [items]="roles" [(value)]="role" triggerClass="w-36"></ui-select>
            <button uiToggle size="compact" variant="outline" aria-label="Bold">B</button>
            <ui-toggle-group size="compact" variant="outline" [items]="styles" [(value)]="chosen" type="multiple"></ui-toggle-group>
            <ui-dropdown-menu density="compact" [entries]="menu">
              <button slot="trigger" menuTrigger uiButton variant="outline" size="compact">Menu</button>
            </ui-dropdown-menu>
          </div>
          <ui-tabs density="compact" [(value)]="tab">
            <ui-tab value="style" label="Style">Style panel</ui-tab>
            <ui-tab value="layout" label="Layout">Layout panel</ui-tab>
          </ui-tabs>
        </section>

        <section class="flex flex-col gap-3">
          <h2 uiSectionHeader>Default size</h2>
          <div class="flex flex-wrap items-center gap-2">
            <button uiButton>Apply</button>
            <input uiInput class="w-40" placeholder="Default input" aria-label="Default input" />
            <ui-select label="Default select" [items]="roles" [(value)]="role" triggerClass="w-36"></ui-select>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h2 uiSectionHeader>Clearable input</h2>
          <ui-input-clear [(value)]="query" label="Search classes" clearLabel="Clear search" placeholder="Search classes" class="w-64"></ui-input-clear>
          <ui-input-clear [(value)]="query" density="compact" label="Search (compact)" clearLabel="Clear compact search" placeholder="Compact search" class="w-64"></ui-input-clear>
          <p class="text-sm text-muted-foreground" id="query-value">Query: {{ query() }}</p>
          <ui-input-clear [field]="f.klass" label="Class" clearLabel="Clear class" placeholder="p-4 text-sm" class="w-64"></ui-input-clear>
        </section>

        <section class="flex flex-col gap-3">
          <h2 uiSectionHeader>Field: stacked and horizontal</h2>
          <ui-field [state]="f.name.state" label="Name" hint="Shown on your profile.">
            <input uiInput uiFieldControl [field]="f.name" />
          </ui-field>
          <ui-field layout="horizontal" density="compact" [state]="f.name.state" label="Name" hint="Compact, label beside the control.">
            <input uiInput uiFieldControl density="compact" [field]="f.name" />
          </ui-field>
          <ui-field layout="horizontal" density="compact" [state]="f.role.state" label="Role" hint="A ui-select inside a field.">
            <ui-select [field]="f.role" [items]="roles" density="compact" placeholder="Choose a role"></ui-select>
          </ui-field>
          <ui-field layout="horizontal" density="compact" label="Width" error="Must be a CSS length.">
            <input uiInput uiFieldControl density="compact" value="12" />
          </ui-field>
        </section>
      </main>
    `,
  };

  roles = [
    { value: 'admin', label: 'Admin' },
    { value: 'editor', label: 'Editor' },
    { value: 'viewer', label: 'Viewer' },
  ];
  styles = [
    { value: 'i', label: 'I' },
    { value: 'u', label: 'U' },
  ];
  menu: MenuEntry[] = [
    { type: 'label', label: 'Edit' },
    { value: 'cut', label: 'Cut', shortcut: 'Ctrl+X' },
    { value: 'copy', label: 'Copy', shortcut: 'Ctrl+C' },
    { type: 'separator' },
    { type: 'submenu', value: 'more', label: 'More', entries: [{ value: 'paste', label: 'Paste' }] },
  ];
  role = signal('');
  chosen = signal<string[]>([]);
  tab = signal('style');
  query = signal('');
  model = signal({ name: '', role: '', klass: 'p-4' });
  f = form(this.model, (p) => {
    required(p.name);
    required(p.role);
  });
}
