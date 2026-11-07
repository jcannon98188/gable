import { input } from "@gable/core";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

/**
 * `<input uiInput type="email" [field]="form.email" />`: shadcn's Input as an attribute directive on the native input, so
 * `[field]`, `[value]`, `(input)` and every native attribute work unchanged. `aria-invalid` (set by `[field]` when the field
 * has errors) draws the destructive ring.
 */
export class UiInput {
  static meta = { selector: "input[uiInput]" };
  class = input<string>("");
  private apply = useHostClass(() =>
    cn(
      "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm dark:bg-input/30",
      "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
      "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
      this.class(),
    ),
  );
}
