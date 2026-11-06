// Gable reactivity benchmark. Usage: node src/bench.mjs [--filter text] [--samples n] [--warmup n] [--scale x] [--json] [--quick]
import { measure, renderTable } from "./harness.mjs";
import { scenarios } from "./scenarios.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const quick = flag("quick");
const options = {
  samples: Number(value("samples", quick ? 5 : 21)),
  warmup: Number(value("warmup", quick ? 1 : 3)),
};
const scale = Number(value("scale", quick ? 0.1 : 1));
const filter = value("filter", "");
const json = flag("json");
const log = json ? () => {} : (...a) => console.log(...a);

const rows = [];
for (const scenario of scenarios(scale)) {
  if (filter && !`${scenario.id} ${scenario.title}`.toLowerCase().includes(filter.toLowerCase())) continue;
  log(`${scenario.id}: ${scenario.title}`);
  let gable;
  for (const [impl, variant] of Object.entries(scenario.variants)) {
    const result = await measure(variant, options);
    if (impl.startsWith("gable") && gable === undefined) gable = result.median;
    rows.push({ scenario: scenario.id, impl, ...result, ops: variant.ops ?? scenario.ops, ratio: undefined, _gable: gable });
  }
  for (const row of rows) if (row.scenario === scenario.id) row.ratio = row._gable ? row.median / row._gable : undefined;
}
for (const row of rows) delete row._gable;

if (json) {
  console.log(JSON.stringify({ node: process.version, scale, ...options, results: rows }, null, 2));
} else {
  log(`\nnode ${process.version}, scale ${scale}, ${options.samples} samples after ${options.warmup} warmup runs. "ns/op" = median / operations per run.\n`);
  log(renderTable(rows));
}
