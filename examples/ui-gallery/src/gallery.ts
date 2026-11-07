import { computed, effect, html, signal } from '@gable/core';
import { email, form, minLength, required } from '@gable/core/forms';
import {
  CollapsibleTrigger, DialogTrigger, HoverCardTrigger, MenuTrigger, PopoverTrigger, UiAccordion, UiAccordionItem, UiAlert, UiAlertDescription, UiAlertDialog, UiAlertTitle, UiAvatar, UiBadge,
  UiBreadcrumb, UiBreadcrumbItem, UiBreadcrumbLink, UiBreadcrumbList, UiBreadcrumbPage, UiBreadcrumbSeparator, UiButton, UiCard, UiCardContent, UiCardDescription, UiCardFooter, UiCardHeader,
  UiCardTitle, UiCheckbox, UiCollapsible, UiCombobox, UiContextMenu, UiDialog, UiDropdownMenu, UiField, UiFieldControl, UiForm, UiHoverCard, UiInput, UiLabel, UiPagination, UiPopover,
  UiProgress, UiRadioGroup, UiScrollArea, UiSelect, UiSeparator, UiSheet, UiSkeleton, UiSlider, UiSwitch, UiTab, UiTable, UiTableBody, UiTableCaption, UiTableCell, UiTableHead,
  UiTableHeader, UiTableRow, UiTabs, UiTextarea, UiToggle, UiToggleGroup, UiTooltip, type MenuEntry, type SelectItem,
} from '@gable/ui';

const FRUIT: SelectItem[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'grapes', label: 'Grapes', disabled: true },
  { value: 'pineapple', label: 'Pineapple' },
];

/** Every gable-ui component on one page. */
export class Gallery {
  static meta = {
    selector: 'app-root',
    imports: [
      UiButton, UiDialog, DialogTrigger, UiPopover, PopoverTrigger, UiTabs, UiTab, UiTooltip, UiSelect,
      UiLabel, UiInput, UiTextarea, UiCheckbox, UiSwitch, UiRadioGroup, UiSlider, UiToggle, UiToggleGroup, UiBadge, UiCard, UiCardHeader, UiCardTitle, UiCardDescription, UiCardContent, UiCardFooter,
      UiAlert, UiAlertTitle, UiAlertDescription, UiSeparator, UiSkeleton, UiProgress, UiAvatar, UiAccordion, UiAccordionItem, UiCollapsible, CollapsibleTrigger, UiDropdownMenu, MenuTrigger,
      UiContextMenu, UiCombobox, UiAlertDialog, UiSheet, UiTable, UiTableHeader, UiTableBody, UiTableRow, UiTableHead, UiTableCell, UiTableCaption, UiBreadcrumb, UiBreadcrumbList,
      UiBreadcrumbItem, UiBreadcrumbLink, UiBreadcrumbPage, UiBreadcrumbSeparator, UiPagination, UiScrollArea, UiHoverCard, HoverCardTrigger, UiForm, UiField, UiFieldControl,
    ],
    template: html`
      <main class="mx-auto flex max-w-3xl flex-col gap-10 p-8">
        <header class="flex items-center justify-between">
          <h1 class="text-2xl font-semibold tracking-tight">gable-ui</h1>
          <button uiButton variant="outline" size="sm" (click)="toggleTheme()">{{ themeLabel() }}</button>
        </header>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Button</h2>
          <div class="flex flex-wrap items-center gap-2">
            <button uiButton>Default</button>
            <button uiButton variant="secondary">Secondary</button>
            <button uiButton variant="outline">Outline</button>
            <button uiButton variant="ghost">Ghost</button>
            <button uiButton variant="link">Link</button>
            <button uiButton variant="destructive">Destructive</button>
            <button uiButton size="sm">Small</button>
            <button uiButton size="lg">Large</button>
            <button uiButton [disabled]="true">Disabled</button>
          </div>
          <p class="text-sm text-muted-foreground">Clicked {{ clicks() }} times.</p>
          <div><button uiButton (click)="increment()">Count</button></div>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Tooltip</h2>
          <div class="flex gap-2">
            <button uiButton variant="outline" uiTooltip="Top (default)">Top</button>
            <button uiButton variant="outline" uiTooltip="On the right" placement="right">Right</button>
            <button uiButton variant="outline" uiTooltip="Below" placement="bottom">Bottom</button>
            <button uiButton variant="outline" uiTooltip="On the left" placement="left">Left</button>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Dialog</h2>
          <ui-dialog [(open)]="dialogOpen" heading="Edit profile" description="Make changes to your profile here. Click save when you are done.">
            <button slot="trigger" dialogTrigger uiButton variant="outline">Edit profile</button>
            <label class="grid gap-2 text-sm font-medium">
              Name
              <input class="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" [value]="name()" (input)="name.set($event.currentTarget.value)" />
            </label>
            <div slot="footer"><button uiButton (click)="dialogOpen.set(false)">Save changes</button></div>
          </ui-dialog>
          <p class="text-sm text-muted-foreground">Name: {{ name() }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Popover</h2>
          <ui-popover placement="bottom-start" contentClass="w-72">
            <button slot="trigger" popoverTrigger uiButton variant="outline">Open popover</button>
            <div class="grid gap-2">
              <h3 class="font-medium leading-none">Dimensions</h3>
              <p class="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
              <input class="h-8 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" value="100%" />
            </div>
          </ui-popover>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Select</h2>
          <ui-select [items]="fruit" [(value)]="fruitValue" placeholder="Select a fruit" triggerClass="w-[200px]"></ui-select>
          <p class="text-sm text-muted-foreground">Selected: {{ chosenLabel() }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Tabs</h2>
          <ui-tabs [(value)]="tab">
            <ui-tab value="account" label="Account"><p class="rounded-lg border p-4 text-sm">Make changes to your account here.</p></ui-tab>
            <ui-tab value="password" label="Password"><p class="rounded-lg border p-4 text-sm">Change your password here.</p></ui-tab>
            <ui-tab value="billing" label="Billing" [disabled]="true"><p>Billing</p></ui-tab>
          </ui-tabs>
        </section>
        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Form and Field</h2>
          <ui-form [submit]="signup.submit" [action]="save" (submitted)="signupResult.set($event)" class="grid max-w-sm gap-4">
            <ui-field [state]="signup.name.state" label="Name" description="Your full name.">
              <input uiInput uiFieldControl [field]="signup.name" />
            </ui-field>
            <ui-field [state]="signup.email.state" label="Email" [messages]="emailMessages">
              <input uiInput uiFieldControl [field]="signup.email" type="email" />
            </ui-field>
            <div><button uiButton type="submit">Sign up</button></div>
          </ui-form>
          <p class="text-sm text-muted-foreground">Result: {{ signupResult() }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Inputs</h2>
          <div class="grid max-w-sm gap-3">
            <label uiLabel>Email</label>
            <input uiInput type="email" placeholder="you@example.com" />
            <textarea uiTextarea placeholder="Type your message here."></textarea>
            <ui-checkbox [(value)]="agree">Accept terms and conditions</ui-checkbox>
            <ui-switch [(value)]="airplane">Airplane mode</ui-switch>
            <ui-radio-group [items]="plans" [(value)]="plan"></ui-radio-group>
            <ui-slider [(value)]="volume" [max]="100" [step]="5"></ui-slider>
            <p class="text-sm text-muted-foreground">Agree: {{ agree() }}, airplane: {{ airplane() }}, plan: {{ plan() }}, volume: {{ volume() }}</p>
            <ui-combobox [items]="fruit" [(value)]="fruitValue" placeholder="Search fruit..."></ui-combobox>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Toggle, Toggle Group, Badge</h2>
          <div class="flex flex-wrap items-center gap-3">
            <button uiToggle variant="outline" [(pressed)]="bold">Bold</button>
            <ui-toggle-group [items]="styles" [(value)]="chosenStyles" type="multiple"></ui-toggle-group>
            <span uiBadge>Badge</span>
            <span uiBadge variant="secondary">Secondary</span>
            <span uiBadge variant="destructive">Destructive</span>
            <span uiBadge variant="outline">Outline</span>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Card, Alert, Separator, Skeleton, Progress, Avatar</h2>
          <div uiCard class="max-w-sm">
            <div uiCardHeader><h3 uiCardTitle>Create project</h3><p uiCardDescription>Deploy your new project in one click.</p></div>
            <div uiCardContent>Card content.</div>
            <div uiCardFooter><button uiButton>Deploy</button></div>
          </div>
          <div uiAlert class="max-w-sm"><div uiAlertTitle>Heads up!</div><div uiAlertDescription>You can add components to your app.</div></div>
          <div uiSeparator></div>
          <div class="flex items-center gap-3">
            <ui-avatar src="/none.png" alt="Ada" fallback="AL"></ui-avatar>
            <div uiSkeleton class="h-4 w-48"></div>
          </div>
          <ui-progress [value]="40" class="max-w-sm"></ui-progress>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Accordion and Collapsible</h2>
          <ui-accordion [(value)]="accordion" class="max-w-sm">
            <ui-accordion-item value="a" label="Is it accessible?">Yes. It follows the WAI-ARIA pattern.</ui-accordion-item>
            <ui-accordion-item value="b" label="Is it styled?">Yes, with Tailwind.</ui-accordion-item>
          </ui-accordion>
          <ui-collapsible [(open)]="more" class="max-w-sm">
            <button slot="trigger" collapsibleTrigger uiButton variant="outline">Show more</button>
            <p class="mt-2 text-sm">Hidden content.</p>
          </ui-collapsible>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Menus, Hover Card, Alert Dialog, Sheet</h2>
          <div class="flex flex-wrap items-start gap-3">
            <ui-dropdown-menu [entries]="menu()" (selected)="lastAction.set($event)" (checkedChange)="toggleMenu($event)">
              <button slot="trigger" menuTrigger uiButton variant="outline">Menu</button>
            </ui-dropdown-menu>
            <ui-context-menu [entries]="menu()" (selected)="lastAction.set($event)" class="flex h-24 w-48 items-center justify-center rounded-md border border-dashed text-sm">Right click here</ui-context-menu>
            <ui-hover-card><button slot="trigger" hoverCardTrigger uiButton variant="link">@gable</button>A web framework built on signals.</ui-hover-card>
            <ui-alert-dialog heading="Are you sure?" description="This cannot be undone." confirmLabel="Delete" (confirmed)="lastAction.set('deleted')">
              <button slot="trigger" dialogTrigger uiButton variant="destructive">Delete</button>
            </ui-alert-dialog>
            <ui-sheet heading="Edit profile" description="Make changes here." [(open)]="sheetOpen">
              <button slot="trigger" dialogTrigger uiButton variant="outline">Open sheet</button>
              <p class="text-sm">Sheet body.</p>
            </ui-sheet>
          </div>
          <p class="text-sm text-muted-foreground">Last action: {{ lastAction() }}</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-medium">Table, Breadcrumb, Pagination, Scroll Area</h2>
          <nav uiBreadcrumb>
            <ol uiBreadcrumbList>
              <li uiBreadcrumbItem><a uiBreadcrumbLink href="#">Home</a></li>
              <ui-breadcrumb-separator></ui-breadcrumb-separator>
              <li uiBreadcrumbItem><span uiBreadcrumbPage>Components</span></li>
            </ol>
          </nav>
          <table uiTable>
            <caption uiTableCaption>Invoices</caption>
            <thead uiTableHeader><tr uiTableRow><th uiTableHead>Invoice</th><th uiTableHead>Status</th></tr></thead>
            <tbody uiTableBody><tr uiTableRow><td uiTableCell>INV001</td><td uiTableCell>Paid</td></tr></tbody>
          </table>
          <ui-pagination [(page)]="page" [count]="200" [pageSize]="10"></ui-pagination>
          <ui-scroll-area class="h-24 w-64 rounded-md border p-3"><p class="text-sm">Scrollable content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.</p></ui-scroll-area>
        </section>
      </main>
    `,
  };

  dark = signal(false);
  toggleTheme() {
    this.dark.update((d) => !d);
  }
  increment() {
    this.clicks.update((n) => n + 1);
  }
  themeLabel = computed(() => (this.dark() ? 'Light mode' : 'Dark mode'));
  clicks = signal(0);
  dialogOpen = signal(false);
  name = signal('Pedro Duarte');
  fruit = FRUIT;
  fruitValue = signal('');
  chosenLabel = computed(() => this.fruitValue() || 'nothing');
  tab = signal('');

  agree = signal(false);
  airplane = signal(false);
  plans = [
    { value: 'free', label: 'Free' },
    { value: 'pro', label: 'Pro' },
    { value: 'team', label: 'Team', disabled: true },
  ];
  plan = signal('free');
  volume = signal(40);
  bold = signal(false);
  styles = [
    { value: 'italic', label: 'Italic' },
    { value: 'underline', label: 'Underline' },
  ];
  chosenStyles = signal<string[]>([]);
  accordion = signal<string[]>([]);
  more = signal(false);
  sheetOpen = signal(false);
  page = signal(1);
  lastAction = signal('none');
  menu = signal<MenuEntry[]>([
    { type: 'label', label: 'My account' },
    { value: 'profile', label: 'Profile', shortcut: 'Ctrl+P' },
    { value: 'settings', label: 'Settings' },
    { type: 'separator' },
    { type: 'checkbox', value: 'status-bar', label: 'Status bar', checked: true },
    { value: 'logout', label: 'Log out', destructive: true },
  ]);
  toggleMenu(change: { value: string; checked: boolean }) {
    this.menu.update((entries) => entries.map((entry) => (entry.type === 'checkbox' && entry.value === change.value ? { ...entry, checked: change.checked } : entry)));
  }

  signupModel = signal({ name: '', email: '' });
  signup = form(this.signupModel, (p) => {
    required(p.name);
    minLength(p.name, 3);
    email(p.email);
  });
  emailMessages = { email: 'That does not look like an email address.' };
  signupResult = signal('not submitted');
  save = () => {};

  // The dark theme is the `dark` class on <html> (a browser-only side effect, so it is skipped under the test renderer).
  private theme = effect(() => {
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', this.dark());
  });
}
