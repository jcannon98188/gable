import { input } from "@gable/core";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

/**
 * `<label uiLabel for="email">Email</label>`: shadcn's Label as an attribute directive, so the element stays a native label
 * (clicking it focuses the control). It dims when its control, or a sibling marked `peer`, is disabled.
 */
export class UiLabel {
  static meta = { selector: "[uiLabel]" };
  class = input<string>("");
  private apply = useHostClass(() =>
    cn(
      "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
      this.class(),
    ),
  );
}
