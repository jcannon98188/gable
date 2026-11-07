// When the canvas is not showing the source as saved. Two things say so: the backend's compile check (a template in a saved
// file does not compile: file, line, message) and the page's own hot-update log (an update of a module was rolled back, so
// the page kept the last good version of it). The banner over the canvas and the Problems tab are built from this.
import type { HmrEntry } from "@gable/core/devtools";
import type { CompileError } from "../../../src/server/compile-check.js";

/** What the canvas banner says; null when the canvas follows the source. */
export interface StaleCanvas {
  title: string;
  /** `src/x.ts:14:22`, or the module when only the page's log knows about it. */
  where: string;
  message: string;
  /** The page rolled the update back: what is on the canvas is the last version that worked. */
  lastGood: boolean;
  /** How many more files or updates have a problem besides the one shown. */
  more: number;
  /** Project-relative file of the problem shown. */
  file: string;
}

/** A module URL as the page reports it (`http://localhost:5173/src/a.ts?t=1`) as a project path (`src/a.ts`). */
export function modulePath(url: string): string {
  let path = url.replace(/\\/g, "/");
  if (/^[a-z]:\//i.test(path)) return path; // a Windows path, not a URL with a scheme
  try {
    path = new URL(path).pathname;
  } catch {
    path = path.replace(/[?#].*$/, "");
  }
  return decodeURIComponent(path).replace(/^\/+/, "");
}

const sameFile = (module: string, file: string) => module === file || module.endsWith("/" + file);

/** Whether `path` (a module URL, an absolute or a project path) is a file the canvas is not following. */
export function isStale(errors: readonly CompileError[], hmr: readonly HmrEntry[], path: string): boolean {
  const p = modulePath(path);
  return errors.some((e) => sameFile(p, e.file)) || rolledBack(hmr).some((r) => sameFile(p, r.file) || sameFile(r.file, p));
}

/**
 * The modules whose latest hot update was rolled back, with that update's errors. A later update of the same module that
 * applied (or changed nothing) means the page caught up with it again.
 */
export function rolledBack(entries: readonly HmrEntry[]): Array<{ file: string; errors: string[] }> {
  const latest = new Map<string, HmrEntry>();
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) for (const m of e.modules) latest.set(modulePath(m), e);
  return [...latest]
    .filter(([, e]) => e.status === "rolled-back")
    .map(([file, e]) => ({ file, errors: e.errors }));
}

export function staleCanvas(errors: readonly CompileError[], hmr: readonly HmrEntry[]): StaleCanvas | null {
  const rolled = rolledBack(hmr);
  const files = [...new Set(errors.map((e) => e.file))];
  // A template that does not compile, preferring one the page has just refused.
  const shown = errors.find((e) => rolled.some((r) => sameFile(r.file, e.file))) ?? errors[0];
  if (shown) {
    const lastGood = rolled.some((r) => sameFile(r.file, shown.file));
    const others = rolled.filter((r) => !files.some((f) => sameFile(r.file, f))).length;
    return {
      title: "Template does not compile",
      where: `${shown.file}:${shown.line}:${shown.column}`,
      message: shown.message,
      lastGood,
      more: files.length - 1 + others,
      file: shown.file,
    };
  }
  // The page refused an update the compile check has nothing against (a setup that throws, an expression the check passes).
  const first = rolled[0];
  if (!first) return null;
  return {
    title: "The hot update failed",
    where: first.file,
    message: first.errors[0] ?? "The page kept the previous version.",
    lastGood: true,
    more: rolled.length - 1,
    file: first.file,
  };
}

/** The note under the message: what the canvas shows meanwhile. */
export function staleNote(s: StaleCanvas): string {
  const more = s.more > 0 ? ` (${s.more} more in Problems)` : "";
  return (s.lastGood ? "The canvas shows the last good version until this is fixed." : "The canvas changes once it compiles.") + more;
}
