import { computed, effect, injectHost, input } from "@gable/core";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Circle, CircleAlert, Ellipsis, GripVertical, Minus, X } from "lucide";
import { cn } from "./cn.js";

/** A lucide icon: the list of child elements of its 24x24 svg. */
export type IconNode = ReadonlyArray<readonly [tag: string, attrs: Record<string, string | number | undefined>]>;

/**
 * The icons gable-ui components use, by name. Add yours here (`import { Search } from "lucide"`): only the icons listed
 * are bundled, which is why the directive takes a name instead of importing lucide's whole set.
 */
export const ICONS: Record<string, IconNode> = {
  calendar: Calendar,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "chevrons-up-down": ChevronsUpDown,
  circle: Circle,
  "circle-alert": CircleAlert,
  ellipsis: Ellipsis,
  "grip-vertical": GripVertical,
  minus: Minus,
  x: X,
};

const SVG_ATTRS: Record<string, string> = {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": "true",
};

/**
 * `<svg uiIcon="check" class="size-4"></svg>` draws a lucide icon. The svg gets lucide's attributes and its children are
 * created through the renderer, so it works with every renderer (the in-memory test renderer included).
 */
export class UiIcon {
  static meta = { selector: "svg[uiIcon]" };
  uiIcon = input<string>("");
  class = input<string>("");
  private host = injectHost();
  private classes = computed(() => cn("shrink-0", this.class()));
  private draw = (() => {
    const { renderer, host } = this.host;
    for (const [name, value] of Object.entries(SVG_ATTRS)) renderer.setAttribute(host, name, value);
    effect(() => renderer.setAttribute(host, "class", this.classes()));
    let children: unknown[] = [];
    effect(() => {
      const name = this.uiIcon();
      for (const child of children) renderer.remove(child);
      children = [];
      for (const [tag, attrs] of ICONS[name] ?? []) {
        const el = renderer.createElement(tag, host);
        for (const [key, value] of Object.entries(attrs)) if (value !== undefined) renderer.setAttribute(el, key, String(value));
        renderer.insert(host, el);
        children.push(el);
      }
    });
  })();
}
