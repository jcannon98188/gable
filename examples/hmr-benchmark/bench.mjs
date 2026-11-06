// HMR latency and state-retention benchmark. See README.md.
//
//   node bench.mjs [--sizes 500,2000] [--iterations 10] [--browser chrome|msedge|chromium] [--headed] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { gable } from "@gable/vite";
import { EDITS, generateApp } from "./gen.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const sizes = opt("sizes", "500,2000").split(",").map(Number);
const iterations = Number(opt("iterations", "10"));
const browserName = opt("browser", "auto");
const jsonOut = opt("json", "");
const headed = args.includes("--headed");
const TIMEOUT_MS = 20000;
const SETTLE_MS = 150;
const EXPECTED = { clicks: 3, bumps: 2, draft: "keep-me" };
// The store is shared, so each target's setup adds its bumps to the running total.
let storeValue = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
  return s.length ? { median: at(50), p95: at(95), min: s[0], max: s[s.length - 1] } : {};
};

async function launch() {
  const order = browserName === "auto" ? ["chrome", "msedge", "chromium"] : [browserName];
  for (const name of order) {
    try {
      const browser = await chromium.launch({ headless: !headed, ...(name === "chromium" ? {} : { channel: name }) });
      return { browser, name };
    } catch (error) {
      if (browserName !== "auto") throw error;
    }
  }
  throw new Error("No browser found. Install Chrome or Edge, or run `npx playwright install chromium` and pass --browser chromium.");
}

/** Page-side helper: resolves with the page's Date.now() once `ready(el, k)` holds for the probe element. */
const installWaiter = () => {
  window.__waitFor = (selector, readySource, k, driveSelector) =>
    new Promise((resolve) => {
      const ready = new Function("return (" + readySource + ")")();
      let raf = 0;
      const observer = new MutationObserver(() => check());
      const stop = () => {
        observer.disconnect();
        cancelAnimationFrame(raf);
        clearTimeout(raf);
      };
      const check = () => {
        const el = document.querySelector(selector);
        if (el && ready(el, k)) {
          stop();
          resolve(Date.now());
          return true;
        }
        return false;
      };
      observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
      const poll = () => {
        if (driveSelector) {
          document.querySelector(driveSelector)?.click();
          if (!check()) raf = setTimeout(poll, 0);
        } else if (!check()) raf = requestAnimationFrame(poll);
      };
      poll();
    });
};

async function runSize(n, browser, browserLabel) {
  const root = join(here, ".work", `n${n}`);
  const targets = generateApp(root, n);
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    plugins: [gable()],
    server: { host: "127.0.0.1", port: 5400, strictPort: false, hmr: { overlay: false } },
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const context = await browser.newContext();
  await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  const page = await context.newPage();
  const problems = [];
  let navigations = 0;
  page.on("framenavigated", (frame) => frame === page.mainFrame() && navigations++);
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text().slice(0, 200)}`));
  await page.addInitScript(installWaiter);

  const t0 = Date.now();
  await page.goto(url);
  await page.waitForSelector("#app .probe-text", { timeout: 15000 }).catch(async (e) => { console.log(await page.content().then((c) => c.slice(0, 1500)), problems); throw e; });
  const rendered = await page.evaluate(() => document.querySelectorAll(".node").length);
  const loadMs = Date.now() - t0;
  if (rendered !== n) throw new Error(`expected ${n} rendered components, found ${rendered}`);
  console.log(`\n=== N=${n}: ${rendered} components rendered in ${loadMs} ms (${browserLabel}, ${url}) ===`);

  storeValue = 0;
  const results = [];
  for (const [targetName, index] of Object.entries(targets)) {
    const prefix = `app-c${index} > .node > `;
    // Let Vite's dependency optimizer and late module loads settle before recording the page identity.
    await sleep(1000);
    const setup = async () => {
      await page.waitForSelector(`${prefix}.probe-text`);
      await page.locator(`${prefix}.draft`).fill(EXPECTED.draft);
      for (let i = 0; i < EXPECTED.clicks; i++) await page.locator(`${prefix}.inc`).click();
      for (let i = 0; i < EXPECTED.bumps; i++) await page.locator(`${prefix}.bump`).click();
      storeValue += EXPECTED.bumps;
      return page.evaluate(() => ({ id: window.__bench.id }));
    };
    let identity = await setup();
    let counter = 0;

    for (const [kind, spec] of Object.entries(EDITS)) {
      const file = join(root, "src", spec.file(index));
      const times = [];
      const fails = { timeout: 0, reload: 0, counter: 0, draft: 0, service: 0 };
      for (let it = -1; it < iterations; it++) {
        const k = ++counter; // it === -1 is an unmeasured warm-up
        const waiting = page.evaluate(([sel, src, mark, drive]) => window.__waitFor(sel, src, mark, drive), [prefix + spec.probe, spec.ready.toString(), k, spec.drive ? prefix + spec.drive : null]);
        const guarded = Promise.race([waiting, sleep(TIMEOUT_MS).then(() => null)]);
        const before = navigations;
        const start = Date.now();
        writeFileSync(file, spec.edit(readFileSync(file, "utf8"), k));
        const done = await guarded.catch(() => null);
        if (done === null) fails.timeout++;
        else if (it >= 0) times.push(done - start);
        await sleep(SETTLE_MS);

        const currentId = await page.evaluate(() => window.__bench?.id).catch(() => undefined);
        if (navigations !== before || currentId !== identity.id) {
          fails.reload++;
          fails.counter++;
          fails.draft++;
          fails.service++;
          await sleep(1000);
          storeValue = 0; // the reload re-created the store
          identity = await setup();
          continue;
        }
        const state = await page.evaluate((p) => ({
          counter: document.querySelector(p + ".probe-field")?.textContent.split(":")[1],
          draft: document.querySelector(p + ".draft")?.value,
          service: document.querySelector(p + ".probe-store")?.textContent.split(":")[1],
        }), prefix);
        if (state.counter !== String(EXPECTED.clicks)) fails.counter++;
        if (state.draft !== EXPECTED.draft) fails.draft++;
        if (state.service !== String(storeValue)) fails.service++;
      }
      const row = { n, target: targetName, kind, ...stats(times), samples: times.length, fails };
      results.push(row);
      const failText = Object.entries(fails).filter(([, v]) => v).map(([key, v]) => `${key} x${v}`).join(", ");
      console.log(`  ${targetName.padEnd(5)} ${kind.padEnd(13)} median ${String(row.median ?? "-").padStart(5)} ms  p95 ${String(row.p95 ?? "-").padStart(5)} ms  ${failText ? "FAILED: " + failText : "state kept"}`);
    }
  }
  const unique = [...new Set(problems)];
  if (unique.length) console.log(`  browser messages (${problems.length}, ${unique.length} unique):\n    ${unique.slice(0, 8).join("\n    ")}`);
  await context.close();
  await server.close();
  return { results, loadMs, messages: unique };
}

const { browser, name } = await launch();
const label = `${name} ${browser.version()}${headed ? "" : " headless"}`;
const all = [];
try {
  for (const n of sizes) all.push({ n, ...(await runSize(n, browser, label)) });
} finally {
  await browser.close();
}

console.log(`\n## Edit-to-DOM-updated latency (ms), ${iterations} iterations per row, ${label}\n`);
console.log("| components | target | edit | median | p95 | min | max | state kept |");
console.log("| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |");
for (const { results } of all) {
  for (const r of results) {
    const failed = Object.entries(r.fails).filter(([, v]) => v);
    const kept = failed.length ? "NO: " + failed.map(([key, v]) => `${key} x${v}`).join(", ") : "yes";
    console.log(`| ${r.n} | ${r.target} | ${r.kind} | ${r.median ?? "-"} | ${r.p95 ?? "-"} | ${r.min ?? "-"} | ${r.max ?? "-"} | ${kept} |`);
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ browser: label, iterations, sizes: all }, null, 2));
process.exit(all.some(({ results }) => results.some((r) => Object.values(r.fails).some(Boolean))) ? 1 : 0);
