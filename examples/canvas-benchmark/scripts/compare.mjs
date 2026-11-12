// The CI regression gate: compares two result files measured on the SAME runner and fails when a JS-side phase
// (hooks, flush, render or their total) is more than 15 percent worse. Absolute numbers are never gated.
//
//   node scripts/compare.mjs baseline.json head.json [--threshold 0.15] [--floor-ms 0.1]
//
// Per configuration (style and entity count) the value compared is the median, across repetitions, of each run's p50.
// A change smaller than the floor (default 0.1 ms) is noise and never fails, however large it is relatively.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PHASES = ["hooksMs", "flushMs", "renderMs", "jsTotalMs"];
export const DEFAULT_THRESHOLD = 0.15;
export const DEFAULT_FLOOR_MS = 0.1;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Map of "style/n" to the median p50 of each phase. Runs that errored are skipped. */
export function aggregate(file) {
  const groups = new Map();
  for (const r of file.results) {
    if (!r.result) continue;
    const key = `${r.style}/${r.n}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r.result);
  }
  const out = new Map();
  for (const [key, runs] of groups) out.set(key, Object.fromEntries(PHASES.map((p) => [p, median(runs.map((r) => r[p].p50))])));
  return out;
}

export function compare(baseline, head, { threshold = DEFAULT_THRESHOLD, floorMs = DEFAULT_FLOOR_MS } = {}) {
  const base = aggregate(baseline);
  const now = aggregate(head);
  const regressions = [];
  const rows = [];
  const unmatched = [];
  const failures = head.results.filter((r) => !r.result).map((r) => `${r.style}/${r.n} rep${r.rep}: ${(r.errors ?? []).join("; ") || "no result"}`);
  for (const [config, phases] of now) {
    const reference = base.get(config);
    if (!reference) {
      unmatched.push(config);
      continue;
    }
    for (const phase of PHASES) {
      const before = reference[phase];
      const after = phases[phase];
      const ratio = before > 0 ? after / before : Number.POSITIVE_INFINITY;
      const regressed = after > before * (1 + threshold) && after - before > floorMs;
      rows.push({ config, phase, before, after, ratio, regressed });
      if (regressed) regressions.push({ config, phase, before, after, ratio });
    }
  }
  return { regressions, failures, unmatched, rows };
}

export function report({ regressions, failures, unmatched, rows }, threshold = DEFAULT_THRESHOLD) {
  const lines = ["config            phase       baseline    head     change"];
  for (const r of rows) {
    const change = Number.isFinite(r.ratio) ? `${((r.ratio - 1) * 100).toFixed(1)}%` : "n/a";
    lines.push(`${r.config.padEnd(17)} ${r.phase.padEnd(11)} ${r.before.toFixed(3).padStart(8)}  ${r.after.toFixed(3).padStart(8)}  ${change.padStart(7)}${r.regressed ? "  REGRESSION" : ""}`);
  }
  if (unmatched.length) lines.push(`not in the baseline (not gated): ${unmatched.join(", ")}`);
  for (const f of failures) lines.push(`FAILED RUN ${f}`);
  lines.push(regressions.length || failures.length ? `FAIL: ${regressions.length} phase(s) more than ${threshold * 100}% worse, ${failures.length} failed run(s)` : `OK: no JS-side phase is more than ${threshold * 100}% worse than the baseline`);
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, d) => {
    const i = args.indexOf(`--${name}`);
    return i < 0 ? d : Number(args.splice(i, 2)[1]);
  };
  const threshold = opt("threshold", DEFAULT_THRESHOLD);
  const floorMs = opt("floor-ms", DEFAULT_FLOOR_MS);
  const [basePath, headPath] = args;
  if (!basePath || !headPath) {
    console.error("usage: node scripts/compare.mjs baseline.json head.json [--threshold 0.15] [--floor-ms 0.1]");
    process.exit(2);
  }
  const outcome = compare(JSON.parse(readFileSync(basePath, "utf8")), JSON.parse(readFileSync(headPath, "utf8")), { threshold, floorMs });
  console.log(report(outcome, threshold));
  process.exit(outcome.regressions.length || outcome.failures.length ? 1 : 0);
}
