import { computed, html, input, output, signal } from "@gable/core";
import { currentScope } from "@gable/core/internal";
import { cn } from "../../lib/ui/cn.js";
import { diffLines, parseDiff, serializeDiff, splitRows, type DiffLine } from "../../lib/ui/diff.js";
import { tokenize, type Highlighter, type Token, type TokenKind } from "../../lib/ui/highlight.js";
import { useHostClass } from "../../lib/ui/host-class.js";
import { UiIcon } from "../../lib/ui/icon.js";
import { UiButton } from "./button.js";

interface TokenVM {
  key: number;
  text: string;
  cls: string;
}
interface GutterVM {
  key: number;
  text: string;
  cls: string;
}
interface RowVM {
  key: number;
  cls: string;
  gutter: GutterVM[];
  marker: string;
  markerCls: string;
  textCls: string;
  tokens: TokenVM[];
}
interface CellVM {
  cls: string;
  num: string;
  numCls: string;
  marker: string;
  markerCls: string;
  textCls: string;
  tokens: TokenVM[];
}
interface SplitVM {
  key: number;
  left: CellVM;
  right: CellVM;
}

/** Token colours: palette shades picked for contrast on `bg-muted` in light and dark mode. */
const TOKEN_CLASS: Record<TokenKind, string> = {
  keyword: "text-violet-700 dark:text-violet-400",
  string: "text-emerald-700 dark:text-emerald-400",
  number: "text-amber-700 dark:text-amber-400",
  comment: "text-muted-foreground italic",
  punctuation: "text-foreground/60",
  function: "text-blue-700 dark:text-blue-400",
  type: "text-cyan-700 dark:text-cyan-400",
  tag: "text-rose-700 dark:text-rose-400",
  attr: "text-orange-700 dark:text-orange-300",
  property: "text-sky-700 dark:text-sky-300",
  plain: "",
};

const GUTTER = "w-10 shrink-0 select-none pr-2 text-right tabular-nums text-muted-foreground/70";
const MARKER = "w-4 shrink-0 select-none text-center";
const ROW_KIND: Record<string, [row: string, marker: string]> = {
  add: ["bg-emerald-500/15", "text-emerald-700 dark:text-emerald-400"],
  del: ["bg-red-500/15", "text-red-700 dark:text-red-400"],
  hunk: ["bg-sky-500/10 text-sky-700 dark:text-sky-300", ""],
  file: ["text-muted-foreground font-medium", ""],
  note: ["text-muted-foreground italic", ""],
  meta: ["", ""],
  context: ["", "text-muted-foreground"],
};
const MARK: Record<string, string> = { add: "+", del: "-", context: " " };
const BODY = new Set(["add", "del", "context"]);

/** Line numbers from `"1,3-5"` (or an array). Never throws; bad parts are ignored. */
function parseLines(spec: string | readonly number[]): Set<number> {
  const out = new Set<number>();
  if (typeof spec !== "string") {
    for (const n of spec) if (Number.isFinite(n)) out.add(n);
    return out;
  }
  for (const part of spec.split(",")) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Math.min(m[2] === undefined ? a : Number(m[2]), a + 100_000);
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out;
}

/**
 * Source code with syntax colours, line numbers, line highlights and a copy button.
 *
 *   <ui-code-block language="ts" [code]="source" [lineNumbers]="true" highlightLines="2,4-6"></ui-code-block>
 *
 * The built-in tokenizer (`lib/highlight.ts`) knows ts, tsx, js, jsx, json, html (Gable templates included), css and bash;
 * anything else is plain text. Pass `highlighter` (`(code, language) => Token[][]`, one array of `{ text, kind }` per
 * line) to use your own, such as a Shiki adapter. Everything renders as spans through the template, never as HTML, so
 * code cannot inject markup. `wrap` wraps long lines; otherwise the block scrolls sideways.
 *
 * Diffs: `language="diff"` shows unified diff text (file headers, `@@` hunk headers, `+`/`-` lines; the markers stay in
 * a gutter, so colour is never the only signal; with `lineNumbers` the old and new line numbers come from the hunk
 * headers). `oldCode` and `newCode` make the block compute the line diff itself, collapsing unchanged stretches beyond
 * `context` lines into `@@` hunks. `diffLanguage` highlights the diff body as that language. `layout="split"` puts the
 * old and new sides next to each other. `highlightLines` applies to plain code only.
 */
export class UiCodeBlock {
  static meta = {
    selector: "ui-code-block",
    imports: [UiIcon, UiButton],
    template: html`
      <div role="group" [attr.aria-label]="label()" class="relative overflow-hidden rounded-md border bg-muted/40 font-mono text-sm leading-6 text-foreground">
        @if (copyable()) {
          <button type="button" uiButton variant="outline" size="icon-compact" class="absolute top-1.5 right-1.5 z-10 bg-background/80 opacity-80 hover:opacity-100 focus-visible:opacity-100" [attr.aria-label]="copyLabel()" (click)="copy()">
            @if (didCopy()) {
              <svg uiIcon="check"></svg>
            } @else {
              <svg uiIcon="copy"></svg>
            }
          </button>
        }
        <span class="sr-only" role="status" aria-live="polite">{{ status() }}</span>
        @if (isSplit()) {
          <pre class="m-0 overflow-auto p-0 py-3" tabindex="0"><code [attr.data-language]="lang()" class="block min-w-full">@for (row of splitView(); track row.key) {<span class="grid grid-cols-2"><span [attr.class]="row.left.cls">@if (lineNumbers()) {<span [attr.class]="row.left.numCls">{{ row.left.num }}</span>}<span [attr.class]="row.left.markerCls">{{ row.left.marker }}</span><span [attr.class]="row.left.textCls">@for (t of row.left.tokens; track t.key) {<span [attr.class]="t.cls">{{ t.text }}</span>}</span></span><span [attr.class]="row.right.cls">@if (lineNumbers()) {<span [attr.class]="row.right.numCls">{{ row.right.num }}</span>}<span [attr.class]="row.right.markerCls">{{ row.right.marker }}</span><span [attr.class]="row.right.textCls">@for (t of row.right.tokens; track t.key) {<span [attr.class]="t.cls">{{ t.text }}</span>}</span></span></span>}</code></pre>
        } @else {
          <pre class="m-0 overflow-auto p-0 py-3" tabindex="0"><code [attr.data-language]="lang()" class="block min-w-full">@for (row of rows(); track row.key) {<span [attr.class]="row.cls">@for (g of row.gutter; track g.key) {<span [attr.class]="g.cls">{{ g.text }}</span>}@if (isDiff()) {<span [attr.class]="row.markerCls">{{ row.marker }}</span>}<span [attr.class]="row.textCls">@for (t of row.tokens; track t.key) {<span [attr.class]="t.cls">{{ t.text }}</span>}</span></span>}</code></pre>
        }
      </div>
    `,
  };

  /** The source (or, with `language="diff"`, the unified diff text). */
  code = input<string>("");
  /** `ts`, `tsx`, `js`, `jsx`, `json`, `html`, `css`, `bash`, `diff`, or anything else for plain text. */
  language = input<string>("text");
  lineNumbers = input<boolean>(false);
  /** Wrap long lines instead of scrolling sideways. */
  wrap = input<boolean>(false);
  /** Lines to highlight, `"2,4-6"` or an array (plain code only). */
  highlightLines = input<string | number[]>("");
  /** Replaces the built-in tokenizer. A throwing or malformed result falls back to the built-in one. */
  highlighter = input<Highlighter | null>(null);
  /** Show the copy button. */
  copyable = input<boolean>(true);
  /** Accessible name of the block. */
  label = input<string>("Code");
  /** Diff of `oldCode` against `newCode` (either one set switches to diff mode; `code` is then ignored). */
  oldCode = input<string | null>(null);
  newCode = input<string | null>(null);
  /** Unchanged lines kept around each change in a computed diff (negative: all of them). */
  context = input<number>(3);
  /** `unified` or `split` (side by side). Only used for diffs. */
  layout = input<"unified" | "split">("unified");
  /** Highlight the body of a diff as this language. */
  diffLanguage = input<string>("text");
  class = input<string>("");
  copied = output<{ text: string; ok: boolean }>();

  status = signal("");
  didCopy = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private apply = useHostClass(() => cn("block min-w-0", this.class()));
  private cleanup = currentScope()?.onDispose(() => clearTimeout(this.timer));

  copyLabel = computed(() => (this.didCopy() ? "Copied" : "Copy code"));
  lang = computed(() => String(this.language() ?? "text").toLowerCase());
  private computedDiff = computed(() => this.oldCode() !== null || this.newCode() !== null);
  isDiff = computed(() => this.computedDiff() || this.lang() === "diff" || this.lang() === "patch");
  isSplit = computed(() => this.isDiff() && this.layout() === "split");

  private diff = computed<DiffLine[]>(() => {
    if (!this.isDiff()) return [];
    if (this.computedDiff()) return diffLines(this.oldCode() ?? "", this.newCode() ?? "", { context: this.context() });
    return parseDiff(this.code());
  });

  /** The text the copy button writes. */
  private text = computed(() => (this.isDiff() ? serializeDiff(this.diff()) : this.code()));

  private run(code: string, language: string): Token[][] {
    const custom = this.highlighter();
    if (custom) {
      try {
        const out = custom(code, language);
        if (Array.isArray(out)) return out;
      } catch {
        // fall through to the built-in tokenizer
      }
    }
    return tokenize(code, language);
  }

  private vm(tokens: readonly Token[] | undefined, fallback: string): TokenVM[] {
    const list = Array.isArray(tokens) && tokens.length > 0 ? tokens : fallback ? [{ text: fallback, kind: "plain" as TokenKind }] : [];
    return list.map((t, key) => ({ key, text: String(t?.text ?? ""), cls: TOKEN_CLASS[t?.kind as TokenKind] ?? "" }));
  }

  /** Tokens of each body line of the diff, highlighted together so multi-line comments and strings carry over. */
  private bodyTokens = computed(() => {
    const map = new Map<DiffLine, Token[]>();
    const lang = this.diffLanguage();
    const body = this.diff().filter((l) => BODY.has(l.kind));
    if (body.length === 0 || (lang === "text" && !this.highlighter())) return map;
    const lines = this.run(body.map((l) => l.content).join("\n"), lang);
    body.forEach((l, i) => {
      const t = lines[i];
      if (t) map.set(l, t);
    });
    return map;
  });

  private lineClass = computed(() => (this.wrap() ? "whitespace-pre-wrap break-words" : "whitespace-pre"));

  /** Rows of the unified view: plain code, or a diff. */
  rows = computed<RowVM[]>(() => {
    const numbers = this.lineNumbers();
    const textCls = cn("min-w-0 flex-1 px-1", this.lineClass());
    const rowBase = cn("flex min-h-6 border-l-2 border-transparent", this.wrap() ? "w-full" : "w-max min-w-full");
    if (this.isDiff()) {
      const bodies = this.bodyTokens();
      return this.diff().map((l, key) => {
        const [rowCls, markerColor] = ROW_KIND[l.kind] ?? ["", ""];
        const body = BODY.has(l.kind);
        const gutter: GutterVM[] = numbers
          ? [
              { key: 0, text: l.oldNo === null ? "" : String(l.oldNo), cls: GUTTER },
              { key: 1, text: l.newNo === null ? "" : String(l.newNo), cls: GUTTER },
            ]
          : [];
        return {
          key,
          cls: cn(rowBase, rowCls),
          gutter,
          marker: MARK[l.kind] ?? "",
          markerCls: cn(MARKER, markerColor),
          textCls,
          tokens: this.vm(body ? bodies.get(l) : undefined, body ? l.content : l.text),
        };
      });
    }
    const raw = this.code();
    const source = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
    const lines = this.run(source, this.language());
    const marked = parseLines(this.highlightLines());
    const count = source === "" ? 1 : source.split("\n").length;
    const out: RowVM[] = [];
    for (let i = 0; i < count; i++) {
      const n = i + 1;
      out.push({
        key: i,
        cls: cn(rowBase, marked.has(n) && "border-primary bg-primary/10"),
        gutter: numbers ? [{ key: 0, text: String(n), cls: GUTTER }] : [],
        marker: "",
        markerCls: "",
        textCls,
        tokens: this.vm(lines[i], ""),
      });
    }
    return out;
  });

  /** Rows of the split (side by side) view of a diff. */
  splitView = computed<SplitVM[]>(() => {
    const bodies = this.bodyTokens();
    const base = cn("flex min-h-6 min-w-0 border-l-2 border-transparent", this.wrap() ? "" : "overflow-x-auto");
    const textCls = cn("min-w-0 flex-1 px-1", this.lineClass());
    const cell = (l: DiffLine | null, side: "old" | "new"): CellVM => {
      if (!l) return { cls: cn(base, "bg-muted/60"), num: "", numCls: GUTTER, marker: "", markerCls: MARKER, textCls, tokens: [] };
      const [rowCls, markerColor] = ROW_KIND[l.kind] ?? ["", ""];
      const no = side === "old" ? l.oldNo : l.newNo;
      return { cls: cn(base, rowCls), num: no === null ? "" : String(no), numCls: GUTTER, marker: MARK[l.kind] ?? "", markerCls: cn(MARKER, markerColor), textCls, tokens: this.vm(bodies.get(l), l.content) };
    };
    return splitRows(this.diff()).map((r, key) => {
      if (r.full) {
        const [rowCls] = ROW_KIND[r.full.kind] ?? [""];
        const full: CellVM = { cls: cn(base, "col-span-2", rowCls), num: "", numCls: "hidden", marker: "", markerCls: "hidden", textCls, tokens: this.vm(undefined, r.full.text) };
        return { key, left: full, right: { ...full, cls: "hidden", tokens: [] } };
      }
      return { key, left: cell(r.left, "old"), right: cell(r.right, "new") };
    });
  });

  copy(): void {
    const text = this.text();
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    const done = (ok: boolean) => {
      this.status.set(ok ? "Copied to clipboard" : "Could not copy");
      this.didCopy.set(ok);
      clearTimeout(this.timer);
      if (ok) this.timer = setTimeout(() => (this.didCopy.set(false), this.status.set("")), 2000);
      this.copied.emit({ text, ok });
    };
    if (!clip || typeof clip.writeText !== "function") return done(false);
    try {
      clip.writeText(text).then(() => done(true), () => done(false));
    } catch {
      done(false);
    }
  }
}
