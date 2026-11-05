// Quick fixes for analyzer diagnostics. Later rules add an entry here; the plugin
// turns whatever is registered into tsserver code fixes.

import type { Diagnostic } from "./analyze.js";
import type { RuleId } from "./config.js";

export interface Fix {
  description: string;
  /** Edits in the diagnostic's own file. */
  edits: Array<{ start: number; length: number; newText: string }>;
}

type FixBuilder = (diagnostic: Diagnostic, text: string) => Fix | undefined;

export const QUICK_FIXES: Partial<Record<RuleId, FixBuilder>> = {
  "bare-signal": (d, text) => {
    const name = text.slice(d.start, d.start + d.length);
    return { description: `Call the signal: ${name}()`, edits: [{ start: d.start + d.length, length: 0, newText: "()" }] };
  },
  "unknown-member": (d) => {
    const suggestion = /Did you mean '([^']+)'/.exec(d.message)?.[1];
    return suggestion ? { description: `Change spelling to '${suggestion}'`, edits: [{ start: d.start, length: d.length, newText: suggestion }] } : undefined;
  },
};

/** Fixes for the diagnostics that overlap the range `[start, end]`. */
export function fixesFor(diagnostics: Diagnostic[], text: string, start: number, end: number): Fix[] {
  const fixes: Fix[] = [];
  for (const d of diagnostics) {
    if (d.start > end || d.start + d.length < start) continue;
    const fix = QUICK_FIXES[d.rule]?.(d, text);
    if (fix) fixes.push(fix);
  }
  return fixes;
}
