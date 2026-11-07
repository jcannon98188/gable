import { computed, html, input } from "@gable/core";
import { bindProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

// Joined borders and radii by child selectors, as in shadcn's ButtonGroup. A `ui-dropdown-menu` child (the split-button
// chevron) wraps its trigger in an inline-block host, so the selectors also reach the button inside it.
const HORIZONTAL = [
  "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
  "[&>ui-dropdown-menu:not(:first-child)>*]:rounded-l-none [&>ui-dropdown-menu:not(:first-child)>*]:border-l-0 [&>ui-dropdown-menu:not(:last-child)>*]:rounded-r-none",
].join(" ");
const VERTICAL = [
  "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none",
  "[&>ui-dropdown-menu:not(:first-child)>*]:rounded-t-none [&>ui-dropdown-menu:not(:first-child)>*]:border-t-0 [&>ui-dropdown-menu:not(:last-child)>*]:rounded-b-none",
].join(" ");

/**
 * A row (or column) of joined buttons, one `role="group"` with one accessible name.
 *
 *   <ui-button-group label="Text alignment">
 *     <button uiButton variant="outline">Left</button>
 *     <button uiButton variant="outline">Right</button>
 *   </ui-button-group>
 *
 * `label` becomes `aria-label` (give the group a name whenever it has more than one control); `orientation` is
 * `horizontal` (default) or `vertical`. Children keep their own variant: only the inner borders and radii are removed, and a
 * focused child is raised so its ring is not clipped by its neighbour. A `uiButtonGroupText` element is a non-interactive
 * addon (a unit, a prefix). The split button is this group holding a button and a chevron dropdown trigger: see
 * docs/ui-primitives.md.
 */
export class UiButtonGroup {
  static meta = {
    selector: "ui-button-group",
    template: html`<slot></slot>`,
  };
  label = input<string>("");
  orientation = input<"horizontal" | "vertical">("horizontal");
  class = input<string>("");
  private apply = useHostClass(() =>
    cn(
      "flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10",
      this.orientation() === "vertical" ? VERTICAL : HORIZONTAL,
      this.class(),
    ),
  );
  attrs = computed(() => ({
    role: "group",
    "data-orientation": this.orientation(),
    "aria-label": this.label() || undefined,
  }));
  private bind = bindProps(() => this.attrs());
}

/** A non-interactive addon inside a button group: `<span uiButtonGroupText>https://</span>`. */
export class UiButtonGroupText {
  static meta = { selector: "[uiButtonGroupText]" };
  class = input<string>("");
  private apply = useHostClass(() =>
    cn("flex items-center gap-2 rounded-md border bg-muted px-4 text-sm font-medium shadow-xs [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4", this.class()),
  );
}
