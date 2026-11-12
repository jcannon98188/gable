// Builds the benchmark page, serves it, runs it in headless Chromium for every (style, entity count) and writes raw results.
//
//   node scripts/run.mjs --out results/head.json
//   options: --gpu swiftshader|default|real   swiftshader (default) is software GL, what CI uses; real asks for the machine's GPU
//            --styles signals,shared,ref,particles   --counts 500,1000,2000,5000   --particles 10000,50000
//            --reps 3   --frames 300   --warm 60   --uncapped   --src <repo root>   --timeout 240000
//   env:     GABLE_BROWSER=<path to chrome/edge/chromium>   GABLE_SRC=<repo root whose packages/ are benchmarked>
//
// --src builds the same page against another checkout's packages: the CI gate uses it to measure the base commit on the
// same runner. `--gpu real` is for the reference machine; its default output is results/real-gpu.json, which is committed
// before each release (see README.md). Software-GL numbers are never an absolute budget.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { cpus, hostname, platform, release, totalmem } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const gpu = String(args.gpu ?? "swiftshader");
const reps = Number(args.reps ?? 3);
const frames = Number(args.frames ?? 300);
const warm = Number(args.warm ?? 60);
const timeoutMs = Number(args.timeout ?? 240000);
const list = (v, d) => (v === undefined ? d : String(v) === "" ? [] : String(v).split(",").map(Number));
const styles = String(args.styles ?? "signals,shared,ref").split(",").filter(Boolean);
const counts = list(args.counts, [500, 1000, 2000, 5000]);
const particles = styles.includes("particles") ? list(args.particles, [10000, 50000]) : [];
const out = resolve(args.out ?? join(here, "results", gpu === "real" ? "real-gpu.json" : `${gpu}.json`));
const src = args.src ?? process.env.GABLE_SRC;

const GPU_ARGS = {
  swiftshader: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  default: [],
  real: ["--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-sandbox", ...(platform() === "win32" ? ["--use-angle=d3d11"] : [])],
};
if (!GPU_ARGS[gpu]) throw new Error(`unknown --gpu ${gpu}`);

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    o[argv[i].slice(2)] = next === undefined || next.startsWith("--") ? true : (i++, next);
  }
  return o;
}

function browserPath() {
  if (process.env.GABLE_BROWSER) return process.env.GABLE_BROWSER;
  if (existsSync(chromium.executablePath())) return undefined; // Playwright's own, installed with `npx playwright install chromium`
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

// Build the page (packages resolve from source through vite.config.ts) into a private directory.
const dist = join(here, ".bench-dist");
process.env.GABLE_BENCH_OUT = dist;
if (src) process.env.GABLE_SRC = resolve(src);
await build({ root: here, configFile: join(here, "vite.config.ts"), logLevel: "warn" });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  const file = join(dist, path === "/" ? "index.html" : path);
  if (!file.startsWith(dist) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const configs = [];
for (let rep = 0; rep < reps; rep++) {
  for (const style of styles.filter((s) => s !== "particles")) for (const n of counts) configs.push({ style, n, rep });
  for (const n of particles) configs.push({ style: "particles", n, rep });
}

const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath(),
  args: [...GPU_ARGS[gpu], ...(args.uncapped ? ["--disable-frame-rate-limit", "--disable-gpu-vsync"] : [])],
});
const results = [];
let glRenderer = "unknown";
for (const [idx, c] of configs.entries()) {
  const page = await browser.newPage({ viewport: { width: 820, height: 620 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/index.html?style=${c.style}&n=${c.n}&warm=${warm}&frames=${frames}`);
  let result = null;
  try {
    await page.waitForFunction(() => globalThis.__result, null, { timeout: timeoutMs, polling: 250 });
    result = await page.evaluate(() => globalThis.__result);
    glRenderer = result.gl;
  } catch (e) {
    errors.push(`timeout: ${String(e.message).split("\n")[0]}`);
  }
  await page.close();
  results.push({ ...c, errors, result });
  console.log(
    `[${idx + 1}/${configs.length}] rep${c.rep} ${c.style.padEnd(9)} n=${String(c.n).padStart(6)}  hooks=${result?.hooksMs.p50.toFixed(2)} flush=${result?.flushMs.p50.toFixed(2)} render=${result?.renderMs.p50.toFixed(2)} js=${result?.jsTotalMs.p50.toFixed(2)} ms (p50)  frame p99=${result?.frameMs.p99.toFixed(1)} dropped=${result?.dropped} ${errors.length ? "ERR " + errors[0] : ""}`,
  );
}
await browser.close();
server.close();

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      meta: { date: new Date().toISOString(), gpuMode: gpu, glRenderer, host: hostname(), os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, memGB: Math.round(totalmem() / 2 ** 30), browser: browserPath() ?? "playwright chromium", frames, warm, reps },
      results,
    },
    null,
    1,
  ),
);
console.log("wrote", out);
process.exit(results.some((r) => !r.result) ? 1 : 0);
