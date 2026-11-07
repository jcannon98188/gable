import { html, input } from "@gable/core";
import { bindProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";
import { UiIcon } from "../lib/icon.js";

/**
 * Breadcrumb parts:
 *
 *   <nav uiBreadcrumb>
 *     <ol uiBreadcrumbList>
 *       <li uiBreadcrumbItem><a uiBreadcrumbLink href="/">Home</a></li>
 *       <ui-breadcrumb-separator></ui-breadcrumb-separator>
 *       <li uiBreadcrumbItem><ui-breadcrumb-ellipsis></ui-breadcrumb-ellipsis></li>
 *       <ui-breadcrumb-separator></ui-breadcrumb-separator>
 *       <li uiBreadcrumbItem><span uiBreadcrumbPage>Current</span></li>
 *     </ol>
 *   </nav>
 */
export class UiBreadcrumb {
  static meta = { selector: "nav[uiBreadcrumb]" };
  private attrs = bindProps(() => ({ "aria-label": "breadcrumb" }));
}
/** `ol[uiBreadcrumbList]`: the ordered list that holds the items and separators. Wraps onto several lines on narrow screens. */
export class UiBreadcrumbList {
  static meta = { selector: "ol[uiBreadcrumbList]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("flex flex-wrap items-center gap-1.5 text-sm break-words text-muted-foreground sm:gap-2.5", this.class()));
}
/** `li[uiBreadcrumbItem]`: one entry of the trail: a link, the current page or an ellipsis. */
export class UiBreadcrumbItem {
  static meta = { selector: "li[uiBreadcrumbItem]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("inline-flex items-center gap-1.5", this.class()));
}
/** `a[uiBreadcrumbLink]`: a link to an ancestor page. Put the `href` on it as usual. */
export class UiBreadcrumbLink {
  static meta = { selector: "a[uiBreadcrumbLink]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("transition-colors hover:text-foreground", this.class()));
}
/** `[uiBreadcrumbPage]`: the current page, last in the trail. Not a real link: it gets `aria-current="page"` and `aria-disabled`. */
export class UiBreadcrumbPage {
  static meta = { selector: "[uiBreadcrumbPage]" };
  class = input<string>("");
  private apply = useHostClass(() => cn("font-normal text-foreground", this.class()));
  private attrs = bindProps(() => ({ role: "link", "aria-disabled": "true", "aria-current": "page" }));
}
/** The chevron between two items. A custom element so it can draw its own icon; place it inside the list. */
export class UiBreadcrumbSeparator {
  static meta = {
    selector: "ui-breadcrumb-separator",
    imports: [UiIcon],
    host: { class: "inline-flex [&>svg]:size-3.5" },
    template: html`<svg uiIcon="chevron-right"></svg>`,
  };
  private attrs = bindProps(() => ({ role: "presentation", "aria-hidden": "true" }));
}
/** The "more" dots for a collapsed run of items. */
export class UiBreadcrumbEllipsis {
  static meta = {
    selector: "ui-breadcrumb-ellipsis",
    imports: [UiIcon],
    host: { class: "flex size-9 items-center justify-center" },
    template: html`<svg uiIcon="ellipsis" class="size-4"></svg><span class="sr-only">More</span>`,
  };
  private attrs = bindProps(() => ({ role: "presentation", "aria-hidden": "true" }));
}
