import { computed, html, inject, input, model, output } from "@gable/core";
import { SliderState, UiProps, type PropBag } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";

/**
 * A single-thumb slider (`ui-range-slider` below has two or more thumbs).
 *
 *   <ui-slider [(value)]="volume" [min]="0" [max]="100" [step]="5"></ui-slider>
 *
 * `value` is a number (the model, so `[field]` works). Arrow keys, Home, End, Page Up/Down and dragging move the thumb.
 */
export class UiSlider {
  static meta = {
    selector: "ui-slider",
    host: { class: "block" },
    providers: [SliderState],
    imports: [UiProps],
    template: html`
      <div [uiProps]="rootProps()" [attr.class]="rootClasses()">
        <div [uiProps]="controlProps()" class="relative flex w-full touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-[disabled]:opacity-50">
          <div [uiProps]="trackProps()" class="relative h-1.5 grow overflow-hidden rounded-full bg-muted data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5">
            <div [uiProps]="rangeProps()" class="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"></div>
          </div>
          <div
            [uiProps]="thumbProps()"
            class="block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] outline-none hover:ring-4 data-[focus-visible]:ring-4 data-[disabled]:pointer-events-none"
          >
            <input [uiProps]="inputProps()" (blur)="touched.emit()" />
          </div>
        </div>
      </div>
    `,
  };

  /** Two-way: `[(value)]="volume"`. */
  value = model(0);
  min = input<number>(0);
  max = input<number>(100);
  step = input<number>(1);
  orientation = input<"horizontal" | "vertical">("horizontal");
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  invalid = input<boolean>(false);
  class = input<string>("");
  touched = output();

  state = inject(SliderState).bind(() => ({
    value: [this.value()],
    onValueChange: (details) => this.value.set(details.value[0] ?? 0),
    min: this.min(),
    max: this.max(),
    step: this.step(),
    orientation: this.orientation(),
    disabled: this.disabled(),
    readOnly: this.readonly(),
    invalid: this.invalid(),
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  controlProps = computed(() => this.state.api().getControlProps());
  trackProps = computed(() => this.state.api().getTrackProps());
  rangeProps = computed(() => this.state.api().getRangeProps());
  thumbProps = computed(() => this.state.api().getThumbProps({ index: 0 }));
  inputProps = computed(() => this.state.api().getHiddenInputProps({ index: 0 }));
  rootClasses = computed(() => cn("relative flex w-full touch-none items-center select-none data-[orientation=vertical]:h-44 data-[orientation=vertical]:w-auto", this.class()));
}

/** A thumb of a range slider: the bags the template spreads. */
export interface RangeThumb {
  index: number;
  props: PropBag;
  inputProps: PropBag;
}

/**
 * A slider with two or more thumbs: a price range, a time window.
 *
 *   <ui-range-slider [(value)]="price" [min]="0" [max]="500" [step]="10" [labels]="['Minimum price', 'Maximum price']"></ui-range-slider>
 *
 * `value` is an array with one number per thumb (`[20, 80]` is two thumbs; three numbers make three thumbs); it is the
 * model, so `[field]` works. The thumbs cannot cross; `minGap` keeps them at least that many steps apart. Each thumb is
 * a `role="slider"` and needs its own accessible name, so pass `labels` (one per thumb). Keys and dragging work as in `ui-slider`.
 */
export class UiRangeSlider {
  static meta = {
    selector: "ui-range-slider",
    host: { class: "block" },
    providers: [SliderState],
    imports: [UiProps],
    template: html`
      <div [uiProps]="rootProps()" [attr.class]="rootClasses()">
        <div [uiProps]="controlProps()" class="relative flex w-full touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-[disabled]:opacity-50">
          <div [uiProps]="trackProps()" class="relative h-1.5 grow overflow-hidden rounded-full bg-muted data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5">
            <div [uiProps]="rangeProps()" class="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"></div>
          </div>
          @for (thumb of thumbs(); track thumb.index) {
            <div
              [uiProps]="thumb.props"
              class="block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] outline-none hover:ring-4 data-[focus-visible]:ring-4 data-[disabled]:pointer-events-none"
            >
              <input [uiProps]="thumb.inputProps" (blur)="touched.emit()" />
            </div>
          }
        </div>
      </div>
    `,
  };

  /** Two-way: `[(value)]="range"`, one number per thumb. */
  value = model<number[]>([0, 100]);
  min = input<number>(0);
  max = input<number>(100);
  step = input<number>(1);
  /** The least number of steps between two thumbs. */
  minGap = input<number>(0);
  orientation = input<"horizontal" | "vertical">("horizontal");
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  invalid = input<boolean>(false);
  /** The accessible name of each thumb, in order. */
  labels = input<string[]>([]);
  class = input<string>("");
  touched = output();

  state = inject(SliderState).bind(() => ({
    value: this.value(),
    onValueChange: (details) => this.value.set(details.value),
    min: this.min(),
    max: this.max(),
    step: this.step(),
    minStepsBetweenThumbs: this.minGap(),
    orientation: this.orientation(),
    disabled: this.disabled(),
    readOnly: this.readonly(),
    invalid: this.invalid(),
    "aria-label": this.labels(),
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  controlProps = computed(() => this.state.api().getControlProps());
  trackProps = computed(() => this.state.api().getTrackProps());
  rangeProps = computed(() => this.state.api().getRangeProps());
  thumbs = computed<RangeThumb[]>(() => {
    const api = this.state.api();
    return this.value().map((_, index) => ({ index, props: api.getThumbProps({ index }), inputProps: api.getHiddenInputProps({ index }) }));
  });
  rootClasses = computed(() => cn("relative flex w-full touch-none items-center select-none data-[orientation=vertical]:h-44 data-[orientation=vertical]:w-auto", this.class()));
}
