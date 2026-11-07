// The write-back API: what the shell sends and gets back. Types only (the shell imports them without pulling in server code).
import type { UnifiedDiff } from "./diff.js";
import type { MockReplyPatch, MockSpec } from "../../network.js";

export type { DiffLine, UnifiedDiff } from "./diff.js";

/**
 * A template element as the preview agent reports it (`DesignNode`), plus where its file is. The `raw` text finds the template
 * literal in the file (templates have no holes, so it is the literal's exact body); `start` is the runtime's offset of the `<`
 * and `tag` is checked against the position parser's element at that offset, so a stale handle is refused, never guessed.
 */
export interface TargetRef {
  raw: string;
  start: number;
  tag: string;
  /** Project-relative module URL as the dev server serves it (`/src/todo-item.ts`), or an absolute path. */
  modulePath?: string;
  file?: string;
}

export type Where = "before" | "after" | "first" | "last";

export interface ComponentRef {
  /** The exported class, for example `UiButton`. */
  name: string;
  /** Project-relative path of its module (`src/components/ui/button.ts`). */
  file: string;
}

export type BindingKind = "prop" | "attr" | "class" | "style" | "model";

export type WrapWith = { kind: "if"; cond: string } | { kind: "for"; item: string; source: string; track: string };

export type EditOp =
  /** Replaces text run `run` (see `NodeModel.text`) of the element; `{{ }}` interpolations must survive unchanged and in order. */
  | { op: "setText"; target: TargetRef; run: number; text: string }
  /** Adds text to an element that has none. */
  | { op: "addText"; target: TargetRef; text: string }
  /** Sets (or adds) a static attribute. */
  | { op: "setAttr"; target: TargetRef; name: string; value: string }
  /** Removes a static attribute, or a binding that is a plain signal read. `name` is as written (`disabled`, `[title]`). */
  | { op: "removeAttr"; target: TargetRef; name: string }
  /** Binds a property, attribute, class, style or two-way model to a signal chosen from the picker (`expr` is a plain read such as `count()`). */
  | { op: "setBinding"; target: TargetRef; kind: BindingKind; name: string; expr: string }
  /** Appends `{{ expr }}` to the element's content. */
  | { op: "addTextBinding"; target: TargetRef; expr: string }
  /** Inserts markup next to or inside an element (`target.start` -1: the template's root, with `first` or `last`). */
  | { op: "insert"; target: TargetRef; where: Where; snippet: string; component?: ComponentRef }
  | { op: "delete"; target: TargetRef }
  /** Moves an element within its template. */
  | { op: "move"; target: TargetRef; to: TargetRef; where: Where }
  | { op: "wrap"; target: TargetRef; with: WrapWith }
  /** Sets a string-valued static meta property (`selector`, `id`, `encapsulation`) of the component that owns the template. */
  | { op: "setMeta"; target: TargetRef; key: string; value: string }
  /** Sets (`value`) or removes (`null`) one declaration of a CSS rule; the rule is appended when the file has none. */
  | { op: "setCss"; file: string; selector: string; property: string; value: string | null }
  /**
   * Sets (`value`) or removes (`null`) one design token (a custom property) in one exact context of a project stylesheet:
   * the rule `selector` (null: directly in the at-rule, as in `@theme`) inside `atRules`, outermost first. A context the file
   * lacks is appended. `expect` is the value the caller read there (null: none); the edit is refused as stale when it differs.
   */
  | { op: "setToken"; file: string; name: string; selector: string | null; atRules?: string[]; value: string | null; expect?: string | null }
  /**
   * Adds a scene to a scenes file (root-relative, `/src/x.scenes.ts`): after its last scene, as written. `from` copies an
   * existing scene's definition (its inputs, providers and mocks) and gives the copy `description`. `inputs` and `state`
   * (plain data by field name) are set on the new scene over what it copied: what "Save as Scenario" writes.
   */
  | { op: "addScene"; file: string; name: string; description?: string; from?: string; inputs?: Record<string, unknown>; state?: Record<string, unknown> }
  /** Adds a page-mode Scenario whose HTTP mocks answer as recorded (see `mocksFromRecording` in network.ts); `url` is the route it opens. */
  | { op: "addMockScene"; file: string; name: string; description?: string; url?: string; mocks: MockSpec[] }
  /** Changes one mock's reply (its literal fields only); `expectUrl` refuses a mock that is no longer the one shown. */
  | { op: "setMock"; file: string; scene: string; index: number; reply: MockReplyPatch; expectUrl?: string }
  | { op: "removeMock"; file: string; scene: string; index: number; expectUrl?: string }
  /**
   * Moves an element (static markup only) into a new component `name` in a file beside the template's, and uses it in its place.
   * `all` also replaces the identical copies of the element in the same template. `props` also moves markup that reads the old
   * component's state through plain signal reads (`title()`): each read becomes an `input` of the new component, bound where it was.
   */
  | { op: "extract"; target: TargetRef; name: string; all?: boolean; props?: boolean }
  /**
   * Renames a component class in every file that declares, imports or re-exports it (identifiers only, never strings), as one
   * undo step. `selector` also renames its selector in its meta, the templates that use it and stylesheets that style the tag.
   */
  | { op: "renameComponent"; from: string; to: string; file?: string; selector?: string };

export interface EditError {
  ok: false;
  /** `stale`: the template changed since it was selected. `ambiguous`, `escapes`: the literal cannot be located exactly. `readonly`: the thing is a dynamic expression. `invalid`: bad input. `conflict`: undo/redo cannot find its place. */
  code: "missing" | "stale" | "ambiguous" | "escapes" | "readonly" | "invalid" | "conflict" | "nothing" | "io";
  error: string;
}

export interface EditDone {
  ok: true;
  /** What the edit was called in the history. */
  label: string;
  /** Project-relative path of the file written. */
  file: string;
  /** The edited element in the new template (after HMR the shell selects it again), or null. */
  select: { raw: string; offset: number } | null;
  /** The edit changed nothing. */
  noop?: boolean;
  /** Undo or redo found its place by context because the file was edited meanwhile. */
  relocated?: boolean;
  /** Files the edit created (project-relative). */
  created?: string[];
  /** Every file a multi-file edit (rename) changed (project-relative). */
  changed?: string[];
  /** Something the edit could not carry over, said plainly (for example scoped styles that do not reach a new component). */
  note?: string;
}

export type EditResult = EditDone | EditError;

export interface AttrModel {
  /** As written: `class`, `[title]`, `(click)`. */
  name: string;
  kind: "static" | "binding" | "model" | "event" | "ref" | "i18n" | "other";
  /** The value as written, without quotes. */
  value: string;
  editable: boolean;
  /** Why it cannot be edited. */
  why?: string;
  /** For an editable binding: the signal it reads. */
  signal?: string;
}

export interface TextModel {
  run: number;
  /** The text as written, whitespace collapsed; interpolations show as `{{ expr }}`. */
  text: string;
  editable: boolean;
  why?: string;
  /** How many `{{ }}` interpolations it holds (read-only parts). */
  dynamic: number;
}

export interface SiblingRef {
  start: number;
  tag: string;
}

export interface NodeModel {
  ok: true;
  tag: string;
  /** Position of this element among the template's elements, in document order (the handle the runtime `pos` stands for). */
  ordinal: number;
  file: string;
  line: number;
  attrs: AttrModel[];
  text: TextModel[];
  /** The element can hold text and has none yet. */
  canAddText: boolean;
  /** `i18n`, raw-text elements and the like: why the content cannot be edited. */
  contentWhy?: string;
  children: Array<{ kind: "element" | "text" | "block" | "comment"; label: string; start: number; tag?: string }>;
  /** Neighbouring elements in the same parent, for move. */
  prev: SiblingRef | null;
  next: SiblingRef | null;
  parent: SiblingRef | null;
  canHaveChildren: boolean;
  /** Whether the element can be extracted into a component, and how many identical copies the template has (itself included). */
  extract?: ExtractCheck;
}

export type ExtractCheck =
  | { ok: true; copies: number; /** Signal reads that become inputs (empty for static markup). */ props?: string[] }
  | { ok: false; why: string; /** The element can be extracted with props: the signal reads that would become inputs. */ withProps?: { props: string[]; copies: number } };

export type DescribeResult = NodeModel | EditError;

export interface PaletteEntry {
  group: "html" | "gable-ui" | "project";
  name: string;
  /** What the markup looks like when inserted. */
  snippet: string;
  /** Set for components: inserting also imports the class and lists it in the owning component's `imports`. */
  component?: ComponentRef;
  selector?: string;
}

export interface HistoryItem {
  id: number;
  label: string;
  file: string;
  /** Every file the entry changes, when it is more than one (extract writes the source and creates the component). */
  files?: string[];
  /** The file was changed by something other than the Designer since this entry was recorded. */
  stale: boolean;
}

export interface HistoryInfo {
  undo: HistoryItem[];
  redo: HistoryItem[];
  /** Files edited outside the Designer since the last edit it made. */
  external: string[];
  /** The change Undo would take back (the top of `undo`), with the unified diff of its write; null when there is none. */
  last: (HistoryItem & { diff: UnifiedDiff }) | null;
}
