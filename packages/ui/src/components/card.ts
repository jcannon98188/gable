import { input } from "@gable/core";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

/**
 * Card and its parts, attribute directives on plain elements:
 *
 *   <div uiCard>
 *     <div uiCardHeader><h3 uiCardTitle>Title</h3><p uiCardDescription>Description</p></div>
 *     <div uiCardContent>...</div>
 *     <div uiCardFooter>...</div>
 *   </div>
 */
export class UiCard {
  static meta = { selector: "[uiCard]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm", this.class()));
}
export class UiCardHeader {
  static meta = { selector: "[uiCardHeader]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6", this.class()));
}
export class UiCardTitle {
  static meta = { selector: "[uiCardTitle]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("leading-none font-semibold", this.class()));
}
export class UiCardDescription {
  static meta = { selector: "[uiCardDescription]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("text-sm text-muted-foreground", this.class()));
}
export class UiCardContent {
  static meta = { selector: "[uiCardContent]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("px-6", this.class()));
}
export class UiCardFooter {
  static meta = { selector: "[uiCardFooter]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("flex items-center px-6", this.class()));
}
