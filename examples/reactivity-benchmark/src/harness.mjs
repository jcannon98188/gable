// Timing harness: each variant is `setup() => { run, dispose? }`; only `run()` is timed, over a steady-state graph.
import { performance } from "node:perf_hooks";

export function assert(cond, message) {
  if (!cond) throw new Error(`benchmark check failed: ${message}`);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Times one variant: `warmup` untimed runs, then `samples` timed runs (each `run()` is one sample, awaited). */
export async function measure(variant, { samples, warmup }) {
  const instance = variant.setup();
  try {
    for (let i = 0; i < warmup; i++) await instance.run();
    const times = [];
    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      await instance.run();
      times.push(performance.now() - start);
    }
    return { median: median(times), min: Math.min(...times), max: Math.max(...times) };
  } finally {
    instance.dispose?.();
  }
}

const fmt = (ms) => (ms >= 100 ? ms.toFixed(1) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(3));

export function renderTable(rows) {
  const header = ["scenario", "impl", "median ms", "min ms", "ns/op", "x gable"];
  const body = rows.map((r) => [
    r.scenario,
    r.impl,
    fmt(r.median),
    fmt(r.min),
    r.ops ? Math.round((r.median * 1e6) / r.ops).toString() : "-",
    r.ratio === undefined ? "-" : r.ratio.toFixed(2),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => cells.map((c, i) => (i < 2 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  const out = [line(header), widths.map((w) => "-".repeat(w)).join("  ")];
  let last = "";
  for (const b of body) {
    if (last && b[0] !== last) out.push("");
    last = b[0];
    out.push(line(b));
  }
  return out.join("\n");
}
