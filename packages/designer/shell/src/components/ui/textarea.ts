import { input } from "@gable/core";
import { cn } from "../../lib/ui/cn.js";
import { useHostClass } from "../../lib/ui/host-class.js";

/** `<textarea uiTextarea [field]="form.bio"></textarea>`: shadcn's Textarea as an attribute directive on the native element. */
export class UiTextarea {
  static meta = { selector: "textarea[uiTextarea]" };
  class = input<string>("");
  private apply = useHostClass(() =>
    cn(
      "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm dark:bg-input/30",
      "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
      "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
      this.class(),
    ),
  );
}
