// The write-back service: applies an edit operation to the project's own source files as a minimal text patch, and keeps the
// history of reverse patches for undo and redo. The Designer never holds a model of the design; the file is read, patched and
// written back, and the project's Vite shows the result by HMR.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseTemplateTree } from "@gable/template-format";
import { sourceText, type SourceText } from "../source.js";
import { setCssDeclaration } from "./css.js";
import { unifiedDiff, type UnifiedDiff } from "./diff.js";
import { applyHunks, applyWithReverse, hash, locate, type Hunk, type PatchHunk } from "./hunks.js";
import { ensureImport, ensureMetaImport, setMetaString } from "./meta.js";
import { buildPalette } from "./palette.js";
import { extractCheck, planExtract } from "./extract.js";
import { planScene } from "./scenario.js";
import { DEFAULT_FORMAT, applyPlan, describeElement, elementsOf, fail, findTarget, locateLiteral, plan, type FormatOptions } from "./template.js";
import type { DescribeResult, EditDone, EditError, EditOp, EditResult, HistoryInfo, HistoryItem, PaletteEntry, TargetRef } from "./types.js";

interface Change {
  abs: string;
  /** The patch that undoes (or, on the redo stack, redoes) the change, in the coordinates of the file as it is now. */
  patch: PatchHunk[];
  /** The edit created this file: undoing it empties the file and so removes it, and redoing starts from no file. */
  created: boolean;
  /** What the change did when it was last applied (the write itself, or its redo), for the Code tab. */
  diff: UnifiedDiff;
}

interface Entry {
  id: number;
  label: string;
  /** One change per file; the first is the file the edit was made in. */
  changes: Change[];
  stale: boolean;
}

/** One file an edit writes: its text before (null: the file is new) and the hunks to apply to it. */
export interface FileWrite {
  abs: string;
  original: string | null;
  hunks: Hunk[];
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
      if (e.changes.some((c) => c.abs === abs) && !e.stale) {
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
    return { ...describeElement(t.body, tree, entry, this.#rel(t.abs), line), extract: extractCheck(t.body, tree, entry) };
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
    if (op.op === "addScene") return this.#scene(op);
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
    } else if (op.op === "extract") {
      const planned = planExtract({ abs, rel: this.#rel(abs), text: src.text, lit, fo, palette: () => buildPalette(this.root) }, op);
      if ("ok" in planned) return planned;
      const crlf = src.original.includes("\r\n");
      const files: FileWrite[] = [
        { abs, original: src.original, hunks: this.#toOriginal(src, planned.hunks) },
        { abs: planned.created.abs, original: null, hunks: [{ start: 0, end: 0, text: crlf ? planned.created.text.replaceAll("\n", "\r\n") : planned.created.text }] },
      ];
      return this.#commitFiles(files, planned.label, planned.select, { created: [this.#rel(planned.created.abs)], ...(planned.note ? { note: planned.note } : {}) });
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
  #toOriginal(src: SourceText, hunks: Hunk[]): Hunk[] {
    const crlf = src.original.includes("\r\n");
    return hunks.map((h) => ({ start: src.toOriginal(h.start), end: src.toOriginal(h.end), text: crlf ? h.text.replaceAll("\n", "\r\n") : h.text }));
  }

  #commit(abs: string, original: string, hunks: Hunk[], label: string, select: { raw: string; offset: number } | null): EditResult {
    return this.#commitFiles([{ abs, original, hunks }], label, select);
  }

  /** Writes every file of one edit and records them as one history entry. Nothing is written unless every patch applies. */
  #commitFiles(files: FileWrite[], label: string, select: { raw: string; offset: number } | null, extra: Partial<EditDone> = {}): EditResult {
    const planned: Array<{ abs: string; text: string; reverse: PatchHunk[]; created: boolean; diff: UnifiedDiff }> = [];
    for (const f of files) {
      if (f.original === null && existsSync(f.abs)) return fail("invalid", `${this.#rel(f.abs)} already exists.`);
      try {
        const next = applyWithReverse(f.original ?? "", f.hunks);
        planned.push({ abs: f.abs, text: next.text, reverse: next.reverse, created: f.original === null, diff: unifiedDiff(this.#rel(f.abs), f.original ?? "", next.text) });
      } catch (e) {
        return fail("invalid", e instanceof Error ? e.message : String(e));
      }
    }
    const done: typeof planned = [];
    for (const p of planned) {
      const bad = this.#write(p.abs, p.text);
      if (bad) {
        this.#rollback(done, files);
        return bad;
      }
      done.push(p);
    }
    this.#undo.push({ id: this.#next++, label, changes: planned.map((p) => ({ abs: p.abs, patch: p.reverse, created: p.created, diff: p.diff })), stale: false });
    if (this.#undo.length > MAX_HISTORY) this.#undo.shift();
    this.#redo = [];
    return { ok: true, label, file: this.#rel(files[0]!.abs), select, ...extra };
  }

  /** Puts back the files a failed multi-file write had already written. */
  #rollback(written: Array<{ abs: string; created: boolean }>, files: FileWrite[]): void {
    for (const w of written) {
      const original = files.find((f) => f.abs === w.abs)?.original;
      try {
        if (w.created) rmSync(w.abs, { force: true });
        else if (original != null) writeFileSync(w.abs, original);
      } catch {
        // best effort: the write that failed is what gets reported
      }
    }
  }

  #scene(op: Extract<EditOp, { op: "addScene" }>): EditResult {
    if (!/\.scenes\.ts$/.test(op.file)) return fail("invalid", "Scenarios are written to a *.scenes.ts file.");
    const abs = this.#fileOf({ file: op.file.replace(/^\//, "") });
    if (typeof abs !== "string") return abs;
    const src = sourceText(readFileSync(abs, "utf8"));
    const planned = planScene(src.text, op);
    if ("ok" in planned) return planned;
    return this.#commit(abs, src.original, this.#toOriginal(src, planned.hunks), planned.label, null);
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
    // Every file is located before any is written: an entry is undone or redone whole, or not at all.
    const steps: Array<{ change: Change; current: string; next: ReturnType<typeof applyWithReverse> }> = [];
    let relocated = false;
    for (const change of entry.changes) {
      const exists = existsSync(change.abs);
      // A file the edit created is absent while the edit is undone, so redo starts from no file.
      if (!exists && !change.created) return fail("missing", `${this.#rel(change.abs)} no longer exists.`);
      const current = exists ? readFileSync(change.abs, "utf8") : "";
      const located = locate(current, change.patch);
      if (!located.ok) {
        return fail("conflict", `${verb} cannot be applied: ${located.error} (${this.#rel(change.abs)} was edited outside the Designer.)`);
      }
      relocated ||= located.relocated;
      steps.push({ change, current, next: applyWithReverse(current, located.hunks) });
    }
    for (const s of steps) {
      if (s.change.created && s.next.text === "") {
        try {
          rmSync(s.change.abs, { force: true });
        } catch (e) {
          return fail("io", `Could not remove ${this.#rel(s.change.abs)}: ${e instanceof Error ? e.message : e}`);
        }
        this.#written.delete(s.change.abs);
        continue;
      }
      const bad = this.#write(s.change.abs, s.next.text);
      if (bad) return bad;
    }
    from.pop();
    to.push({ ...entry, changes: steps.map((s) => ({ ...s.change, patch: s.next.reverse, diff: to === this.#undo ? unifiedDiff(this.#rel(s.change.abs), s.current, s.next.text) : s.change.diff })), stale: false });
    return { ok: true, label: `${verb}: ${entry.label}`, file: this.#rel(entry.changes[0]!.abs), select: null, ...(relocated ? { relocated: true } : {}) };
  }

  history(): HistoryInfo {
    const item = (e: Entry): HistoryItem => ({
      id: e.id,
      label: e.label,
      file: this.#rel(e.changes[0]!.abs),
      ...(e.changes.length > 1 ? { files: e.changes.map((c) => this.#rel(c.abs)) } : {}),
      stale: e.stale,
    });
    const external = [...new Set([...this.#undo, ...this.#redo].filter((e) => e.stale).flatMap((e) => e.changes.map((c) => this.#rel(c.abs))))];
    const top = this.#undo[this.#undo.length - 1];
    const last = top ? { ...item(top), diff: top.changes[0]!.diff } : null;
    return { undo: this.#undo.map(item), redo: this.#redo.map(item), external, last };
  }
}

export { applyHunks };
