import { input } from "@gable/core";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

/** `<div uiSkeleton class="h-4 w-48"></div>`: a pulsing placeholder; size it with classes. */
export class UiSkeleton {
  static meta = { selector: "[uiSkeleton]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("animate-pulse rounded-md bg-accent", this.class()));
}
