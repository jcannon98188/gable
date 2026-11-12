// CPU profile of the benchmark page through CDP `Profiler`, on the unminified build (PROFILE=1 vite build --outDir dist-profile).
//
//   PROFILE=1 npx vite build ; npx vite preview --outDir dist-profile --port 5292 --strictPort
//   node driver/profile.mjs --base http://localhost:5292 --n 5000 --style signals --out results/profile-signals-5000.json
//
// Output: self-time per function (ms and share of all sampled time), grouped by source file; the profile covers mount + warm-up + the measured frames.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { launch } from "./common.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const base = args.base ?? "http://localhost:5292";
const n = Number(args.n ?? 5000);
const style = args.style ?? "signals";
const out = args.out ?? `results/profile-${style}-${n}.json`;

const browser = await launch(args.gpu ?? "d3d11");
const page = await browser.newPage({ viewport: { width: 820, height: 620 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await page.goto(`${base}/bench.html?style=${style}&n=${n}&warm=120&frames=600&finish=0&idle=1`).catch(() => {});
await cdp.send("Profiler.start");
await page.waitForFunction(() => globalThis.__result, null, { timeout: 240000, polling: 250 });
const { profile } = await cdp.send("Profiler.stop");
const result = await page.evaluate(() => globalThis.__result);
await browser.close();

const nodes = new Map(profile.nodes.map((nd) => [nd.id, nd]));
const self = new Map();
const dts = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) self.set(profile.samples[i], (self.get(profile.samples[i]) ?? 0) + (dts[i] ?? 0));
for (const [id] of self) if (nodes.get(id).callFrame.functionName === "(idle)") self.delete(id); // rAF wait is not work
const total = [...self.values()].reduce((a, b) => a + b, 0);
const byFn = new Map();
for (const [id, us] of self) {
  const cf = nodes.get(id).callFrame;
  const file = cf.url.split("/").slice(-2).join("/") || "(native)";
  const key = `${cf.functionName || "(anonymous)"} @ ${file}:${cf.lineNumber + 1}`;
  byFn.set(key, (byFn.get(key) ?? 0) + us);
}
const top = [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([fn, us]) => ({ fn, selfMs: +(us / 1000).toFixed(1), pct: +((us / total) * 100).toFixed(2) }));
const gable = [...byFn].filter(([k]) => /@ .*(core|signal|renderer|pixi-renderer|bench-entities|frame)/i.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([fn, us]) => ({ fn, selfMs: +(us / 1000).toFixed(1), pct: +((us / total) * 100).toFixed(2) }));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ n, style, totalSampledMs: +(total / 1000).toFixed(0), top, gable, result }, null, 1));
console.log("sampled", (total / 1000).toFixed(0), "ms");
for (const r of top.slice(0, 25)) console.log(`${String(r.pct).padStart(6)}%  ${String(r.selfMs).padStart(8)} ms  ${r.fn}`);
console.log("wrote", out);
