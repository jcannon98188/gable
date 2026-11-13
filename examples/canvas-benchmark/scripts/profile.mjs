// CPU-profiles one benchmark configuration in headless Chromium and prints where the frame's flush phase spends its time.
//
//   node scripts/profile.mjs --style signals --n 5000 --frames 300 --warm 60 --out results/profile.cpuprofile
//   options: --root flushSync   only samples with this function on the stack are counted (default flushSync: the frame's flush)
//            --top 25           rows printed          --interval 100   sampling interval in microseconds
//            --gpu, --src and GABLE_BROWSER as in run.mjs
//
// The page is built unminified so the profile carries real function names; absolute times are therefore not comparable
// with run.mjs (which measures the minified build). Use this for attribution and run.mjs for the numbers.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { platform } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith("--")) continue;
  const next = process.argv[i + 1];
  args[process.argv[i].slice(2)] = next === undefined || next.startsWith("--") ? true : (i++, next);
}
const style = String(args.style ?? "signals");
const n = Number(args.n ?? 5000);
const frames = Number(args.frames ?? 300);
const warm = Number(args.warm ?? 60);
const top = Number(args.top ?? 25);
const rootFn = String(args.root ?? "flushSync");
const gpu = String(args.gpu ?? "swiftshader");
const out = resolve(args.out ?? join(here, "results", `profile-${style}-${n}.cpuprofile`));
const GPU_ARGS = {
  swiftshader: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  default: [],
  real: ["--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-sandbox", ...(platform() === "win32" ? ["--use-angle=d3d11"] : [])],
};

function browserPath() {
  if (process.env.GABLE_BROWSER) return process.env.GABLE_BROWSER;
  if (existsSync(chromium.executablePath())) return undefined;
  const found = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => existsSync(p));
  if (!found) throw new Error("No Chromium found: run `npx playwright install chromium` or set GABLE_BROWSER.");
  return found;
}

const dist = join(here, ".bench-dist-profile");
process.env.GABLE_BENCH_OUT = dist;
process.env.GABLE_BENCH_MINIFY = "0";
if (args.src) process.env.GABLE_SRC = resolve(String(args.src));
await build({ root: here, configFile: join(here, "vite.config.ts"), logLevel: "warn" });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  const file = join(dist, path === "/" ? "index.html" : path);
  if (!file.startsWith(dist) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const browser = await chromium.launch({ headless: true, executablePath: browserPath(), args: GPU_ARGS[gpu] });
const page = await browser.newPage({ viewport: { width: 820, height: 620 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: Number(args.interval ?? 100) });
await cdp.send("Profiler.start");
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?style=${style}&n=${n}&warm=${warm}&frames=${frames}`);
await page.waitForFunction(() => globalThis.__result, null, { timeout: Number(args.timeout ?? 240000), polling: 250 });
const result = await page.evaluate(() => globalThis.__result);
const { profile } = await cdp.send("Profiler.stop");
await browser.close();
server.close();

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(profile));

// Self time per function, over the samples that have `rootFn` on their stack.
const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
const underRoot = new Map();
const isUnder = (id) => {
  if (underRoot.has(id)) return underRoot.get(id);
  let v = false;
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    if (byId.get(cur).callFrame.functionName === rootFn) {
      v = true;
      break;
    }
  }
  underRoot.set(id, v);
  return v;
};
const self = new Map();
let total = 0;
let all = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const dt = profile.timeDeltas[i] ?? 0;
  all += dt;
  const id = profile.samples[i];
  if (!isUnder(id)) continue;
  total += dt;
  const f = byId.get(id).callFrame;
  const key = `${f.functionName || "(anonymous)"}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + dt);
}
console.log(`${style} n=${n}: flush p50=${result.flushMs.p50.toFixed(2)} ms (unminified build)`);
console.log(`samples under ${rootFn}: ${(total / 1000).toFixed(0)} ms of ${(all / 1000).toFixed(0)} ms profiled`);
for (const [key, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, top)) {
  console.log(`${((us / total) * 100).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(6)} ms  ${key}`);
}
console.log("wrote", out);
