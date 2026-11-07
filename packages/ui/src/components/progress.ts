import { computed, html, inject, input } from "@gable/core";
import { ProgressState, UiProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";

/**
 * A progress bar: `<ui-progress [value]="percent()"></ui-progress>`. `value` is between `min` (0) and `max` (100);
 * leave it `null` for an indeterminate bar.
 */
export class UiProgress {
  static meta = {
    selector: "ui-progress",
    host: { class: "block" },
    providers: [ProgressState],
    imports: [UiProps],
    template: html`
      <div [uiProps]="rootProps()" [attr.class]="rootClasses()">
        <div [uiProps]="trackProps()" class="h-full w-full overflow-hidden rounded-full">
          <div [uiProps]="rangeProps()" class="h-full bg-primary transition-all data-[state=indeterminate]:w-1/3 data-[state=indeterminate]:animate-pulse"></div>
        </div>
      </div>
    `,
  };

  value = input<number | null>(0);
  min = input<number>(0);
  max = input<number>(100);
  class = input<string>("");

  state = inject(ProgressState).bind(() => ({ value: this.value(), min: this.min(), max: this.max() }));
  rootProps = computed(() => this.state.api().getRootProps());
  trackProps = computed(() => this.state.api().getTrackProps());
  rangeProps = computed(() => this.state.api().getRangeProps());
  rootClasses = computed(() => cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", this.class()));
}
