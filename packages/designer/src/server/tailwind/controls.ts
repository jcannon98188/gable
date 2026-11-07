// The style panel's controls. This is UI scaffolding, not a class table: a control names a CSS property and where to look for
// utilities (a prefix such as `px-`, or exact names such as `flex`). Which utilities exist, what they set, what they are worth
// and which win over which all come from the project's design system (`model.ts`); a utility is offered only when the design
// system says it claims the control's property.
import type { ControlDef } from "./types.js";

export interface ControlSpec extends ControlDef {
  /** Utilities whose name starts with `<root>-` (and the bare `<root>`, the theme's default value). */
  roots?: string[];
  /** Exact utility names (static utilities such as `flex` or `hidden`). */
  names?: string[];
}

const spacing = (prefix: string, section: ControlDef["section"], label: string, property: string): ControlSpec => ({ id: property, label, section, kind: "scale", property, roots: [prefix] });

export const CONTROLS: readonly ControlSpec[] = [
  // layout
  { id: "display", label: "Display", section: "layout", kind: "choice", property: "display", names: ["block", "inline-block", "inline", "flex", "inline-flex", "grid", "inline-grid", "hidden", "contents"] },
  { id: "flex-direction", label: "Direction", section: "layout", kind: "choice", property: "flex-direction", roots: ["flex"] },
  { id: "flex-wrap", label: "Wrap", section: "layout", kind: "choice", property: "flex-wrap", roots: ["flex"] },
  { id: "justify-content", label: "Justify", section: "layout", kind: "choice", property: "justify-content", roots: ["justify"] },
  { id: "align-items", label: "Align items", section: "layout", kind: "choice", property: "align-items", roots: ["items"] },
  { id: "grid-template-columns", label: "Grid columns", section: "layout", kind: "scale", property: "grid-template-columns", roots: ["grid-cols"] },
  { id: "gap", label: "Gap", section: "layout", kind: "scale", property: "gap", roots: ["gap"] },
  { id: "column-gap", label: "Gap X", section: "layout", kind: "scale", property: "column-gap", roots: ["gap-x"] },
  { id: "row-gap", label: "Gap Y", section: "layout", kind: "scale", property: "row-gap", roots: ["gap-y"] },
  { id: "position", label: "Position", section: "layout", kind: "choice", property: "position", names: ["static", "relative", "absolute", "fixed", "sticky"] },
  { id: "overflow", label: "Overflow", section: "layout", kind: "choice", property: "overflow", roots: ["overflow"] },
  // size
  { id: "width", label: "Width", section: "size", kind: "scale", property: "width", roots: ["w"] },
  { id: "height", label: "Height", section: "size", kind: "scale", property: "height", roots: ["h"] },
  { id: "min-width", label: "Min width", section: "size", kind: "scale", property: "min-width", roots: ["min-w"] },
  { id: "max-width", label: "Max width", section: "size", kind: "scale", property: "max-width", roots: ["max-w"] },
  { id: "min-height", label: "Min height", section: "size", kind: "scale", property: "min-height", roots: ["min-h"] },
  { id: "max-height", label: "Max height", section: "size", kind: "scale", property: "max-height", roots: ["max-h"] },
  // spacing
  spacing("p", "spacing", "Padding", "padding"),
  spacing("px", "spacing", "Padding X", "padding-inline"),
  spacing("py", "spacing", "Padding Y", "padding-block"),
  spacing("pt", "spacing", "Padding top", "padding-top"),
  spacing("pr", "spacing", "Padding right", "padding-right"),
  spacing("pb", "spacing", "Padding bottom", "padding-bottom"),
  spacing("pl", "spacing", "Padding left", "padding-left"),
  spacing("m", "spacing", "Margin", "margin"),
  spacing("mx", "spacing", "Margin X", "margin-inline"),
  spacing("my", "spacing", "Margin Y", "margin-block"),
  spacing("mt", "spacing", "Margin top", "margin-top"),
  spacing("mr", "spacing", "Margin right", "margin-right"),
  spacing("mb", "spacing", "Margin bottom", "margin-bottom"),
  spacing("ml", "spacing", "Margin left", "margin-left"),
  // type
  { id: "font-size", label: "Size", section: "type", kind: "scale", property: "font-size", roots: ["text"] },
  { id: "font-weight", label: "Weight", section: "type", kind: "scale", property: "font-weight", roots: ["font"] },
  { id: "font-family", label: "Family", section: "type", kind: "scale", property: "font-family", roots: ["font"] },
  { id: "line-height", label: "Line height", section: "type", kind: "scale", property: "line-height", roots: ["leading"] },
  { id: "letter-spacing", label: "Letter spacing", section: "type", kind: "scale", property: "letter-spacing", roots: ["tracking"] },
  { id: "text-align", label: "Align", section: "type", kind: "choice", property: "text-align", roots: ["text"] },
  // color
  { id: "color", label: "Text color", section: "color", kind: "color", property: "color", roots: ["text"] },
  { id: "background-color", label: "Background", section: "color", kind: "color", property: "background-color", roots: ["bg"] },
  { id: "border-color", label: "Border color", section: "color", kind: "color", property: "border-color", roots: ["border"] },
  // border
  { id: "border-radius", label: "Radius", section: "border", kind: "scale", property: "border-radius", roots: ["rounded"] },
  { id: "border-width", label: "Border width", section: "border", kind: "scale", property: "border-width", roots: ["border"] },
  // effects
  { id: "shadow", label: "Shadow", section: "effects", kind: "scale", property: "--tw-shadow", roots: ["shadow"] },
  { id: "opacity", label: "Opacity", section: "effects", kind: "scale", property: "opacity", roots: ["opacity"] },
];

/** Controls as the shell sees them (the lookup hints stay on the server). */
export const publicControls = (): ControlDef[] => CONTROLS.map(({ id, label, section, kind, property }) => ({ id, label, section, kind, property }));
