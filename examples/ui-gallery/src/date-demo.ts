import { html, signal } from '@gable/core';
import { form, required } from '@gable/core/forms';
import { UiCalendar, UiDatePicker, type DateRange } from '@gable/ui';
import { fr } from 'date-fns/locale';

/** Calendar and date picker: single, range, min/max and disabled days, a locale, and a `[field]`-bound picker. */
export class DateDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiCalendar, UiDatePicker],
    template: html`
      <main class="mx-auto flex max-w-2xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Calendar and date picker</h1>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Calendar</h2>
          <ui-calendar [(value)]="day" class="border"></ui-calendar>
          <p class="text-sm text-muted-foreground" id="date-day">Selected: {{ dayText() }}</p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Range</h2>
          <ui-calendar mode="range" [(range)]="stay" class="border"></ui-calendar>
          <p class="text-sm text-muted-foreground" id="date-stay">Stay: {{ stayText() }}</p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Min, max and disabled days (no weekends)</h2>
          <ui-calendar [(value)]="limited" [min]="min" [max]="max" [isDisabled]="isWeekend" class="border"></ui-calendar>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">French locale (Monday first)</h2>
          <ui-calendar [(value)]="french" [locale]="fr" class="border"></ui-calendar>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Date picker</h2>
          <ui-date-picker [(value)]="picked" label="Date"></ui-date-picker>
          <p class="text-sm text-muted-foreground" id="date-picked">Picked: {{ pickedText() }}</p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Range picker</h2>
          <ui-date-picker mode="range" [(range)]="trip" placeholder="Pick your dates" triggerClass="w-[300px]"></ui-date-picker>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">With [field]</h2>
          <ui-date-picker [field]="booking.date" label="Booking date" [min]="min" placeholder="Choose a booking date"></ui-date-picker>
          @if (booking.date.state.touched() && booking.date.state.errors().length > 0) {
            <p class="text-sm text-destructive" id="date-error">Pick a booking date.</p>
          }
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Disabled</h2>
          <ui-date-picker [disabled]="true"></ui-date-picker>
        </section>
      </main>
    `,
  };

  day = signal<Date | null>(null);
  stay = signal<DateRange>({ from: null, to: null });
  limited = signal<Date | null>(null);
  french = signal<Date | null>(null);
  picked = signal<Date | null>(null);
  trip = signal<DateRange>({ from: null, to: null });
  fr = fr;
  min = new Date();
  max = new Date(new Date().getFullYear(), new Date().getMonth() + 2, 28);
  isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  bookingModel = signal<{ date: Date | null }>({ date: null });
  booking = form(this.bookingModel, (p) => {
    required(p.date);
  });

  private show = (d: Date | null) => (d ? d.toDateString() : 'none');
  dayText = () => this.show(this.day());
  pickedText = () => this.show(this.picked());
  stayText = () => `${this.show(this.stay().from)} to ${this.show(this.stay().to)}`;
}
