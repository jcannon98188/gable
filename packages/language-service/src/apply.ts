import { readFileSync, writeFileSync } from "node:fs";
import { analyzeProject } from "./analyze.js";
import { applyEdits } from "./fixes.js";

/**
 * Applies the first quick fix of every diagnostic that has one, re-analyzing until nothing
 * more applies (one fix can enable another, e.g. a rows view model feeding a second field).
 * Returns the files it rewrote.
 */
export function fixProject(project: string, maxRounds = 5): string[] {
  const changed = new Set<string>();
  for (let round = 0; round < maxRounds; round++) {
    const { diagnostics, configErrors } = analyzeProject(project);
    if (configErrors.length) break;
    const fixes = diagnostics.flatMap((d) => d.fixes?.[0] ?? []);
    const texts = new Map<string, string>();
    for (const fix of fixes) for (const e of fix.edits) if (!texts.has(e.file)) texts.set(e.file, readFileSync(e.file, "utf8"));
    const next = applyEdits(texts, fixes);
    if (!next.size) break;
    for (const [file, text] of next) {
      writeFileSync(file, text);
      changed.add(file);
    }
  }
  return [...changed];
}
