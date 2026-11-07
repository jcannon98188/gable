import { computed, html, injectHost, input, model, output } from "@gable/core";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";
import { UiIcon } from "../lib/icon.js";

/** Which characters a `ui-input-otp` accepts: `digits` (0 to 9) or `alphanumeric`. */
export type OtpPattern = "digits" | "alphanumeric";

const ALLOWED: Record<OtpPattern, RegExp> = { digits: /[0-9]/, alphanumeric: /[A-Za-z0-9]/ };

/** Keeps the characters `pattern` allows, in order. Exported for tests and for apps that normalise a code before it reaches the model. */
export function filterOtp(text: string, pattern: OtpPattern): string {
  const re = ALLOWED[pattern];
  return [...text].filter((c) => re.test(c)).join("");
}

const SLOT =
  "relative flex size-9 items-center justify-center border-y border-r border-input bg-transparent text-center text-sm shadow-xs transition-all outline-none dark:bg-input/30 " +
  "focus:z-10 focus:border-ring focus:ring-[3px] focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

/**
 * A segmented one-time-code input: one box per character.
 *
 *   <ui-input-otp [(value)]="code" [length]="6" (complete)="verify($event)"></ui-input-otp>
 *   <ui-input-otp [field]="form.code" [length]="6" [groups]="[3, 3]" pattern="alphanumeric" label="Backup code"></ui-input-otp>
 *
 * `value` is the model (a string of up to `length` characters, so `[field]` works: `disabled`, `readonly`, `invalid` and
 * `touched` follow the forms convention; `touched` fires when focus leaves the whole control, not between boxes).
 * `pattern` limits the characters (`"digits"` by default, or `"alphanumeric"`); anything else is ignored. `groups` splits the boxes
 * with a separator, e.g. `[3, 3]` for "123-456" (the sizes must add up to `length`, otherwise there is one group).
 * Typing fills the next box and moves on; Backspace deletes (from an empty box, the previous character); the arrow keys, Home and End
 * move between boxes; pasting, or a one-time-code autofill into the first box, spreads the code over the boxes. `complete`
 * emits the full code when the user fills the last box. The first box carries `autocomplete="one-time-code"`.
 *
 * The value never has gaps: focusing a box beyond the end of the value moves focus to the first empty box. Built natively (not on
 * Zag's pin-input): the machine would only add a second state copy next to the `value` model, and the behaviour here is small.
 */
export class UiInputOtp {
  static meta = {
    selector: "ui-input-otp",
    imports: [UiIcon],
    template: html`
      <div role="group" [attr.aria-label]="label()" class="flex items-center gap-2">
        @for (slot of slots(); track slot.index) {
          @if (slot.separator) {
            <div role="separator" class="flex items-center text-muted-foreground"><svg uiIcon="minus" class="size-4"></svg></div>
          }
          <input
            data-otp-slot
            [attr.data-index]="slot.index"
            [attr.type]="inputType()"
            [attr.inputmode]="inputMode()"
            [attr.autocomplete]="slot.autocomplete"
            [attr.aria-label]="slot.label"
            [attr.aria-invalid]="invalidAttr()"
            [attr.data-state]="slot.state"
            [attr.class]="slot.classes"
            [value]="slot.char"
            [disabled]="disabled()"
            [readOnly]="readonly()"
            spellcheck="false"
            autocapitalize="off"
            (input)="onInput($event, slot.index)"
            (keydown)="onKey($event, slot.index)"
            (paste)="onPaste($event, slot.index)"
            (focus)="onFocus($event, slot.index)"
            (blur)="onBlur($event)"
          />
        }
        @if (name()) {
          <input type="hidden" [attr.name]="name()" [value]="value()" />
        }
      </div>
    `,
  };

  /** Two-way: `[(value)]="code"`. */
  value = model("");
  /** Number of boxes. */
  length = input<number>(6);
  pattern = input<OtpPattern>("digits");
  /** Box counts per group, separated by a dash: `[3, 3]`. */
  groups = input<number[]>([]);
  /** Hide the characters (a PIN rather than a code). */
  mask = input<boolean>(false);
  disabled = input<boolean>(false);
  readonly = input<boolean>(false);
  /** Reading direction for the arrow keys: in `rtl` ArrowLeft moves to the next box and ArrowRight to the previous. `auto` (default) follows the `dir` attribute in effect on the element. */
  dir = input<"ltr" | "rtl" | "auto">("auto");
  invalid = input<boolean>(false);
  /** Name of a hidden input that carries the whole code in a native form post. */
  name = input<string>("");
  /** Accessible name of the group. */
  label = input<string>("Verification code");
  class = input<string>("");
  /** Fires with the full code when the user fills the last box. */
  complete = output<string>();
  touched = output();

  private hostRef = injectHost<HTMLElement>();
  private apply = useHostClass(() => cn("inline-flex", this.disabled() && "cursor-not-allowed", this.class()));

  invalidAttr = computed(() => (this.invalid() ? "true" : null));
  inputType = computed(() => (this.mask() ? "password" : "text"));
  inputMode = computed(() => (this.pattern() === "digits" ? "numeric" : "text"));
  private total = computed(() => Math.max(1, Math.floor(this.length())));
  slots = computed(() => {
    const total = this.total();
    const value = this.value();
    const sizes = this.groups();
    const grouped = sizes.length > 0 && sizes.every((n) => n > 0) && sizes.reduce((a, b) => a + b, 0) === total;
    const bounds = grouped ? sizes : [total];
    return Array.from({ length: total }, (_, index) => {
      let start = 0;
      let size = 0;
      let first = 0;
      for (const n of bounds) {
        if (index < start + n) {
          size = n;
          first = start;
          break;
        }
        start += n;
      }
      const atStart = index === first;
      const atEnd = index === first + size - 1;
      return {
        index,
        char: value[index] ?? "",
        separator: atStart && index > 0,
        autocomplete: index === 0 ? "one-time-code" : "off",
        label: `Character ${index + 1} of ${total}`,
        state: value[index] ? "filled" : "empty",
        classes: cn(SLOT, atStart && "rounded-l-md border-l", atEnd && "rounded-r-md"),
      };
    });
  });

  private rtl(): boolean {
    const dir = this.dir();
    if (dir !== "auto") return dir === "rtl";
    const host = this.hostRef.host;
    const own = typeof host?.closest === "function" ? host.closest("[dir]")?.getAttribute("dir") : null;
    return (own ?? (globalThis as { document?: Document }).document?.documentElement?.getAttribute("dir") ?? "ltr").toLowerCase() === "rtl";
  }

  private slotEls(): HTMLInputElement[] {
    const host = this.hostRef.host;
    return typeof host?.querySelectorAll === "function" ? [...host.querySelectorAll<HTMLInputElement>("input[data-otp-slot]")] : [];
  }

  private focusSlot(index: number): void {
    const el = this.slotEls()[Math.max(0, Math.min(index, this.total() - 1))];
    el?.focus();
    el?.select?.();
  }

  private commit(next: string): void {
    const prev = this.value();
    if (next === prev) return;
    this.value.set(next);
    if (next.length === this.total() && prev.length < this.total()) this.complete.emit(next);
  }

  /** Writes `chars` from box `at` (clamped so the value has no gaps; a whole code replaces the value) and moves focus after them. */
  private write(chars: string, at: number): void {
    const total = this.total();
    const value = this.value();
    const code = chars.slice(0, total);
    const start = code.length >= total ? 0 : Math.min(at, value.length);
    const next = (value.slice(0, start) + code + value.slice(start + code.length)).slice(0, total);
    this.commit(next);
    this.focusSlot(Math.min(start + code.length, total - 1));
  }

  onInput(event: unknown, index: number): void {
    const el = (event as { target: HTMLInputElement }).target;
    const old = this.value()[index] ?? "";
    let raw = el.value;
    // Typing over a filled box leaves the old and the new character in it.
    if (old && raw.length === 2) raw = raw.startsWith(old) ? raw.slice(1) : raw.endsWith(old) ? raw.slice(0, 1) : raw;
    const chars = filterOtp(raw, this.pattern());
    // The DOM value is the browser's; the signal is canonical, so put the box back to it (the render then keeps it there).
    el.value = old;
    if (!chars || this.readonly()) return;
    this.write(chars, index);
  }

  onKey(event: unknown, index: number): void {
    const e = event as { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; preventDefault(): void };
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const value = this.value();
    switch (e.key) {
      case "Backspace":
        e.preventDefault();
        if (this.readonly()) return;
        if (value[index]) this.commit(value.slice(0, index) + value.slice(index + 1));
        else if (index > 0) {
          this.commit(value.slice(0, index - 1) + value.slice(index));
          this.focusSlot(index - 1);
        }
        return;
      case "Delete":
        e.preventDefault();
        if (!this.readonly() && value[index]) this.commit(value.slice(0, index) + value.slice(index + 1));
        return;
      case "ArrowLeft":
      case "ArrowRight": {
        e.preventDefault();
        const forward = (e.key === "ArrowRight") !== this.rtl();
        this.focusSlot(forward ? Math.min(index + 1, value.length) : index - 1);
        return;
      }
      case "Home":
        e.preventDefault();
        this.focusSlot(0);
        return;
      case "End":
        e.preventDefault();
        this.focusSlot(Math.min(value.length, this.total() - 1));
        return;
    }
  }

  onPaste(event: unknown, index: number): void {
    const e = event as { clipboardData?: { getData(type: string): string } | null; preventDefault(): void };
    e.preventDefault();
    if (this.readonly()) return;
    const chars = filterOtp(e.clipboardData?.getData("text") ?? "", this.pattern());
    if (chars) this.write(chars, index);
  }

  onFocus(event: unknown, index: number): void {
    const filled = this.value().length;
    if (index > filled) {
      this.focusSlot(filled);
      return;
    }
    (event as { target: HTMLInputElement }).target.select?.();
  }

  onBlur(event: unknown): void {
    const next = (event as { relatedTarget?: unknown }).relatedTarget;
    const host = this.hostRef.host;
    if (next && typeof host?.contains === "function" && host.contains(next as Node)) return;
    this.touched.emit();
  }
}
