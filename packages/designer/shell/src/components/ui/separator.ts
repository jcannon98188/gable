import { computed, input } from "@gable/core";
import { bindProps } from "@gable/ui-primitives";
import { cn } from "../../lib/ui/cn.js";
import { useHostClass } from "../../lib/ui/host-class.js";

/** `<div uiSeparator></div>`, or `<div uiSeparator orientation="vertical" class="h-6"></div>`. `decorative` hides it from assistive technology. */
export class UiSeparator {
  static meta = { selector: "[uiSeparator]" };
  orientation = input<"horizontal" | "vertical">("horizontal");
  decorative = input<boolean>(true);
  class = input<string>("");
  private apply = useHostClass(() =>
    cn("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px", this.class()),
  );
  attrs = computed(() => ({
    "data-orientation": this.orientation(),
    ...(this.decorative() ? { role: "none" } : { role: "separator", "aria-orientation": this.orientation() }),
  }));
  private bind = bindProps(() => this.attrs());
}
