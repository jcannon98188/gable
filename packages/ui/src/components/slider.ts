import { computed, html, inject, input, model, output } from "@gable/core";
import { SliderState, UiProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";

/**
 * A single-thumb slider.
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
