import { computed, effect, html, input, model, output, signal } from "@gable/core";
import { format, isAfter, isBefore, isValid, parse, startOfDay } from "date-fns";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";
import { UiIcon } from "../lib/icon.js";
import { UiButton } from "./button.js";
import { useDateLocale, type DateLocaleLoader, type LocaleSource } from "../lib/date-locale.js";
import { UiCalendar, type CalendarMode, type CaptionLayout, type DateRange, type WeekDay } from "./calendar.js";
import { PopoverTrigger, UiPopover } from "./popover.js";

const INPUT =
  "h-9 w-[200px] min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";
const TYPEABLE_TRIGGER = "size-9 justify-center p-0 aria-invalid:border-destructive";
const TRIGGER = "w-[240px] justify-start px-3 text-left font-normal data-[empty=true]:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

/**
 * A button that opens a popover with a `ui-calendar`, showing the chosen date on the button.
 *
 *   <ui-date-picker [(value)]="birthday" placeholder="Pick a date"></ui-date-picker>
 *   <ui-date-picker [field]="form.birthday" [min]="today" label="Birthday"></ui-date-picker>
 *   <ui-date-picker mode="range" [(range)]="stay" [locale]="fr"></ui-date-picker>
 *
 * `value` (`Date | null`) is the model, so `[field]` works: `disabled`, `readonly` and `invalid` follow the forms convention and
 * `touched` fires when the popover closes. `mode="range"` binds `range` instead (not `[field]`-bindable). The popover closes when a
 * day is picked (a range: when both ends are). `min`, `max`, `isDisabled`, `locale`, `weekStartsOn` and `showOutsideDays` go to the
 * calendar; `displayFormat` is a date-fns pattern (default `PPP`, "November 6th, 2026") used for the button text, in the `locale`.
 * `name` renders a hidden input with the ISO date (`yyyy-MM-dd`; a range: `from/to`) for a native form post.
 *
 * `typeable` (single mode) adds a text input beside a calendar button: type a date in the `displayFormat` pattern and it is parsed
 * with date-fns when you press Enter or leave the box (an empty box clears the value). Text that does not parse, or names a day
 * outside `min` / `max` or one `isDisabled` rejects, leaves the value alone and marks the input `aria-invalid`. `captionLayout="dropdown"`
 * gives the calendar month and year dropdowns. `locale` can also be a function returning a (lazily loaded) date-fns locale.
 *
 * Escape, an outside click and a pick close it and focus returns to the button. The button is named by its text (the date or
 * the placeholder); pass `label` to prefix a better accessible name ("Birthday: November 6th, 2026").
 */
export class UiDatePicker {
  static meta = {
    selector: "ui-date-picker",
    imports: [UiPopover, PopoverTrigger, UiButton, UiIcon, UiCalendar],
    template: html`
      @if (typeable()) {
        <input
          type="text"
          autocomplete="off"
          [attr.class]="inputClasses()"
          [value]="inputText()"
          [attr.placeholder]="placeholderText()"
          [attr.aria-label]="inputLabel()"
          [attr.aria-invalid]="inputInvalid()"
          [attr.readonly]="readonlyAttr()"
          [disabled]="disabled()"
          (input)="onType($event)"
          (change)="commitDraft()"
          (keydown)="onTypeKey($event)"
          (blur)="onTypeBlur()"
        />
      }
      <ui-popover [(open)]="open" placement="bottom-start" contentClass="w-auto p-0" [label]="dialogLabel()">
        <button
          slot="trigger"
          popoverTrigger
          uiButton
          variant="outline"
          type="button"
          [class]="triggerClasses()"
          [disabled]="blocked()"
          [attr.aria-label]="buttonLabel()"
          [attr.aria-invalid]="invalidAttr()"
          [attr.data-empty]="emptyAttr()"
        >
          <svg uiIcon="calendar"></svg>
          @if (!typeable()) {
            <span class="truncate">{{ text() }}</span>
          }
        </button>
        <ui-calendar
          [mode]="mode()"
          [(value)]="value"
          [(range)]="range"
          [min]="min()"
          [max]="max()"
          [isDisabled]="isDisabled()"
          [locale]="locale()"
          [localeLoader]="localeLoader()"
          [captionLayout]="captionLayout()"
          [weekStartsOn]="weekStartsOn()"
          [showOutsideDays]="showOutsideDays()"
          [today]="today()"
        ></ui-calendar>
      </ui-popover>
      @if (name()) {
        <input type="hidden" [attr.name]="name()" [value]="isoValue()" />
      }
    `,
  };

  mode = input<CalendarMode>("single");
  /** Two-way: `[(value)]="date"`. */
  value = model<Date | null>(null);
  /** Two-way in `range` mode. */
  range = model<DateRange>({ from: null, to: null });
  open = model(false);
  min = input<Date | null>(null);
  max = input<Date | null>(null);
  isDisabled = input<((day: Date) => boolean) | null>(null);
  locale = input<LocaleSource | undefined>(undefined);
  /** Loads the date-fns locale for the I18n locale (`(name) => import("date-fns/locale").then((m) => m[name])`), used for `displayFormat`, parsing and the calendar. */
  localeLoader = input<DateLocaleLoader | undefined>(undefined);
  /** Passed to the calendar: month and year dropdowns in its heading. */
  captionLayout = input<CaptionLayout>("label");
  weekStartsOn = input<WeekDay | undefined>(undefined);
  showOutsideDays = input<boolean>(true);
  today = input<Date | null>(null);
  /** date-fns pattern of the date on the button. */
  displayFormat = input<string>("PPP");
  /** Single mode: add a text input for typing the date in `displayFormat`. */
  typeable = input<boolean>(false);
  /** Text of the empty button. Unset, it is translated through the I18n service (`ui.datePicker.placeholder`). */
  placeholder = input<string | undefined>(undefined);
  /** Names the field for screen readers: the button reads "label: date". */
  label = input<string>("");
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  invalid = input<boolean>(false);
  /** Name of a hidden input carrying the ISO date in a native form post. */
  name = input<string>("");
  triggerClass = input<string>("");
  class = input<string>("");
  touched = output();

  private apply = useHostClass(() => cn(this.typeable() ? "inline-flex items-center gap-1" : "inline-block", this.class()));

  private dl = useDateLocale(() => this.locale(), () => this.localeLoader());
  private effectiveLocale = this.dl.locale;
  placeholderText = computed(() => this.placeholder() ?? this.dl.i18n.t`:date picker empty button@@ui.datePicker.placeholder:Pick a date`);
  dialogLabel = computed(
    () =>
      this.label() ||
      (this.mode() === "range" ? this.dl.i18n.t`:date picker dialog name@@ui.datePicker.chooseDates:Choose dates` : this.dl.i18n.t`:date picker dialog name@@ui.datePicker.chooseDate:Choose date`),
  );
  blocked = computed(() => this.disabled() || this.readonly());
  triggerClasses = computed(() => cn(this.typeable() ? TYPEABLE_TRIGGER : TRIGGER, this.triggerClass()));
  invalidAttr = computed(() => (this.invalid() ? "true" : null));
  inputClasses = computed(() => cn(INPUT, this.triggerClass()));
  readonlyAttr = computed(() => (this.readonly() ? "" : null));
  inputLabel = computed(() => this.label() || this.dl.i18n.t`:date picker text input name@@ui.datePicker.date:Date`);
  /** What the user is typing; `null` shows the value formatted. */
  private draft = signal<string | null>(null);
  private typedInvalid = signal(false);
  inputInvalid = computed(() => (this.invalid() || this.typedInvalid() ? "true" : null));
  inputText = computed(() => {
    const draft = this.draft();
    if (draft !== null) return draft;
    const v = this.value();
    return v ? format(v, this.displayFormat(), { locale: this.effectiveLocale() }) : "";
  });
  private clearDraft = effect(() => {
    this.value();
    this.draft.set(null);
    this.typedInvalid.set(false);
  });
  private hasValue = computed(() => (this.mode() === "range" ? !!this.range().from : !!this.value()));
  emptyAttr = computed(() => (this.hasValue() ? "false" : "true"));

  text = computed(() => {
    const opts = { locale: this.effectiveLocale() };
    const pattern = this.displayFormat();
    if (this.mode() === "single") {
      const v = this.value();
      return v ? format(v, pattern, opts) : this.placeholderText();
    }
    const { from, to } = this.range();
    if (!from) return this.placeholderText();
    return to ? `${format(from, pattern, opts)} - ${format(to, pattern, opts)}` : `${format(from, pattern, opts)} -`;
  });
  buttonLabel = computed(() => (this.typeable() ? this.dialogLabel() : this.label() ? `${this.label()}: ${this.text()}` : null));
  isoValue = computed(() => {
    const iso = (d: Date | null) => (d ? format(d, "yyyy-MM-dd") : "");
    if (this.mode() === "single") return iso(this.value());
    const { from, to } = this.range();
    return from ? `${iso(from)}/${iso(to)}` : "";
  });

  onType(event: unknown): void {
    this.draft.set((event as { target: { value: string } }).target.value);
    this.typedInvalid.set(false);
  }

  onTypeKey(event: unknown): void {
    const e = event as { key: string; isComposing?: boolean };
    if (e.key === "Enter" && !e.isComposing) this.commitDraft();
  }

  onTypeBlur(): void {
    this.commitDraft();
    this.touched.emit();
  }

  /** Parses what was typed: empty clears, a valid allowed day is picked, anything else marks the input invalid. */
  commitDraft(): void {
    const text = this.draft();
    if (text === null || this.blocked()) return;
    if (!text.trim()) {
      this.draft.set(null);
      this.value.set(null);
      return;
    }
    const day = parse(text.trim(), this.displayFormat(), this.today() ?? new Date(), { locale: this.effectiveLocale() });
    if (!isValid(day) || !this.allowed(day)) {
      this.typedInvalid.set(true);
      return;
    }
    this.typedInvalid.set(false);
    this.draft.set(null);
    const current = this.value();
    this.value.set(current && startOfDay(current).getTime() === startOfDay(day).getTime() ? current : startOfDay(day));
  }

  private allowed(day: Date): boolean {
    const min = this.min();
    const max = this.max();
    if (min && isBefore(startOfDay(day), startOfDay(min))) return false;
    if (max && isAfter(startOfDay(day), startOfDay(max))) return false;
    return !(this.isDisabled()?.(day) ?? false);
  }

  private seen: string | undefined = undefined;
  /** A pick (the calendar writes the models) closes the popover: a day, or a complete range. */
  private closeOnPick = effect(() => {
    const { from, to } = this.range();
    const single = this.mode() === "single";
    const selection = single ? String(this.value()?.getTime() ?? "") : `${from?.getTime() ?? ""}/${to?.getTime() ?? ""}`;
    const complete = single ? !!this.value() : !!to;
    if (this.seen !== undefined && selection !== this.seen && complete) this.open.set(false);
    this.seen = selection;
  });

  private wasOpen = false;
  /** `touched` fires when the popover closes, however it closes. */
  private touchOnClose = effect(() => {
    const open = this.open();
    if (this.wasOpen && !open) this.touched.emit();
    this.wasOpen = open;
  });
}
