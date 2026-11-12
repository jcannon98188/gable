// Runs the benchmark page in Chromium and writes raw results as JSON.
//
//   node driver/bench.mjs --gpu d3d11 --out results/d3d11-capped.json
//   options: --base http://localhost:5291   (vite preview of the production build; dev server also works)
//            --gpu default|swiftshader|d3d11   --uncapped   --finish   --reps 3   --frames 600 --warm 120
//            --styles signals,pose,ref   --counts 500,1000,2000,3000,5000,10000   --particles 10000,20000,50000,100000
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { UNCAPPED, launch } from "./common.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []),
);
const base = args.base ?? "http://localhost:5291";
const gpu = args.gpu ?? "d3d11";
const reps = Number(args.reps ?? 3);
const frames = Number(args.frames ?? 600);
const warm = Number(args.warm ?? 120);
const list = (v, d) => (v === undefined ? d : String(v) === "" ? [] : String(v).split(",").map(Number));
const styles = (args.styles ?? "signals,pose,ref").split(",").filter(Boolean);
const counts = list(args.counts, [500, 1000, 2000, 3000, 5000, 10000]);
const particles = list(args.particles, [10000, 20000, 50000, 100000]);
const out = args.out ?? `results/${gpu}${args.uncapped ? "-uncapped" : "-capped"}${args.finish ? "-finish" : ""}.json`;
const timeoutMs = Number(args.timeout ?? 240000);

const configs = [];
for (let rep = 0; rep < reps; rep++) {
  for (const style of styles) for (const n of counts) configs.push({ style, n, rep });
  if (args.styles === undefined || String(args.styles).includes("particles")) for (const n of particles) configs.push({ style: "particles", n, rep });
}
const jobs = configs.filter((c) => !(c.style === "particles" && !particles.length));

const browser = await launch(gpu, args.uncapped ? UNCAPPED : []);
const results = [];
for (const [idx, c] of jobs.entries()) {
  const page = await browser.newPage({ viewport: { width: 820, height: 620 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = `${base}/bench.html?style=${c.style}&n=${c.n}&warm=${warm}&frames=${frames}&finish=${args.finish ? 1 : 0}`;
  await page.goto(url);
  let r = null;
  try {
    await page.waitForFunction(() => globalThis.__result, null, { timeout: timeoutMs, polling: 250 });
    r = await page.evaluate(() => globalThis.__result);
  } catch (e) {
    errors.push(`timeout/${e.message.split("\n")[0]}`);
  }
  await page.close();
  const row = { ...c, gpu, uncapped: !!args.uncapped, finish: !!args.finish, errors, result: r };
  results.push(row);
  const j = r?.jsTotalMs;
  console.log(
    `[${idx + 1}/${jobs.length}] rep${c.rep} ${c.style.padEnd(9)} n=${String(c.n).padStart(6)}  js p50=${j?.p50.toFixed(2)} p95=${j?.p95.toFixed(2)}  frame p50=${r?.frameMs.p50.toFixed(1)} p99=${r?.frameMs.p99.toFixed(1)} dropped=${r?.dropped} ${errors.length ? "ERR " + errors[0] : ""}`,
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ args, results }, null, 1));
}
await browser.close();
console.log("wrote", out);
