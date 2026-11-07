import { input } from "@gable/core";
import { useHostClass } from "../lib/host-class.js";
import { variants } from "../lib/variants.js";

/** `compact` is the dense variant (26px controls, 12px text); see the compact sizes of `uiButton` and `uiToggle`. */
export type InputDensity = "default" | "compact";

/** The classes of a text input; exported so a component that draws its own `<input>` (like `ui-input-clear`) looks the same. */
export const inputVariants = variants({
  base: [
    "flex w-full min-w-0 rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none dark:bg-input/30",
    "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  ],
  variants: {
    density: {
      default: "h-9 px-3 py-1 text-base md:text-sm",
      compact: "h-6.5 px-2 py-0 text-xs md:text-xs",
    },
  },
  defaultVariants: { density: "default" },
});

/**
 * `<input uiInput type="email" [field]="form.email" />`: shadcn's Input as an attribute directive on the native input, so
 * `[field]`, `[value]`, `(input)` and every native attribute work unchanged. `aria-invalid` (set by `[field]` when the field
 * has errors) draws the destructive ring. `density="compact"` makes it a 26px control with 12px text.
 */
export class UiInput {
  static meta = { selector: "input[uiInput]" };
  class = input<string>("");
  density = input<InputDensity>("default");
  private apply = useHostClass(() => inputVariants({ density: this.density(), class: this.class() }));
}
