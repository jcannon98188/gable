import { computed, effect, html, input, model, output } from "@gable/core";
import { format, type Locale } from "date-fns";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";
import { UiIcon } from "../lib/icon.js";
import { UiButton } from "./button.js";
import { UiCalendar, type CalendarMode, type DateRange, type WeekDay } from "./calendar.js";
import { PopoverTrigger, UiPopover } from "./popover.js";

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
 * Escape, an outside click and a pick close it and focus returns to the button. The button is named by its text (the date or
 * the placeholder); pass `label` to prefix a better accessible name ("Birthday: November 6th, 2026").
 */
export class UiDatePicker {
  static meta = {
    selector: "ui-date-picker",
    imports: [UiPopover, PopoverTrigger, UiButton, UiIcon, UiCalendar],
    template: html`
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
          <span class="truncate">{{ text() }}</span>
        </button>
        <ui-calendar
          [mode]="mode()"
          [(value)]="value"
          [(range)]="range"
          [min]="min()"
          [max]="max()"
          [isDisabled]="isDisabled()"
          [locale]="locale()"
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
  locale = input<Locale | undefined>(undefined);
  weekStartsOn = input<WeekDay | undefined>(undefined);
  showOutsideDays = input<boolean>(true);
  today = input<Date | null>(null);
  /** date-fns pattern of the date on the button. */
  displayFormat = input<string>("PPP");
  placeholder = input<string>("Pick a date");
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

  private apply = useHostClass(() => cn("inline-block", this.class()));

  dialogLabel = computed(() => this.label() || (this.mode() === "range" ? "Choose dates" : "Choose date"));
  blocked = computed(() => this.disabled() || this.readonly());
  triggerClasses = computed(() => cn(TRIGGER, this.triggerClass()));
  invalidAttr = computed(() => (this.invalid() ? "true" : null));
  private hasValue = computed(() => (this.mode() === "range" ? !!this.range().from : !!this.value()));
  emptyAttr = computed(() => (this.hasValue() ? "false" : "true"));

  text = computed(() => {
    const opts = { locale: this.locale() };
    const pattern = this.displayFormat();
    if (this.mode() === "single") {
      const v = this.value();
      return v ? format(v, pattern, opts) : this.placeholder();
    }
    const { from, to } = this.range();
    if (!from) return this.placeholder();
    return to ? `${format(from, pattern, opts)} - ${format(to, pattern, opts)}` : `${format(from, pattern, opts)} -`;
  });
  buttonLabel = computed(() => (this.label() ? `${this.label()}: ${this.text()}` : null));
  isoValue = computed(() => {
    const iso = (d: Date | null) => (d ? format(d, "yyyy-MM-dd") : "");
    if (this.mode() === "single") return iso(this.value());
    const { from, to } = this.range();
    return from ? `${iso(from)}/${iso(to)}` : "";
  });

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
