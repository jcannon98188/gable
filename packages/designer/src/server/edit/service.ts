// The write-back service: applies an edit operation to the project's own source files as a minimal text patch, and keeps the
// history of reverse patches for undo and redo. The Designer never holds a model of the design; the file is read, patched and
// written back, and the project's Vite shows the result by HMR.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseTemplateTree } from "@gable/template-format";
import { sourceText, type SourceText } from "../source.js";
import { setCssDeclaration } from "./css.js";
import { applyHunks, applyWithReverse, hash, locate, type Hunk, type PatchHunk } from "./hunks.js";
import { ensureImport, ensureMetaImport, setMetaString } from "./meta.js";
import { buildPalette } from "./palette.js";
import { templateOutline, type OutlineRow } from "./outline.js";
import { DEFAULT_FORMAT, applyPlan, describeElement, elementsOf, fail, findTarget, locateLiteral, plan, type FormatOptions } from "./template.js";
import type { DescribeResult, EditError, EditOp, EditResult, HistoryInfo, HistoryItem, PaletteEntry, TargetRef } from "./types.js";

interface Entry {
  id: number;
  label: string;
  abs: string;
  /** The patch that undoes (or, on the redo stack, redoes) the change, in the coordinates of the file as it is now. */
  patch: PatchHunk[];
  stale: boolean;
}

const MAX_HISTORY = 200;

/** Prettier options the project sets (JSON `.prettierrc`, `.prettierrc.json` or `package.json#prettier`); the formatter's defaults otherwise. */
export function formatOptions(root: string): FormatOptions {
  const read = (file: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(readFileSync(join(root, file), "utf8")) as Record<string, unknown>;
      return file === "package.json" ? ((v.prettier as Record<string, unknown> | undefined) ?? null) : v;
    } catch {
      return null;
    }
  };
  const cfg = read(".prettierrc") ?? read(".prettierrc.json") ?? read("package.json") ?? {};
  const tab = typeof cfg.tabWidth === "number" ? cfg.tabWidth : DEFAULT_FORMAT.indentSize;
  return {
    indentSize: tab,
    useTabs: cfg.useTabs === true,
    printWidth: typeof cfg.printWidth === "number" ? cfg.printWidth : DEFAULT_FORMAT.printWidth,
  };
}

export class EditService {
  readonly root: string;
  #undo: Entry[] = [];
  #redo: Entry[] = [];
  #written = new Map<string, string>();
  #next = 1;

  constructor(root: string) {
    this.root = resolve(root);
  }

  // --- files ---------------------------------------------------------------------------------------------------

  #fileOf(ref: { file?: string; modulePath?: string }): string | EditError {
    const given = ref.file ?? ref.modulePath;
    if (!given) return fail("missing", "No source file is known for this component.");
    const abs = isAbsolute(given) && existsSync(given) ? resolve(given) : resolve(join(this.root, given));
    return this.#inside(abs);
  }

  #inside(abs: string): string | EditError {
    const rel = relative(this.root, abs);
    if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("node_modules")) return fail("invalid", "Only the project's own source files can be edited.");
    if (!existsSync(abs)) return fail("missing", `${rel} does not exist.`);
    return abs;
  }

  #rel = (abs: string) => relative(this.root, abs).split(sep).join("/");

  #write(abs: string, text: string): EditError | null {
    try {
      writeFileSync(abs, text);
    } catch (e) {
      return fail("io", `Could not write ${this.#rel(abs)}: ${e instanceof Error ? e.message : e}`);
    }
    this.#written.set(abs, hash(text));
    return null;
  }

  /** Called when a project file changed on disk. True when it was not the Designer who changed it and history for it exists. */
  noteFileChanged(abs: string): boolean {
    const known = this.#written.get(abs);
    if (known === undefined) return false;
    let current: string;
    try {
      current = readFileSync(abs, "utf8");
    } catch {
      return false;
    }
    if (hash(current) === known) return false;
    this.#written.set(abs, hash(current));
    let any = false;
    for (const e of [...this.#undo, ...this.#redo]) {
      if (e.abs === abs && !e.stale) {
        e.stale = true;
        any = true;
      }
    }
    return any;
  }

  // --- reading -------------------------------------------------------------------------------------------------

  #template(ref: TargetRef): { abs: string; src: SourceText; lit: { tagStart: number; open: number; close: number }; body: string } | EditError {
    const abs = this.#fileOf(ref);
    if (typeof abs !== "string") return abs;
    const src = sourceText(readFileSync(abs, "utf8"));
    const found = locateLiteral(src.text, ref.raw);
    if ("ok" in found) return found;
    return { abs, src, lit: found.lit, body: src.text.slice(found.lit.open, found.lit.close) };
  }

  describe(target: TargetRef): DescribeResult {
    const t = this.#template(target);
    if ("ok" in t) return t;
    const tree = parseTemplateTree(t.body);
    const entry = findTarget(elementsOf(tree), target);
    if ("ok" in entry) return entry;
    const line = (offset: number) => t.src.text.slice(0, t.lit.open + offset).split("\n").length;
    return describeElement(t.body, tree, entry, this.#rel(t.abs), line);
  }

  /** The outline of the template that holds `ref` (the Structure tab's Template section). */
  outline(ref: Pick<TargetRef, "raw" | "modulePath" | "file">): { ok: true; file: string; line: number; rows: OutlineRow[] } | EditError {
    const t = this.#template({ ...ref, start: -1, tag: "" });
    if ("ok" in t) return t;
    const line = t.src.text.slice(0, t.lit.open).split("\n").length;
    return { ok: true, file: this.#rel(t.abs), line, rows: templateOutline(t.body, parseTemplateTree(t.body)) };
  }

  palette(): PaletteEntry[] {
    return buildPalette(this.root);
  }

  // --- editing -------------------------------------------------------------------------------------------------

  apply(op: EditOp): EditResult {
    try {
      return this.#apply(op);
    } catch (e) {
      return fail("invalid", e instanceof Error ? e.message : String(e));
    }
  }

  #apply(op: EditOp): EditResult {
    if (op.op === "setCss") return this.#css(op);
    const t = this.#template(op.target);
    if ("ok" in t) return t;
    const { abs, src, lit, body } = t;
    const fo = formatOptions(this.root);
    let label: string;
    let hunks: Hunk[];
    let select: { raw: string; offset: number } | null = null;

    if (op.op === "setMeta") {
      const entry = findTarget(elementsOf(parseTemplateTree(body)), op.target);
      if ("ok" in entry) return entry;
      const h = setMetaString(src.text, lit.open, op.key, op.value);
      if ("ok" in h) return h;
      hunks = h;
      label = `Set ${op.key}`;
      select = { raw: body, offset: op.target.start };
    } else {
      const tree = parseTemplateTree(body);
      const entries = elementsOf(tree);
      const planned = plan({ body, tree, entries, fo, unit: fo.useTabs ? "\t" : " ".repeat(fo.indentSize) }, op);
      if ("ok" in planned) return planned;
      const applied = applyPlan(src.text, lit, planned.entry, planned.plan, fo);
      label = planned.plan.label;
      hunks = applied.hunk ? [{ start: lit.open + applied.hunk.start, end: lit.open + applied.hunk.end, text: applied.hunk.text }] : [];
      if (applied.selectOrdinal !== null) {
        const after = elementsOf(parseTemplateTree(applied.body))[applied.selectOrdinal];
        if (after) select = { raw: applied.body, offset: after.el.start };
      }
      const c = planned.plan.component;
      if (c) {
        const metaHunks = ensureMetaImport(src.text, lit.open, c.name);
        if ("ok" in metaHunks) return metaHunks;
        hunks.push(...metaHunks, ...ensureImport(src.text, c.name, c.file, this.#rel(abs)));
      }
    }
    if (hunks.length === 0) return { ok: true, label, file: this.#rel(abs), select, noop: true };
    return this.#commit(abs, src.original, this.#toOriginal(src, hunks), label, select);
  }

  /** Hunks in LF coordinates to hunks in the file as stored (CRLF kept: new line breaks use the file's own). */
  /**
   * Applies a language-service quick fix to `file` (project-relative) as one undoable edit. The edits are offsets into the
   * file as it was analysed, so the fix is refused when the file has changed since (`expectHash`).
   */
  applyFix(file: string, expectHash: string, edits: Array<{ start: number; length: number; newText: string }>, label: string): EditResult {
    const abs = this.#inside(resolve(join(this.root, file)));
    if (typeof abs !== "string") return abs;
    const original = readFileSync(abs, "utf8");
    if (hash(original) !== expectHash) return fail("stale", `${this.#rel(abs)} changed since it was analysed. Refresh the problems and try again.`);
    if (edits.some((e) => e.start < 0 || e.length < 0 || e.start + e.length > original.length)) return fail("invalid", "The fix does not fit the file.");
    return this.#commit(abs, original, edits.map((e) => ({ start: e.start, end: e.start + e.length, text: e.newText })), label, null);
  }

  #toOriginal(src: SourceText, hunks: Hunk[]): Hunk[] {
    const crlf = src.original.includes("\r\n");
    return hunks.map((h) => ({ start: src.toOriginal(h.start), end: src.toOriginal(h.end), text: crlf ? h.text.replaceAll("\n", "\r\n") : h.text }));
  }

  #commit(abs: string, original: string, hunks: Hunk[], label: string, select: { raw: string; offset: number } | null): EditResult {
    let next: ReturnType<typeof applyWithReverse>;
    try {
      next = applyWithReverse(original, hunks);
    } catch (e) {
      return fail("invalid", e instanceof Error ? e.message : String(e));
    }
    const bad = this.#write(abs, next.text);
    if (bad) return bad;
    this.#undo.push({ id: this.#next++, label, abs, patch: next.reverse, stale: false });
    if (this.#undo.length > MAX_HISTORY) this.#undo.shift();
    this.#redo = [];
    return { ok: true, label, file: this.#rel(abs), select };
  }

  #css(op: Extract<EditOp, { op: "setCss" }>): EditResult {
    if (!/\.css$/i.test(op.file)) return fail("invalid", "Only .css files can be edited here.");
    const abs = this.#inside(resolve(join(this.root, op.file)));
    if (typeof abs !== "string") return abs;
    const original = readFileSync(abs, "utf8");
    const text = original.replaceAll("\r\n", "\n");
    const hunks = setCssDeclaration(text, op.selector, op.property, op.value);
    if ("ok" in hunks) return hunks;
    const src = sourceText(original);
    return this.#commit(abs, original, this.#toOriginal(src, hunks), op.value === null ? `Remove ${op.property}` : `Set ${op.property}`, null);
  }

  // --- history ---------------------------------------------------------------------------------------------------

  undo(): EditResult {
    return this.#step(this.#undo, this.#redo, "Undo");
  }

  redo(): EditResult {
    return this.#step(this.#redo, this.#undo, "Redo");
  }

  #step(from: Entry[], to: Entry[], verb: string): EditResult {
    const entry = from[from.length - 1];
    if (!entry) return fail("nothing", `Nothing to ${verb.toLowerCase()}.`);
    if (!existsSync(entry.abs)) return fail("missing", `${this.#rel(entry.abs)} no longer exists.`);
    const current = readFileSync(entry.abs, "utf8");
    const located = locate(current, entry.patch);
    if (!located.ok) {
      return fail("conflict", `${verb} cannot be applied: ${located.error} (${this.#rel(entry.abs)} was edited outside the Designer.)`);
    }
    const next = applyWithReverse(current, located.hunks);
    const bad = this.#write(entry.abs, next.text);
    if (bad) return bad;
    from.pop();
    to.push({ ...entry, patch: next.reverse, stale: false });
    return { ok: true, label: `${verb}: ${entry.label}`, file: this.#rel(entry.abs), select: null, ...(located.relocated ? { relocated: true } : {}) };
  }

  history(): HistoryInfo {
    const item = (e: Entry): HistoryItem => ({ id: e.id, label: e.label, file: this.#rel(e.abs), stale: e.stale });
    const external = [...new Set([...this.#undo, ...this.#redo].filter((e) => e.stale).map((e) => this.#rel(e.abs)))];
    return { undo: this.#undo.map(item), redo: this.#redo.map(item), external };
  }
}

export { applyHunks };
