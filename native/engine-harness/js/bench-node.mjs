// Node reference for one benchmark of a bundle; prints the same JSON line
// as `gable-harness bench`.
//   node bench-node.mjs <bundle.mjs> <name> <warmup> <iterations>
import { pathToFileURL } from "node:url";

const [file, name, warmup, iterations] = process.argv.slice(2);
const ns = await import(pathToFileURL(file).href);
const b = ns.benchmarks[name];
if (!b) throw new Error(`no benchmark ${name}`);
const state = b.setup ? await b.setup() : undefined;
const samples = [];
let checksum = "";
for (let i = 0; i < Number(warmup) + Number(iterations); i++) {
  const t = process.hrtime.bigint();
  checksum = String(await b.run(state));
  const ns = Number(process.hrtime.bigint() - t);
  if (i >= Number(warmup)) samples.push(ns);
}
console.log(JSON.stringify({ engine: "node", name, samples_ns: samples, checksum, heap_bytes: process.memoryUsage().heapUsed, peak_rss_bytes: process.resourceUsage().maxRSS * 1024 }));
