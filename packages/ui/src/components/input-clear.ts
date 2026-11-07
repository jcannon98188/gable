import { computed, html, injectHost, input, model, output } from "@gable/core";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";
import { UiIcon } from "../lib/icon.js";
import { inputVariants, type InputDensity } from "./input.js";

/**
 * A text input with a clear button.
 *
 *   <ui-input-clear [(value)]="query" label="Search classes" placeholder="Search..." density="compact"></ui-input-clear>
 *   <ui-input-clear [field]="form.query" label="Search"></ui-input-clear>
 *
 * It draws its own `<input>` (styled like `uiInput`) so the button can sit inside it; `value` is the model, so `[field]` works
 * with the forms convention (`disabled`, `readonly` and `invalid` follow the field, `touched` fires when focus leaves the whole
 * control or the field is cleared). The button shows only while there is a value and the control is neither disabled nor
 * read-only; it is a real, tabbable button named by `clearLabel`. Clicking it (or pressing Escape in the input) empties the value,
 * keeps focus in the input and emits `cleared`.
 */
export class UiInputClear {
  static meta = {
    selector: "ui-input-clear",
    imports: [UiIcon],
    template: html`
      <input
        data-input-clear
        [attr.type]="type()"
        [attr.placeholder]="placeholder() || null"
        [attr.name]="name() || null"
        [attr.autocomplete]="autocomplete()"
        [attr.aria-label]="label() || null"
        [attr.aria-invalid]="invalidAttr()"
        [attr.class]="inputClasses()"
        [value]="value()"
        [disabled]="disabled()"
        [readOnly]="readonly()"
        (input)="onInput($event)"
        (keydown)="onKey($event)"
        (blur)="onBlur($event)"
      />
      @if (showClear()) {
        <button
          type="button"
          data-input-clear-button
          [attr.aria-label]="clearLabel()"
          [attr.class]="buttonClasses()"
          (click)="clear()"
          (blur)="onBlur($event)"
        >
          <svg uiIcon="x" class="size-3.5"></svg>
        </button>
      }
    `,
  };

  /** Two-way: `[(value)]="query"`. */
  value = model("");
  type = input<string>("text");
  placeholder = input<string>("");
  name = input<string>("");
  autocomplete = input<string>("off");
  /** Accessible name of the input (`aria-label`). */
  label = input<string>("");
  /** Accessible name of the clear button. */
  clearLabel = input<string>("Clear");
  density = input<InputDensity>("default");
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  invalid = input<boolean>(false);
  /** Extra classes for the host (a wrapper `relative` element); use it for width, e.g. `"w-64"`. The input fills it. */
  class = input<string>("");
  /** Extra classes for the input itself. */
  inputClass = input<string>("");
  touched = output();
  /** The user cleared the field with the button or Escape. */
  cleared = output();

  private hostRef = injectHost<HTMLElement>();
  private apply = useHostClass(() => cn("relative block", this.class()));

  invalidAttr = computed(() => (this.invalid() ? "true" : null));
  showClear = computed(() => this.value() !== "" && !this.disabled() && !this.readonly());
  inputClasses = computed(() => inputVariants({ density: this.density(), class: cn("pr-7", this.inputClass()) }));
  buttonClasses = computed(() =>
    cn(
      "absolute top-1/2 right-1 flex -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
      this.density() === "compact" ? "size-5" : "size-6",
    ),
  );

  private inputEl(): HTMLInputElement | null {
    const host = this.hostRef.host;
    return typeof host?.querySelector === "function" ? host.querySelector<HTMLInputElement>("input[data-input-clear]") : null;
  }

  onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.showClear()) {
      event.preventDefault();
      this.clear();
    }
  }

  onBlur(event: unknown): void {
    const next = (event as { relatedTarget?: unknown }).relatedTarget;
    const host = this.hostRef.host;
    if (next && typeof host?.contains === "function" && host.contains(next as Node)) return;
    this.touched.emit();
  }

  clear(): void {
    this.value.set("");
    this.touched.emit();
    this.cleared.emit();
    this.inputEl()?.focus();
  }
}
