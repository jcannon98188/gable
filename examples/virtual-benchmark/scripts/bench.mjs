// Compares rendering N rows as plain `@for` nodes against the virtual scroll primitive (`useVirtualizer`), in a real
// browser. The rows are the js-framework-benchmark rows case (same data, same row component).
//
//   node scripts/bench.mjs [--iterations N] [--no-build] [--port P] [--only create,scroll] [--max-plain 100000]
//
// Needs the vite and playwright-core of ../js-framework-benchmark (run `npm install` there once) and an installed
// Chrome or Edge ($CHROME_PATH overrides). Timing is click (or scroll assignment) to next paint, quantized to ~16.7 ms.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = resolve(appDir, '..', 'js-framework-benchmark');
const require = createRequire(join(toolsDir, 'package.json'));
const { chromium } = require('playwright-core');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const iterations = Number(option('iterations', 7));
const port = Number(option('port', 4174));
const only = option('only', '').split(',').filter(Boolean);
const maxPlain = Number(option('max-plain', 100_000));
const url = (mode) => `http://127.0.0.1:${port}/?mode=${mode}`;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function timed(page, action) {
  return page.evaluate(async ([kind, arg]) => {
    const nextPaint = () =>
      new Promise((done) =>
        requestAnimationFrame(() => {
          const c = new MessageChannel();
          c.port1.onmessage = done;
          c.port2.postMessage(null);
        }),
      );
    const start = performance.now();
    if (kind === 'click') document.querySelector(arg).click();
    else if (kind === 'scroll') document.querySelector('#viewport').scrollTop = arg;
    const script = performance.now() - start;
    await nextPaint();
    return { script, paint: performance.now() - start };
  }, action);
}
const settle = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

/** Scrolls 10 rows per frame for 60 frames and reports the median frame-to-frame time. */
const sweep = (page) =>
  page.evaluate(async () => {
    const viewport = document.querySelector('#viewport');
    const frames = [];
    let last = performance.now();
    for (let i = 0; i < 60; i++) {
      viewport.scrollTop += 380;
      await new Promise((done) => requestAnimationFrame(done));
      const now = performance.now();
      frames.push(now - last);
      last = now;
    }
    frames.sort((a, b) => a - b);
    return { script: 0, paint: frames[frames.length >> 1] };
  });

const nodes = (page) => page.evaluate(() => document.querySelectorAll('#viewport .row').length);

const scenarios = [
  { name: 'create 1,000 rows', rows: 1000, setup: [], run: (p) => timed(p, ['click', '#run1k']) },
  { name: 'create 10,000 rows', rows: 10_000, setup: [], run: (p) => timed(p, ['click', '#run10k']) },
  { name: 'create 100,000 rows', rows: 100_000, setup: [], run: (p) => timed(p, ['click', '#run100k']) },
  { name: 'update every 10th (10,000)', rows: 10_000, setup: ['#run10k'], run: (p) => timed(p, ['click', '#update']) },
  { name: 'jump to the middle (100,000)', rows: 100_000, setup: ['#run100k'], run: (p) => timed(p, ['scroll', 38 * 50_000]) },
  { name: 'scroll sweep, frame time (100,000)', rows: 100_000, setup: ['#run100k'], run: sweep },
];

async function startPreview() {
  const viteBin = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  const run = (cmd) =>
    new Promise((ok, fail) => {
      const child = spawn(process.execPath, [viteBin, ...cmd], { cwd: appDir, stdio: ['ignore', 'inherit', 'inherit'] });
      child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`vite ${cmd[0]} exited with ${code}`))));
    });
  if (!args.includes('--no-build')) await run(['build']);
  const server = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: appDir, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url('virtual'))).ok) return server;
    } catch {
      await sleep(100);
    }
  }
  server.kill();
  throw new Error('vite preview did not come up');
}

async function launch() {
  const attempts = process.env.CHROME_PATH ? [{ executablePath: process.env.CHROME_PATH }] : [{ channel: 'chrome' }, { channel: 'msedge' }];
  let last;
  for (const a of attempts) {
    try {
      return await chromium.launch({ headless: true, ...a });
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`No browser found (set CHROME_PATH): ${last?.message}`);
}

const server = await startPreview();
let browser;
try {
  browser = await launch();
  console.log(`virtual scroll benchmark: ${browser.version()}, median of ${iterations} fresh pages\n`);
  for (const s of scenarios) {
    if (only.length && !only.some((o) => s.name.includes(o))) continue;
    const line = {};
    for (const mode of ['plain', 'virtual']) {
      if (mode === 'plain' && s.rows > maxPlain) {
        line[mode] = null;
        continue;
      }
      const samples = [];
      let domNodes = 0;
      for (let i = 0; i < iterations; i++) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(url(mode), { waitUntil: 'load' });
        await page.waitForSelector('#run1k');
        for (const sel of s.setup) {
          await timed(page, ['click', sel]);
          await settle(page);
        }
        samples.push(await s.run(page));
        await settle(page);
        domNodes = await nodes(page);
        if (errors.length) throw new Error(`${s.name} (${mode}): ${errors[0]}`);
        await context.close();
      }
      line[mode] = { script: median(samples.map((x) => x.script)), paint: median(samples.map((x) => x.paint)), nodes: domNodes };
    }
    const f = (r) => (r ? `${r.paint.toFixed(1).padStart(8)} ms (script ${r.script.toFixed(1).padStart(7)}, ${String(r.nodes).padStart(6)} rows in DOM)` : '       skipped');
    console.log(`${s.name.padEnd(36)} plain @for: ${f(line.plain)}   virtual: ${f(line.virtual)}`);
  }
} finally {
  await browser?.close();
  server.kill();
}
