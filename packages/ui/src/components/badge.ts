import { computed, input } from "@gable/core";
import { useHostClass } from "../lib/host-class.js";
import { variants } from "../lib/variants.js";

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const badgeVariants = variants({
  base: "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3",
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      destructive: "border-transparent bg-destructive text-white dark:bg-destructive/60",
      outline: "text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

/** `<span uiBadge variant="secondary">New</span>`: also works on an anchor (`<a uiBadge href="...">`). */
export class UiBadge {
  static meta = { selector: "[uiBadge]" };
  variant = input<BadgeVariant>("default");
  class = input<string>("");
  classes = computed(() => badgeVariants({ variant: this.variant(), class: this.class() }));
  private apply = useHostClass(() => this.classes());
}
