// Design tokens (CSS custom properties) as the backend reports them. Types only: the shell imports them without server code.

/** Which colour scheme a definition applies in, as its context says (`.dark`, `@media (prefers-color-scheme: dark)`); null: both. */
export type TokenScheme = "light" | "dark" | null;

/**
 * Where a definition applies. `root`: the document (`:root`, `html`, `:host`, also with a scheme such as `.dark`).
 * `theme`: a Tailwind `@theme` block. `variant`: a theme switch other than light and dark (`[data-theme="ocean"]`).
 * `scoped`: a component or element selector (`.card`).
 */
export type TokenScope = "root" | "theme" | "variant" | "scoped";

export type TokenKind = "color" | "length" | "number" | "other";

/** Where an edit of a token is written: one custom property in one exact context of one project stylesheet. */
export interface TokenTarget {
  /** Project-relative stylesheet the edit writes. */
  file: string;
  /** The rule's selector, or null for a declaration directly inside an at-rule (`@theme`). */
  selector: string | null;
  /** Enclosing at-rules, outermost first (`@media (prefers-color-scheme: dark)`). */
  atRules: string[];
  /** The value there now (null: the context has none yet). The edit is refused when the file no longer says this. */
  expect: string | null;
  /** The definition lives in a package stylesheet: the edit writes an override in the project stylesheet that imports it. */
  override: boolean;
}

export interface TokenDef {
  name: string;
  /** As written. */
  value: string;
  /** Project-relative path; a package stylesheet is shown by its import (`@gable/ui/theme.css`). */
  file: string;
  line: number;
  column: number;
  selector: string | null;
  atRules: string[];
  /** The context as one string: `@media (prefers-color-scheme: dark) :root`, `@theme inline`, `.dark`. */
  context: string;
  scheme: TokenScheme;
  scope: TokenScope;
  /** Written in the project's own stylesheet (package stylesheets are read-only; edits override them). */
  editable: boolean;
  /** A later definition in the same context wins over this one (`file:line`). */
  overriddenBy?: string;
  /** Where an edit of this definition is written; null when it is edited in code only (a nested rule). */
  target: TokenTarget | null;
}

export interface TokenValue {
  /** As written in the winning definition. */
  value: string;
  /** With `var()` references followed through the other tokens (what a swatch shows). */
  resolved: string;
  /** The winning definition (`file:line`). */
  at: string;
}

export interface TokenInfo {
  name: string;
  kind: TokenKind;
  /** The value outside dark mode (document-wide or `@theme`, explicit light included), or null when only scoped. */
  light: TokenValue | null;
  /** The dark value when the project defines one; null: dark mode uses the light value. */
  dark: TokenValue | null;
  /** Every definition, in cascade order. */
  defs: TokenDef[];
  /** Tokens its value reads (`--color-primary: var(--primary)` reads `--primary`). */
  refs: string[];
  /** Tokens whose value reads this one. */
  aliases: string[];
  /** Places that use it: CSS declarations and template elements, through its aliases too. */
  uses: number;
  /** Where Light and Dark edits are written; null with the reason in `why`. */
  edit: { light: TokenTarget | null; dark: TokenTarget | null; why?: string };
}

export interface TokenSheet {
  file: string;
  editable: boolean;
  /** For a package stylesheet: the project stylesheet that imports it (overrides go there). */
  importer?: string;
  tokens: number;
}

export interface TokenList {
  ok: true;
  tokens: TokenInfo[];
  sheets: TokenSheet[];
  /** The contexts this project's dark values come from (`.dark`, `@media (prefers-color-scheme: dark) :root`). */
  darkVia: string[];
  /** Whether template classes were matched through the project's Tailwind design system. */
  tailwind: boolean;
}

export interface TokenUsage {
  kind: "css" | "class" | "style";
  file: string;
  line: number;
  column: number;
  /** The source line, trimmed. */
  text: string;
  /** Set when the use reads an alias of the token (`bg-primary` reads `--color-primary`, which reads `--primary`). */
  via?: string;
  /** CSS: the declaration's property and rule context. */
  property?: string;
  context?: string;
  /** CSS: a selector for the first element on the canvas the rule applies to (pseudo-classes stripped); null when none can be told. */
  selector?: string | null;
  /** Template: the element (`raw` is the literal's body, `offset` the element's `<`, as `nodeAt` takes them). */
  tag?: string;
  raw?: string;
  offset?: number;
  /** Template: the class that reads the token. */
  className?: string;
  /** In a package stylesheet. */
  readOnly?: boolean;
}

export type TokenUsagesResult = { ok: true; name: string; usages: TokenUsage[]; aliases: string[] } | { ok: false; error: string };

/** A token the selected element reads, and how. */
export interface ElementToken {
  name: string;
  /** How the element reaches it: `class bg-primary`, `style`, `.card rule`; with the alias it went through. */
  via: string;
}
