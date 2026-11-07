import { computed, input } from "@gable/core";
import { bindProps } from "@gable/ui-primitives";
import { useHostClass } from "../lib/host-class.js";
import { cn } from "../lib/cn.js";
import { variants } from "../lib/variants.js";

/** Visual style of `uiAlert`: `default` (neutral card) or `destructive` (error colour for the icon, title and description). */
export type AlertVariant = "default" | "destructive";

/** The class generator behind `uiAlert`. Call it with `{ variant, class }` to get the class string, for example to give another element the same look. Conflicting utilities in `class` win over the defaults. */
export const alertVariants = variants({
  base: "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  variants: {
    variant: {
      default: "bg-card text-card-foreground",
      destructive: "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current",
    },
  },
  defaultVariants: { variant: "default" },
});

/**
 * `<div uiAlert variant="destructive"><svg uiIcon="circle-alert"></svg><div uiAlertTitle>Error</div><div uiAlertDescription>...</div></div>`
 * An optional icon placed first lines up in its own column.
 */
export class UiAlert {
  static meta = { selector: "[uiAlert]" };
  variant = input<AlertVariant>("default");
  class = input<string>("");
  classes = computed(() => alertVariants({ variant: this.variant(), class: this.class() }));
  private apply = useHostClass(() => this.classes());
  private attrs = bindProps(() => ({ role: "alert" }));
}
/** `[uiAlertTitle]`: the alert's heading, placed in the text column beside an optional icon. Plain text by default; set `level` to expose it as a heading (`role="heading"` with `aria-level`). */
export class UiAlertTitle {
  static meta = { selector: "[uiAlertTitle]" };
  class = input<string>("");
  /** Optional heading level: sets `role="heading"` and `aria-level`. By default the title is plain text, so it never breaks the page's heading order. */
  level = input<number | null>(null);
  private attrs = bindProps(() => (this.level() ? { role: "heading", "aria-level": this.level() } : null));
  private apply = useHostClass(() => cn("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", this.class()));
}
/** `[uiAlertDescription]`: the alert's body text, in muted colour below the title (the destructive variant tints it). */
export class UiAlertDescription {
  static meta = { selector: "[uiAlertDescription]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed", this.class()));
  private attrs = bindProps(() => ({ "data-slot": "alert-description" }));
}
