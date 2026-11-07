import { computed, effect, html, injectHost, input, model, signal } from "@gable/core";
import {
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type Locale,
} from "date-fns";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";
import { useDateLocale, type DateLocaleLoader, type LocaleSource } from "../lib/date-locale.js";
import { UiIcon } from "../lib/icon.js";
import { UiButton } from "./button.js";

/** What a `ui-calendar` selects: one date (`single`) or a start and end date (`range`). */
export type CalendarMode = "single" | "range";
/** A day of the week as a number: 0 is Sunday, 6 is Saturday. Used for `weekStartsOn`. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** How the month heading is shown: plain text, or with month and/or year dropdowns to jump around. */
export type CaptionLayout = "label" | "dropdown" | "dropdown-months" | "dropdown-years";
export { resolveLocale, type LocaleSource } from "../lib/date-locale.js";

const SELECT =
  "h-8 cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm font-medium shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** A selected span of days; `to` is `null` while the user has picked only the first day. */
export interface DateRange {
  from: Date | null;
  to: Date | null;
}

const NAV = "absolute top-0 size-8 bg-transparent p-0 opacity-50 hover:opacity-100";

const CELL =
  "size-9 cursor-pointer rounded-md p-0 text-center align-middle text-sm font-normal select-none outline-none " +
  "focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-disabled:cursor-default aria-disabled:opacity-50";

/** One day of the grid, as the template renders it. */
export interface CalendarCell {
  key: string;
  date: Date;
  text: string;
  label: string | null;
  selected: string | null;
  current: string | null;
  disabled: string | null;
  outside: string | null;
  rangePart: string | null;
  tabindex: string;
  hidden: boolean;
  classes: string;
}

let counter = 0;

/** `2026-11-06`: the local calendar day, used as the cell key and the `data-date` attribute. */
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * A month grid for picking a day, or a range of days. Dates are local-time `Date` objects (a time of day is dropped);
 * date maths, formatting and locales come from date-fns.
 *
 *   <ui-calendar [(value)]="day" [min]="start" [max]="end"></ui-calendar>
 *   <ui-calendar mode="range" [(range)]="stay" [locale]="fr" [weekStartsOn]="1" [isDisabled]="isWeekend"></ui-calendar>
 *
 * `mode="single"` (the default) binds `value` (`Date | null`); `mode="range"` binds `range` (`{ from, to }`): the first click
 * sets `from`, the second `to` (an earlier day swaps them), a third starts a new range. `month` is the month shown (a model, any
 * day inside it; it follows the selection when not set). `min`, `max` and the `isDisabled` predicate disable days: they cannot be
 * picked, are skipped by selection but still reachable with the arrow keys, and carry `aria-disabled`.
 *
 * Locale: unset, the calendar follows the I18n service (`I18n.locale`, `"en"` with no provider): month and weekday names come from
 * `Intl` for that locale and re-render when it changes. `locale` takes a date-fns `Locale` (for example `fr` from `date-fns/locale`) as an
 * override: it sets the names and, unless `weekStartsOn` is given, the first day of the week. `localeLoader` loads the date-fns locale
 * that matches the I18n locale (see `dateFnsLocaleNames`). The labels (`previousLabel`, `nextLabel`, `monthLabel`, `yearLabel`) are
 * translated through I18n (ids `ui.calendar.*`) unless an input overrides them.
 *
 * Semantics (WAI-ARIA date grid): a `role="grid"` table named by the month heading, column headers with the full weekday as
 * the name, `role="gridcell"` days with a full-date `aria-label`, `aria-selected` on selected days and `aria-current="date"` on today.
 * Only one day is in the tab order (roving tabindex): the focused day, else the selected, today's or the first of the month.
 * Keys: Left/Right a day, Up/Down a week, Home/End the start/end of the week, PageUp/PageDown a month, Shift+PageUp/PageDown a year,
 * Enter or Space picks. Days of the neighbouring months are shown muted and can be picked too (the grid then shows that month).
 */
export class UiCalendar {
  static meta = {
    selector: "ui-calendar",
    imports: [UiButton, UiIcon],
    template: html`
      <div class="relative flex h-8 items-center justify-center">
        <button uiButton variant="outline" type="button" [class]="prevClass" [attr.aria-label]="previousText()" [disabled]="!canPrev()" (click)="prevMonth()">
          <svg uiIcon="chevron-left"></svg>
        </button>
        <div [attr.id]="captionId" aria-live="polite" [attr.class]="captionClass()">{{ caption() }}</div>
        @if (monthDropdown()) {
          <select [attr.aria-label]="monthText()" [attr.class]="selectClass" (change)="onMonthSelect($event)">
            @for (m of monthOptions(); track m.value) {
              <option [attr.value]="m.value" [selected]="m.selected" [disabled]="m.disabled">{{ m.label }}</option>
            }
          </select>
        }
        @if (yearDropdown()) {
          <select [attr.aria-label]="yearText()" [attr.class]="selectClass" (change)="onYearSelect($event)">
            @for (y of yearOptions(); track y.value) {
              <option [attr.value]="y.value" [selected]="y.selected">{{ y.label }}</option>
            }
          </select>
        }
        <button uiButton variant="outline" type="button" [class]="nextClass" [attr.aria-label]="nextText()" [disabled]="!canNext()" (click)="nextMonth()">
          <svg uiIcon="chevron-right"></svg>
        </button>
      </div>
      <table role="grid" [attr.aria-labelledby]="captionId" [attr.aria-multiselectable]="multiselectable()" class="mt-4 border-separate border-spacing-x-0 border-spacing-y-1">
        <thead>
          <tr role="row">
            @for (d of weekdays(); track d.key) {
              <th role="columnheader" scope="col" [attr.abbr]="d.long" [attr.aria-label]="d.long" class="size-9 text-[0.8rem] font-normal text-muted-foreground">{{ d.short }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (week of weeks(); track week.key) {
            <tr role="row">
              @for (cell of week.cells; track cell.key) {
                <td
                  role="gridcell"
                  [attr.data-date]="cell.key"
                  [attr.aria-label]="cell.label"
                  [attr.aria-selected]="cell.selected"
                  [attr.aria-current]="cell.current"
                  [attr.aria-disabled]="cell.disabled"
                  [attr.data-outside]="cell.outside"
                  [attr.data-range]="cell.rangePart"
                  [attr.tabindex]="cell.tabindex"
                  [attr.class]="cell.classes"
                  (click)="pick(cell)"
                  (focus)="onFocus(cell)"
                  (keydown)="onKey($event, cell)"
                >{{ cell.text }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    `,
  };

  mode = input<CalendarMode>("single");
  /** The selected day in `single` mode. Two-way: `[(value)]="day"`. */
  value = model<Date | null>(null);
  /** The selected span in `range` mode. Two-way: `[(range)]="stay"`. */
  range = model<DateRange>({ from: null, to: null });
  /** The month shown (any day in it). Two-way. Unset, it follows the selection, then today. */
  month = model<Date | null>(null);
  /** Earliest pickable day. */
  min = input<Date | null>(null);
  /** Latest pickable day. */
  max = input<Date | null>(null);
  /** Extra rule: return `true` for a day that cannot be picked. */
  isDisabled = input<((day: Date) => boolean) | null>(null);
  /** A date-fns locale (names of months and weekdays, first day of the week), or a function returning one for a lazily loaded locale. Default: English (US). */
  locale = input<LocaleSource | undefined>(undefined);
  /** `dropdown` shows month and year selects in the heading (`dropdown-months` / `dropdown-years` only one). Years span `min` to `max`, else 100 years back and 10 ahead. */
  captionLayout = input<CaptionLayout>("label");
  /** First day of the week, 0 (Sunday) to 6. Default: the locale's. */
  weekStartsOn = input<WeekDay | undefined>(undefined);
  /** Show the days of neighbouring months in the first and last row. */
  showOutsideDays = input<boolean>(true);
  /** What "today" is. Mainly for tests and demos; default is the current date. */
  today = input<Date | null>(null);
  /**
   * Loads the date-fns locale for the I18n locale (see `dateFnsLocaleNames`): `(name) => import("date-fns/locale").then((m) => m[name])`.
   * Needed only for date-fns specifics (the first day of the week); month and weekday names follow `I18n.locale` through `Intl`.
   */
  localeLoader = input<DateLocaleLoader | undefined>(undefined);
  /** Accessible names. Unset, they are translated through the I18n service (ids `ui.calendar.*`); set them to override. */
  monthLabel = input<string | undefined>(undefined);
  yearLabel = input<string | undefined>(undefined);
  previousLabel = input<string | undefined>(undefined);
  nextLabel = input<string | undefined>(undefined);
  class = input<string>("");

  private hostRef = injectHost<HTMLElement>();
  private apply = useHostClass(() => cn("inline-block w-fit rounded-md p-3", this.class()));

  captionId = `ui-calendar-${++counter}-caption`;
  selectClass = SELECT;
  prevClass = cn(NAV, "left-1");
  nextClass = cn(NAV, "right-1");

  /** The day that has focus (or will get it): moves with the keyboard and clicks. */
  private focused = signal<Date | null>(null);
  private wantFocus = false;

  private now = computed(() => startOfDay(this.today() ?? new Date()));
  private shown = computed(() => startOfMonth(this.month() ?? this.value() ?? this.range().from ?? this.now()));
  private dl = useDateLocale(() => this.locale(), () => this.localeLoader());
  private loc = this.dl.locale;
  private options = computed(() => ({ locale: this.loc(), weekStartsOn: this.weekStartsOn() ?? this.dl.weekStart() }) as { locale?: Locale; weekStartsOn: WeekDay });
  previousText = computed(() => this.previousLabel() ?? this.dl.i18n.t`:calendar button@@ui.calendar.previous:Go to the previous month`);
  nextText = computed(() => this.nextLabel() ?? this.dl.i18n.t`:calendar button@@ui.calendar.next:Go to the next month`);
  monthText = computed(() => this.monthLabel() ?? this.dl.i18n.t`:calendar select@@ui.calendar.month:Month`);
  yearText = computed(() => this.yearLabel() ?? this.dl.i18n.t`:calendar select@@ui.calendar.year:Year`);
  monthDropdown = computed(() => this.captionLayout() === "dropdown" || this.captionLayout() === "dropdown-months");
  yearDropdown = computed(() => this.captionLayout() === "dropdown" || this.captionLayout() === "dropdown-years");
  /** With a dropdown the heading stays for assistive tech (it names the grid) but is not shown. */
  captionClass = computed(() => (this.monthDropdown() || this.yearDropdown() ? "sr-only" : "text-sm font-medium"));
  monthOptions = computed(() => {
    const shown = this.shown();
    const min = this.min();
    const max = this.max();
    return Array.from({ length: 12 }, (_, i) => {
      const first = new Date(shown.getFullYear(), i, 1);
      return {
        value: String(i),
        label: this.dl.part(first, "month"),
        selected: i === shown.getMonth(),
        disabled: (!!min && isBefore(endOfMonth(first), startOfDay(min))) || (!!max && isAfter(first, startOfDay(max))),
      };
    });
  });
  yearOptions = computed(() => {
    const year = this.shown().getFullYear();
    const now = this.now().getFullYear();
    const from = Math.min(this.min()?.getFullYear() ?? now - 100, year);
    const to = Math.max(this.max()?.getFullYear() ?? now + 10, year);
    return Array.from({ length: to - from + 1 }, (_, i) => {
      const y = from + i;
      return { value: String(y), label: String(y), selected: y === year };
    });
  });
  multiselectable = computed(() => (this.mode() === "range" ? "true" : null));
  caption = computed(() => this.dl.part(this.shown(), "caption"));
  canPrev = computed(() => !this.min() || isAfter(this.shown(), startOfDay(this.min()!)));
  canNext = computed(() => !this.max() || isBefore(endOfMonth(this.shown()), startOfDay(this.max()!)));

  weekdays = computed(() => {
    const opts = this.options();
    const start = startOfWeek(this.now(), opts);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      return { key: i, short: this.dl.part(day, "weekdayShort"), long: this.dl.part(day, "weekdayLong") };
    });
  });

  private disabledDay(day: Date): boolean {
    const min = this.min();
    const max = this.max();
    return (!!min && isBefore(day, startOfDay(min))) || (!!max && isAfter(day, startOfDay(max))) || (this.isDisabled()?.(day) ?? false);
  }

  /** The one day in the tab order: the focused day if it is in the shown month, else the selected, today, or the 1st. */
  private tabDate = computed(() => {
    const shown = this.shown();
    const inMonth = (d: Date | null) => (d && isSameMonth(d, shown) ? d : null);
    const selected = this.mode() === "range" ? this.range().from : this.value();
    return inMonth(this.focused()) ?? inMonth(selected) ?? inMonth(this.now()) ?? shown;
  });

  weeks = computed(() => {
    const opts = this.options();
    const shown = this.shown();
    const mode = this.mode();
    const value = this.value();
    const { from, to } = this.range();
    const today = this.now();
    const tab = this.tabDate();
    const outsideVisible = this.showOutsideDays();
    const first = startOfWeek(shown, opts);
    const last = endOfWeek(endOfMonth(shown), opts);
    const weeks: { key: string; cells: CalendarCell[] }[] = [];
    for (let day = first; !isAfter(day, last); ) {
      const cells: CalendarCell[] = [];
      for (let i = 0; i < 7; i++, day = addDays(day, 1)) {
        cells.push(this.cell(day, { shown, mode, value, from, to, today, tab, outsideVisible, opts }));
      }
      weeks.push({ key: cells[0]!.key, cells });
    }
    return weeks;
  });

  private cell(
    day: Date,
    s: { shown: Date; mode: CalendarMode; value: Date | null; from: Date | null; to: Date | null; today: Date; tab: Date; outsideVisible: boolean; opts: { locale?: Locale } },
  ): CalendarCell {
    const outside = !isSameMonth(day, s.shown);
    const hidden = outside && !s.outsideVisible;
    const disabled = this.disabledDay(day);
    const single = s.mode === "single";
    const start = !single && !!s.from && isSameDay(day, s.from);
    const end = !single && !!s.to && isSameDay(day, s.to);
    const middle = !single && !!s.from && !!s.to && isAfter(day, s.from) && isBefore(day, s.to);
    const selected = single ? !!s.value && isSameDay(day, s.value) : start || end || middle;
    const isToday = isSameDay(day, s.today);
    const ends = single ? selected : start || end;
    const rangePart = single ? null : start && end ? "single" : start ? "start" : end ? "end" : middle ? "middle" : null;
    return {
      key: dayKey(day),
      date: day,
      text: hidden ? "" : this.dl.part(day, "dayNumber"),
      label: hidden ? null : this.dl.part(day, "dayLabel"),
      selected: hidden ? null : selected ? "true" : "false",
      current: isToday ? "date" : null,
      disabled: disabled || hidden ? "true" : null,
      outside: outside ? "true" : null,
      rangePart,
      tabindex: !hidden && isSameDay(day, s.tab) ? "0" : "-1",
      hidden,
      classes: cn(
        CELL,
        hidden && "invisible",
        outside && "text-muted-foreground",
        !disabled && !ends && "hover:bg-accent hover:text-accent-foreground",
        isToday && !ends && "bg-accent text-accent-foreground",
        middle && "rounded-none bg-accent text-accent-foreground",
        ends && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        start && !end && !!s.to && "rounded-r-none",
        end && !start && "rounded-l-none",
      ),
    };
  }

  private focusRender = effect(() => {
    this.weeks();
    if (!this.wantFocus) return;
    this.wantFocus = false;
    const key = dayKey(this.tabDate());
    // After this flush has rendered the new cells.
    queueMicrotask(() => {
      const host = this.hostRef.host;
      host?.querySelector?.<HTMLElement>(`[data-date="${key}"]`)?.focus();
    });
  });

  /** Shows month `month` (0 to 11) of year `year`, kept inside `min` and `max`. */
  goTo(year: number, month: number): void {
    let next = new Date(year, month, 1);
    const min = this.min();
    const max = this.max();
    if (min && isBefore(endOfMonth(next), startOfDay(min))) next = startOfMonth(min);
    if (max && isAfter(next, startOfDay(max))) next = startOfMonth(max);
    this.month.set(next);
  }

  onMonthSelect(event: unknown): void {
    this.goTo(this.shown().getFullYear(), Number((event as { target: { value: string } }).target.value));
  }

  onYearSelect(event: unknown): void {
    this.goTo(Number((event as { target: { value: string } }).target.value), this.shown().getMonth());
  }

  prevMonth(): void {
    this.month.set(addMonths(this.shown(), -1));
  }

  nextMonth(): void {
    this.month.set(addMonths(this.shown(), 1));
  }

  /** Marks the focus as inside the grid, so the roving day follows clicks and Tab. */
  onFocus(cell: { date: Date; hidden: boolean }): void {
    if (!cell.hidden) this.focused.set(cell.date);
  }

  pick(cell: { date: Date; disabled: string | null; hidden: boolean }): void {
    if (cell.disabled || cell.hidden) return;
    const day = cell.date;
    this.focused.set(day);
    if (!isSameMonth(day, this.shown())) this.month.set(startOfMonth(day));
    if (this.mode() === "single") {
      this.value.set(day);
      return;
    }
    const { from, to } = this.range();
    if (!from || to) this.range.set({ from: day, to: null });
    else if (isBefore(day, from)) this.range.set({ from: day, to: from });
    else this.range.set({ from, to: day });
  }

  onKey(event: unknown, cell: { date: Date; disabled: string | null; hidden: boolean }): void {
    const e = event as { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; preventDefault(): void };
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const day = cell.date;
    const opts = this.options();
    let next: Date;
    switch (e.key) {
      case "ArrowLeft": next = addDays(day, -1); break;
      case "ArrowRight": next = addDays(day, 1); break;
      case "ArrowUp": next = addDays(day, -7); break;
      case "ArrowDown": next = addDays(day, 7); break;
      case "Home": next = startOfWeek(day, opts); break;
      case "End": next = endOfWeek(day, opts); break;
      case "PageUp": next = e.shiftKey ? addYears(day, -1) : addMonths(day, -1); break;
      case "PageDown": next = e.shiftKey ? addYears(day, 1) : addMonths(day, 1); break;
      case "Enter":
      case " ":
        e.preventDefault();
        this.pick(cell);
        return;
      default:
        return;
    }
    e.preventDefault();
    const min = this.min();
    const max = this.max();
    if (min && isBefore(next, startOfDay(min))) next = startOfDay(min);
    if (max && isAfter(next, startOfDay(max))) next = startOfDay(max);
    this.wantFocus = true;
    this.focused.set(next);
    if (!isSameMonth(next, this.shown())) this.month.set(startOfMonth(next));
    else this.focusRenderNow(next);
  }

  /** Same month: the cell exists already, so focus it without waiting for a render. */
  private focusRenderNow(day: Date): void {
    const host = this.hostRef.host;
    const el = host?.querySelector?.<HTMLElement>(`[data-date="${dayKey(day)}"]`);
    if (el) {
      this.wantFocus = false;
      el.focus();
    }
  }
}
