import { computed, input, model } from "@gable/core";
import { ToggleState, bindProps } from "@gable/ui-primitives";
import { useHostClass } from "../lib/host-class.js";
import { variants } from "../lib/variants.js";

/** Visual style of `uiToggle`: `default` (transparent) or `outline` (bordered). */
export type ToggleVariant = "default" | "outline";
/** Size of `uiToggle`: `default`, `sm`, `lg`, or the dense `compact` size (26px tall). */
export type ToggleSize = "default" | "sm" | "lg" | "compact";

/** The class generator behind `uiToggle`. Call it with `{ variant, size, class }` to get the class string. */
export const toggleVariants = variants({
  base: [
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
    "data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  variants: {
    variant: {
      default: "bg-transparent",
      outline: "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
    },
    size: { default: "h-9 min-w-9 px-2", sm: "h-8 min-w-8 px-1.5", lg: "h-10 min-w-10 px-2.5",
      /** Dense: 26px tall, 12px text. */
      compact: "h-6.5 min-w-6.5 gap-1 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

/**
 * `<button uiToggle [(pressed)]="bold" aria-label="Bold">B</button>`: a two-state button (`aria-pressed`, `data-state="on|off"`).
 * An attribute directive that owns its own Zag machine; the element stays a native button.
 */
export class UiToggle {
  static meta = { selector: "[uiToggle]" };
  /** Two-way: `[(pressed)]="bold"`. */
  pressed = model(false);
  variant = input<ToggleVariant>("default");
  size = input<ToggleSize>("default");
  disabled = input<boolean>(false);
  class = input<string>("");
  classes = computed(() => toggleVariants({ variant: this.variant(), size: this.size(), class: this.class() }));

  state = new ToggleState().bind(() => ({
    pressed: this.pressed(),
    onPressedChange: (pressed) => this.pressed.set(pressed),
    disabled: this.disabled(),
  }));
  private apply = useHostClass(() => this.classes());
  private props = bindProps(() => this.state.api().getRootProps());
}
