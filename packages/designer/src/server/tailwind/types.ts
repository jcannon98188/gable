// The Tailwind mode API: what the shell sends and gets back. Types only (the shell imports them without server code).

export interface Breakpoint {
  name: string;
  /** Minimum width in CSS pixels (rem values are converted at 16px). */
  min: number;
  /** As the theme writes it (`48rem`). */
  raw: string;
}

/** One panel control: a CSS property edited by picking one utility of the project's own scale. */
export interface ControlDef {
  id: string;
  label: string;
  section: "layout" | "size" | "spacing" | "type" | "color" | "border" | "effects";
  /** `scale`: a number-like scale (spacing, sizes); `choice`: a handful of named utilities; `color`: the theme's colors. */
  kind: "scale" | "choice" | "color";
  /** The CSS property (or `--tw-` helper property) the utilities claim; the design system says which utility claims it. */
  property: string;
}

export interface ControlOption {
  /** The utility without variants (`p-4`). */
  utility: string;
  /** What to show: the value part for scales (`4`), the whole name for choices. */
  label: string;
  /** The CSS value it produces, theme variables resolved (`1rem`). */
  detail: string;
  /** A color to paint (colors only). */
  swatch?: string;
}

export type TailwindInfo =
  | { enabled: false; message: string }
  | {
      enabled: true;
      /** The Tailwind version of the loaded design system, and whose copy it is (`project` is the one the app is built with). */
      version: string;
      source: "project" | "designer";
      /** Project-relative path of the stylesheet the design system was built from. */
      entry: string;
      /** Ascending by minimum width. */
      breakpoints: Breakpoint[];
      /** The state variants the toolbar can edit, as the design system names them (`hover`, `group-hover`, `dark`...). */
      states: string[];
      /** The repo's formatter sorts classes (prettier-plugin-tailwindcss), so inserts are put in its order; otherwise they are appended. */
      sortsClasses: boolean;
      controls: ControlDef[];
    };

export interface TokenInfo {
  token: string;
  /** Variants as written, outermost first. */
  variants: string[];
  /** The breakpoint variant (`md`), or null (`base`). */
  breakpoint: string | null;
  /** The other variants (`hover`, `dark`, `group-hover`, `max-md`...). */
  states: string[];
  /** The utility without variants (`p-4`, `!font-bold`). */
  utility: string;
  /** False for classes the design system does not know (the project's own CSS classes): never touched, never reordered. */
  known: boolean;
  /** The properties the utility sets that other utilities do not merely read (what conflicts are judged by). */
  claims: string[];
}

export interface ResolvedValue {
  utility: string;
  token: string;
  label: string;
  detail: string;
  swatch?: string;
  /** The breakpoint it is set at (`base` or a name). */
  at: string;
  /** Set at a smaller breakpoint than the selected one (mobile-first inheritance). */
  inherited: boolean;
  /** Set without the states being edited (`hover` is on, the value comes from the plain state). */
  fromBaseState: boolean;
}

export interface Conditional {
  /** What makes it conditional, for the label: `text-red-500` (`[class.text-red-500]`) or the expression. */
  name: string;
  attr: string;
}

export interface AnalyzeResult {
  tokens: TokenInfo[];
  /** Per control id, its value at the editing context, or null when nothing sets it. */
  values: Record<string, ResolvedValue | null>;
}

export type PlanResult = { ok: true; classes: string; token: string; added: boolean; removed: string[] } | { ok: false; error: string };

export interface SearchHit {
  /** What would be written (with the context's variants when asked). */
  token: string;
  utility: string;
  /** The CSS it produces, short. */
  css: string;
}
