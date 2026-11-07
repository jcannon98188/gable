// Templates that do not compile. The runtime compiles a template when it first renders it; a hot update whose template fails
// is rolled back, so the canvas keeps the last good version and the error alone (a message, no file or line) is all the page
// knows. This check runs the language service's syntax pass (`checkTemplateSyntax`: no type-check, milliseconds) on every
// changed file, so the shell can say which file and line keeps the canvas from following, before the full analysis is back.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { checkTemplateSyntax } from "@gable/language-service";
import { literalAt, sourceText } from "./source.js";

export interface CompileError {
  /** Path relative to the project root, with forward slashes. */
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  /** The template literal as the runtime would see it, and the offset in it (as for diagnostics). */
  raw?: string;
  offset?: number;
}

const SKIP = new Set(["node_modules", "dist", ".git", ".vite", "target", "coverage"]);
const SCRIPT = /\.(?:[mc]?ts|tsx)$/;

/** The compile errors of one file (empty when it compiles, is gone, or holds no template). */
export function checkFile(root: string, file: string): CompileError[] {
  const abs = resolve(root, file);
  if (!existsSync(abs)) return [];
  const original = readFileSync(abs, "utf8");
  if (!original.includes("`")) return [];
  const src = sourceText(original);
  const rel = relative(root, abs).split(sep).join("/");
  return checkTemplateSyntax(abs, original).map((d) => {
    const at = literalAt(src, d.start);
    return { file: rel, line: d.line, column: d.column, rule: d.rule, message: d.message, ...(at ? { raw: at.raw, offset: at.offset } : {}) };
  });
}

/** The project's current compile errors, by file; `update` re-checks the files a change touched. */
export class CompileChecks {
  #byFile = new Map<string, CompileError[]>();
  #scanned = false;

  constructor(readonly root: string) {}

  /** Every compile error, files in path order. Checks the whole project on first use. */
  list(): CompileError[] {
    if (!this.#scanned) this.#scanAll();
    return [...this.#byFile.keys()].sort().flatMap((f) => this.#byFile.get(f)!);
  }

  /** Re-checks `files` (absolute or root-relative); true when what `list` returns changed. */
  update(files: Iterable<string>): boolean {
    let changed = false;
    for (const file of files) {
      if (!SCRIPT.test(file) || file.endsWith(".d.ts")) continue;
      const rel = relative(this.root, resolve(this.root, file)).split(sep).join("/");
      let next: CompileError[];
      try {
        next = checkFile(this.root, rel);
      } catch {
        continue; // unreadable mid-write: the save that finishes it is another change
      }
      const before = this.#byFile.get(rel) ?? [];
      if (JSON.stringify(before) === JSON.stringify(next)) continue;
      changed = true;
      if (next.length) this.#byFile.set(rel, next);
      else this.#byFile.delete(rel);
    }
    return changed;
  }

  #scanAll(): void {
    this.#scanned = true;
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.isDirectory()) return SKIP.has(e.name) || e.name.startsWith(".") ? [] : walk(join(dir, e.name));
        return SCRIPT.test(e.name) && !e.name.endsWith(".d.ts") ? [join(dir, e.name)] : [];
      });
    this.update(walk(this.root));
  }
}
