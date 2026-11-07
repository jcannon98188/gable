import { computed, effect, html, inject, input, model, output, signal } from "@gable/core";
import { DialogState, UiDialogBackdrop, UiDialogContent, UiDialogTitle, UiPortal } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

/** One command. `group` collects commands under a heading; `keywords` are extra words the search matches. */
export interface CommandItem {
  value: string;
  label: string;
  group?: string;
  /** Extra search words that are not shown, e.g. "preferences" for "Settings". */
  keywords?: string[];
  /** A hint shown at the end of the row, e.g. "Ctrl+P". Display only. */
  shortcut?: string;
  disabled?: boolean;
}

let counter = 0;

/** True when every word of `query` is in the item's label, group or keywords (case-insensitive). */
export function commandMatches(item: CommandItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [item.label, item.group ?? "", ...(item.keywords ?? [])].join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/**
 * A searchable command list (shadcn's Command, cmdk-style): a search box over a list of commands in groups.
 *
 *   <ui-command [items]="commands" (selected)="run($event)" placeholder="Type a command or search..."></ui-command>
 *
 * `items` is `{ value, label, group?, keywords?, shortcut?, disabled? }` data; commands appear under their `group` heading
 * in order of first appearance (commands without a group come first, with no heading). Typing filters: every word must
 * match the label, group or keywords, case-insensitively. Focus stays in the search box (the ARIA combobox pattern with
 * `aria-activedescendant`): ArrowDown and ArrowUp move the highlight and wrap around, Home and End jump, Enter runs the
 * highlighted command, and the mouse highlights on hover and runs on click. Disabled commands are skipped. With no match
 * the `emptyText` shows. `selected` fires with the command's `value`. The list is always filtered by `query`
 * (two-way, so it can be cleared from outside).
 *
 * Put it in a `ui-command-dialog` for the usual palette. Filtering is a plain substring match: no fuzzy ranking.
 */
export class UiCommand {
  static meta = {
    selector: "ui-command",
    template: html`
      <div class="flex h-9 items-center gap-2 border-b px-3">
        <svg class="size-4 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.3-4.3"></path>
        </svg>
        <input
          type="text"
          role="combobox"
          [attr.aria-expanded]="expanded()"
          aria-autocomplete="list"
          autocomplete="off"
          spellcheck="false"
          [attr.aria-label]="label()"
          [attr.aria-controls]="listControl()"
          [attr.aria-activedescendant]="activeId()"
          [attr.placeholder]="placeholder()"
          [value]="query()"
          (input)="onInput($event)"
          (keydown)="onKey($event)"
          class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      @if (empty()) {
        <div class="py-6 text-center text-sm" data-part="empty">{{ emptyText() }}</div>
      } @else {
        <div role="listbox" [attr.id]="listId" [attr.aria-label]="label()" class="max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto">
          @for (group of groups(); track group.key) {
            <div role="group" [attr.aria-labelledby]="group.headingId" class="overflow-hidden p-1 text-foreground">
              @if (group.heading) {
                <div role="presentation" [attr.id]="group.headingId" class="px-2 py-1.5 text-xs font-medium text-muted-foreground">{{ group.heading }}</div>
              }
              @for (row of group.rows; track row.value) {
                <div
                  role="option"
                  [attr.id]="row.id"
                  [attr.aria-selected]="row.selected"
                  [attr.aria-disabled]="row.disabled"
                  [attr.data-selected]="row.dataSelected"
                  [attr.data-disabled]="row.dataDisabled"
                  (click)="pick(row.value)"
                  (pointermove)="hover(row.value)"
                  class="relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <span class="truncate">{{ row.label }}</span>
                  @if (row.shortcut) {
                    <span class="ml-auto text-xs tracking-widest text-muted-foreground">{{ row.shortcut }}</span>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
      <div class="sr-only" role="status" aria-live="polite">{{ status() }}</div>
    `,
  };

  items = input<CommandItem[]>([]);
  placeholder = input<string>("Type a command or search...");
  emptyText = input<string>("No results found.");
  /** Accessible name of the search box and the list. */
  label = input<string>("Command palette");
  class = input<string>("");
  /** Two-way: the text in the search box. */
  query = model("");
  /** Fires with the `value` of the command that was run. */
  selected = output<string>();

  listId = `ui-command-${++counter}`;
  /** What the user highlighted; the effective highlight (`active`) falls back to the first enabled command. */
  private highlighted = signal<string | null>(null);

  private apply = useHostClass(() => cn("flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground", this.class()));

  filtered = computed(() => this.items().filter((item) => commandMatches(item, this.query())));
  empty = computed(() => this.filtered().length === 0);
  /** The commands that can be highlighted, in display order (groups are laid out in order of first appearance). */
  navigable = computed(() => this.layout().flatMap((g) => g.items).filter((item) => !item.disabled));
  active = computed(() => {
    const nav = this.navigable();
    const h = this.highlighted();
    return nav.find((item) => item.value === h) ?? nav[0] ?? null;
  });
  activeId = computed(() => {
    const a = this.active();
    return a ? this.optionId(a.value) : undefined;
  });
  expanded = computed(() => (this.empty() ? "false" : "true"));
  listControl = computed(() => (this.empty() ? undefined : this.listId));
  status = computed(() => {
    const n = this.filtered().length;
    return n === 0 ? this.emptyText() : `${n} ${n === 1 ? "result" : "results"}`;
  });

  private layout = computed(() => {
    const groups: { key: string; heading: string; items: CommandItem[] }[] = [];
    for (const item of this.filtered()) {
      const heading = item.group ?? "";
      let g = groups.find((x) => x.heading === heading);
      if (!g) groups.push((g = { key: heading, heading, items: [] }));
      g.items.push(item);
    }
    // commands without a group come first
    return groups.sort((a, b) => Number(!!a.heading) - Number(!!b.heading));
  });
  groups = computed(() => {
    const active = this.active()?.value;
    return this.layout().map((g, i) => ({
      key: g.key,
      heading: g.heading,
      headingId: `${this.listId}-group-${i}`,
      rows: g.items.map((item) => ({
        value: item.value,
        label: item.label,
        shortcut: item.shortcut,
        id: this.optionId(item.value),
        selected: item.value === active ? "true" : "false",
        dataSelected: item.value === active ? "true" : undefined,
        disabled: item.disabled ? "true" : undefined,
        dataDisabled: item.disabled ? "true" : undefined,
      })),
    }));
  });

  private optionId(value: string): string {
    return `${this.listId}-option-${this.items().findIndex((item) => item.value === value)}`;
  }

  onInput(event: unknown): void {
    this.query.set((event as { target: { value: string } }).target.value);
  }

  onKey(event: unknown): void {
    const e = event as { key: string; isComposing?: boolean; preventDefault(): void };
    if (e.isComposing) return;
    const nav = this.navigable();
    const at = nav.findIndex((item) => item.value === this.active()?.value);
    let next = -1;
    if (e.key === "ArrowDown") next = nav.length ? (at + 1) % nav.length : -1;
    else if (e.key === "ArrowUp") next = nav.length ? (at <= 0 ? nav.length - 1 : at - 1) : -1;
    else if (e.key === "Home") next = nav.length ? 0 : -1;
    else if (e.key === "End") next = nav.length ? nav.length - 1 : -1;
    else if (e.key === "Enter") {
      const a = this.active();
      if (a) {
        e.preventDefault();
        this.pick(a.value);
      }
      return;
    } else return;
    e.preventDefault();
    if (next >= 0) this.highlight(nav[next]!.value, true);
  }

  hover(value: string): void {
    if (this.highlighted() !== value) this.highlight(value, false);
  }

  pick(value: string): void {
    const item = this.items().find((i) => i.value === value);
    if (item && !item.disabled) this.selected.emit(value);
  }

  private highlight(value: string, scroll: boolean): void {
    this.highlighted.set(value);
    if (scroll) {
      const el = (globalThis as { document?: { getElementById(id: string): { scrollIntoView?(o: unknown): void } | null } }).document?.getElementById(this.optionId(value));
      el?.scrollIntoView?.({ block: "nearest" });
    }
  }

  /** Resets the highlight when the search changes, so the best match (the first) is highlighted again. */
  private reset = effect(() => {
    this.query();
    this.highlighted.set(null);
  });
}

/**
 * A command palette: `ui-command` in a modal dialog.
 *
 *   <ui-command-dialog [(open)]="open" [items]="commands" (selected)="run($event)"></ui-command-dialog>
 *
 * There is no trigger element: open it from your own button or shortcut by setting `open`. The dialog closes when a command
 * is picked (after `selected` fires) and the search box is cleared on close. Focus moves to the search box on open and is
 * restored on close; Escape and an outside click close it. `heading` is the dialog's accessible name (visually hidden).
 */
export class UiCommandDialog {
  static meta = {
    selector: "ui-command-dialog",
    providers: [DialogState],
    imports: [UiPortal, UiDialogBackdrop, UiDialogContent, UiDialogTitle, UiCommand],
    template: html`
      <ui-portal>
        <div
          uiDialogBackdrop
          class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        ></div>
        <div uiDialogContent [attr.class]="contentClasses()">
          <h2 uiDialogTitle class="sr-only">{{ heading() }}</h2>
          <ui-command [items]="items()" [placeholder]="placeholder()" [emptyText]="emptyText()" [label]="heading()" [(query)]="query" (selected)="onSelected($event)"></ui-command>
        </div>
      </ui-portal>
    `,
  };

  /** Two-way: `[(open)]="open"`. */
  open = model(false);
  items = input<CommandItem[]>([]);
  heading = input<string>("Command palette");
  placeholder = input<string>("Type a command or search...");
  emptyText = input<string>("No results found.");
  /** Extra classes for the panel; they win over the defaults. */
  contentClass = input<string>("");
  selected = output<string>();

  query = signal("");
  contentClasses = computed(() =>
    cn(
      "fixed top-[20%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] overflow-hidden rounded-lg border bg-background p-0 shadow-lg outline-none sm:max-w-lg " +
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
      this.contentClass(),
    ),
  );

  state = inject(DialogState).bind(() => ({
    open: this.open(),
    onOpenChange: (details) => this.open.set(details.open),
    // the search box, not the panel
    initialFocusEl: () => (globalThis as any).document?.getElementById(this.state.api().getContentProps().id)?.querySelector("input") ?? null,
  }));
  private clear = effect(() => {
    if (!this.open()) this.query.set("");
  });

  onSelected(value: string): void {
    this.selected.emit(value);
    this.open.set(false);
  }
}
