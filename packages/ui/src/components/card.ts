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
/** `[uiCardHeader]`: the top section of a card; holds the title and description. */
export class UiCardHeader {
  static meta = { selector: "[uiCardHeader]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6", this.class()));
}
/** `[uiCardTitle]`: the card's title. Use a heading element so the page outline stays correct. */
export class UiCardTitle {
  static meta = { selector: "[uiCardTitle]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("leading-none font-semibold", this.class()));
}
/** `[uiCardDescription]`: muted supporting text below the card title. */
export class UiCardDescription {
  static meta = { selector: "[uiCardDescription]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("text-sm text-muted-foreground", this.class()));
}
/** `[uiCardContent]`: the card's main body, padded to line up with the header and footer. */
export class UiCardContent {
  static meta = { selector: "[uiCardContent]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("px-6", this.class()));
}
/** `[uiCardFooter]`: the card's bottom row, usually holding actions. */
export class UiCardFooter {
  static meta = { selector: "[uiCardFooter]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("flex items-center px-6", this.class()));
}
