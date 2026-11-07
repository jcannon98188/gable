import { computed, input } from "@gable/core";
import { useHostClass } from "../../lib/ui/host-class.js";
import { variants } from "../../lib/ui/variants.js";

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
export type ButtonSize = "default" | "sm" | "lg" | "icon" | "compact" | "icon-compact";

export const buttonVariants = variants({
  base: [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
      destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20",
      outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
      secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      link: "text-primary underline-offset-4 hover:underline",
    },
    size: {
      default: "h-9 px-4 py-2 has-[>svg]:px-3",
      sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
      lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
      icon: "size-9",
      /** Dense: 26px tall, 12px text (the compact density; see `uiInput` density). */
      compact: "h-6.5 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
      "icon-compact": "size-6.5 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

/**
 * `<button uiButton variant="outline" size="sm" class="mt-4">Save</button>`
 *
 * An attribute directive, so the element stays a native button (or an anchor: `<a uiButton>`). The variant classes are
 * computed here because templates cannot call functions; the element's own `class` is merged last, so it wins conflicts.
 */
export class UiButton {
  static meta = { selector: "[uiButton]" };
  variant = input<ButtonVariant>("default");
  size = input<ButtonSize>("default");
  class = input<string>("");
  classes = computed(() => buttonVariants({ variant: this.variant(), size: this.size(), class: this.class() }));
  private apply = useHostClass(() => this.classes());
}
