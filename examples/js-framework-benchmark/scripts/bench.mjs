// Builds the app, serves it with `vite preview`, drives it in a real browser (Playwright) and prints median timings
// for the js-framework-benchmark operations.
//
//   node scripts/bench.mjs [--iterations N] [--only name,name] [--no-build] [--port P] [--headed]
//
// Browser: $CHROME_PATH if set, else installed Chrome, else installed Edge (no browser download needed).
//
// What is measured: from the click on the benchmark button (the click itself is dispatched in the page, so
// the click handler and the synchronous rendering are included) until the next frame has been painted (a
// requestAnimationFrame callback plus a message-channel hop). That is quantized to the frame interval (about 16 ms),
// so paint differences below that are noise; the "script" column is the synchronous click handling alone.
// This approximates krausest's click-to-paint metric but is not its Chrome-trace based one: compare relative
// numbers between runs, not against the official results page.
// Each iteration uses a fresh page, as the upstream runner does, so JIT warmup is part of the number.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const iterations = Number(option('iterations', 10));
const port = Number(option('port', 4173));
const only = option('only', '')?.split(',').filter(Boolean);
const url = `http://127.0.0.1:${port}/`;

// Each benchmark (verify runs inside the page, so it must be self-contained): `setup` clicks run before measuring (on a fresh page), `action` is measured,
// `verify` throws if the page does not show the expected result.
const benchmarks = [
  { name: 'create 1,000 rows', setup: [], action: '#run', verify: () => document.querySelectorAll('#tbody tr').length === 1000 },
  { name: 'replace 1,000 rows', setup: ['#run'], action: '#run', verify: () => document.querySelectorAll('#tbody tr').length === 1000 },
  {
    name: 'update every 10th row',
    setup: ['#run'],
    action: '#update',
    verify: () => document.querySelectorAll('#tbody tr:nth-child(10n+1) td:nth-child(2) a').length === 100 &&
      [...document.querySelectorAll('#tbody tr:nth-child(10n+1) td:nth-child(2) a')].every((a) => a.textContent.endsWith(' !!!')),
  },
  {
    name: 'select row',
    setup: ['#run'],
    action: '#tbody tr:nth-child(2) td:nth-child(2) a',
    verify: () => document.querySelectorAll('#tbody tr.danger').length === 1 && document.querySelector('#tbody tr:nth-child(2)').classList.contains('danger'),
  },
  {
    name: 'swap rows',
    setup: ['#run'],
    action: '#swaprows',
    verify: () => Number(document.querySelector('#tbody tr:nth-child(2) td:nth-child(1)').textContent) === 999 &&
      Number(document.querySelector('#tbody tr:nth-child(999) td:nth-child(1)').textContent) === 2,
  },
  {
    name: 'remove row',
    setup: ['#run'],
    action: '#tbody tr:nth-child(4) td:nth-child(3) a',
    verify: () => document.querySelectorAll('#tbody tr').length === 999 && Number(document.querySelector('#tbody tr:nth-child(4) td:nth-child(1)').textContent) === 5,
  },
  { name: 'create 10,000 rows', setup: [], action: '#runlots', verify: () => document.querySelectorAll('#tbody tr').length === 10000 },
  { name: 'append 1,000 rows', setup: ['#run'], action: '#add', verify: () => document.querySelectorAll('#tbody tr').length === 2000 },
  { name: 'clear 1,000 rows', setup: ['#run'], action: '#clear', verify: () => document.querySelectorAll('#tbody tr').length === 0 },
];

/** Click  in the page; resolve with { script, paint }: ms until the click returned, and until the next paint. */
async function timedClick(page, selector) {
  return page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error();
    const start = performance.now();
    el.click();
    const script = performance.now() - start;
    await new Promise((done) => requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = done;
      channel.port2.postMessage(null);
    }));
    return { script, paint: performance.now() - start };
  }, selector);
}

async function settle(page) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

async function startPreview() {
  const viteBin = join(dirname(createRequire(join(appDir, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js');
  const run = (cmdArgs) => new Promise((ok, fail) => {
    const child = spawn(process.execPath, [viteBin, ...cmdArgs], { cwd: appDir, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`vite ${cmdArgs[0]} exited with ${code}`))));
  });
  if (!args.includes('--no-build')) await run(['build']);
  const server = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: appDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return server;
    } catch {
      await sleep(100);
    }
  }
  server.kill();
  throw new Error(`vite preview did not come up on ${url}`);
}

async function launch() {
  const headless = !args.includes('--headed');
  const attempts = process.env.CHROME_PATH
    ? [{ executablePath: process.env.CHROME_PATH }]
    : [{ channel: 'chrome' }, { channel: 'msedge' }];
  let lastError;
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ headless, ...attempt });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`No browser found (set CHROME_PATH to a Chrome/Edge executable): ${lastError?.message}`);
}

const server = await startPreview();
let browser;
try {
  browser = await launch();
  console.log(`Gable js-framework-benchmark: ${browser.version()}, ${iterations} iterations, median of fresh-page runs\n`);
  const results = [];
  for (const bench of benchmarks) {
    if (only?.length && !only.some((o) => bench.name.includes(o))) continue;
    const samples = [];
    for (let i = 0; i < iterations; i++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForSelector('#run');
      for (const sel of bench.setup) {
        await timedClick(page, sel);
        await settle(page);
      }
      if (bench.name.startsWith('replace')) await settle(page);
      samples.push(await timedClick(page, bench.action));
      await settle(page);
      if (!(await page.evaluate(bench.verify))) throw new Error(`"${bench.name}": the page does not show the expected result`);
      if (errors.length) throw new Error(`"${bench.name}": page error: ${errors[0]}`);
      await context.close();
    }
    results.push({ name: bench.name, script: median(samples.map((x) => x.script)), median: median(samples.map((x) => x.paint)), min: Math.min(...samples.map((x) => x.paint)), max: Math.max(...samples.map((x) => x.paint)) });
  }
  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`${'operation'.padEnd(width)}  ${'script'.padStart(9)}  ${'paint'.padStart(9)}  ${'min'.padStart(9)}  ${'max'.padStart(9)}`);
  console.log(`${''.padEnd(width)}  ${'(median)'.padStart(9)}  ${'(median)'.padStart(9)}  ${'(paint)'.padStart(9)}  ${'(paint)'.padStart(9)}`);
  for (const r of results) {
    console.log(`${r.name.padEnd(width)}  ${r.script.toFixed(1).padStart(7)}ms  ${r.median.toFixed(1).padStart(7)}ms  ${r.min.toFixed(1).padStart(7)}ms  ${r.max.toFixed(1).padStart(7)}ms`);
  }
} finally {
  await browser?.close();
  server.kill();
}
