import { input } from "@gable/core";
import { cn } from "../lib/cn.js";
import { useHostClass } from "../lib/host-class.js";

/** The classes of a section header: 10.5px uppercase text with wide tracking. Exported for markup that cannot take the directive. */
export const SECTION_HEADER = "text-[10.5px] leading-none font-semibold tracking-wider text-muted-foreground uppercase select-none";

/**
 * `<h3 uiSectionHeader>Layout</h3>`: the small uppercase header that titles a group of dense controls (the compact density's
 * companion). An attribute directive, so the element stays whatever you need (`h2`, `div`, `legend`); the element's own `class` merges last.
 */
export class UiSectionHeader {
  static meta = { selector: "[uiSectionHeader]" };
  class = input<string>("");
  private apply = useHostClass(() => cn(SECTION_HEADER, this.class()));
}
