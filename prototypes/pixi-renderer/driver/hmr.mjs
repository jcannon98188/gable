// HMR experiments through the real path: Vite dev server + Gable's accept lines + packages/core/src/hmr.ts.
// The driver edits files on disk, waits for Vite's `vite:afterUpdate`, and snapshots the running game in a real Chromium
// (real GPU via ANGLE/D3D11). Every source file it touches is restored afterwards (and verified).
//
//   npx vite --port 5290 --strictPort        (in another terminal)
//   node driver/hmr.mjs [--only a1,b2] [--edits 5] [--out results/hmr.json] [--gpu d3d11]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./common.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const BASE = args.base ?? "http://localhost:5290";
const EDITS = Number(args.edits ?? 5);
const only = args.only ? String(args.only).split(",") : null;
const out = args.out ?? "results/hmr.json";
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

// Each experiment: a file, and for edit k (1..N) a [from, to] replacement applied to the ORIGINAL text (plus a changing marker comment).
const colors = ["#ff66dd", "#66ff99", "#ffee55", "#9988ff", "#ff8855"];
const EXPERIMENTS = [
  { id: "a1", title: "(a) template edit: ship sprite tint", file: "demo/game-ship.ts", edit: (k) => [`tint="#66ddff"`, `tint="${colors[k - 1]}"`] },
  { id: "a2", title: "(a) template edit: rock sprite tint (entities in an @for)", file: "demo/game-rock.ts", edit: (k) => [`tint="#e0a458"`, `tint="${colors[k - 1]}"`] },
  { id: "b1", title: "(b) class edit: rock frame-hook body (field initialiser)", file: "demo/game-rock.ts", edit: (k) => [`this.r.set(this.r() + d.spin * dt)`, `this.r.set(this.r() + d.spin * dt * ${1 + k})`] },
  { id: "b2", title: "(b) class edit: new field on the rock", file: "demo/game-rock.ts", edit: (k) => [`  r = signal(0);`, `  r = signal(0);\n  extra${k} = signal(${k});`] },
  { id: "b3", title: "(b) class edit: scene-root hook (spawn rate; spawnTimer/spawned fields)", file: "demo/game-world.ts", edit: (k) => [`this.spawnTimer > 1 / 60`, `this.spawnTimer > 1 / ${60 + k}`] },
  { id: "b4", title: "(b) class edit: a plain method body (ship.describe)", file: "demo/game-ship.ts", pre: (s) => s.replace(`  speed = 320;`, `  speed = 320;\n  describe() {\n    return "speed 0";\n  }`), edit: (k) => [`return "speed 0";`, `return "speed ${k}";`] },
  { id: "c1", title: "(c) host edit: <gable-canvas> class (Application background)", file: "gable-canvas.ts", edit: (k) => [`background: "#0b1020"`, `background: "#0b10${20 + k}"`] },
  { id: "c2", title: "(c) host edit: <gable-canvas> template", file: "gable-canvas.ts", edit: (k) => ["template: html`<slot></slot>`", `template: html\`<slot></slot><container label="t${k}"></container>\``] },
  { id: "d1", title: "(d) service edit: method body (GameState.spawn)", file: "demo/game-state.ts", edit: (k) => [`speed: 90 + Math.random() * 160`, `speed: ${90 + k} + Math.random() * 160`] },
  { id: "d2", title: "(d) service edit: new field on GameState", file: "demo/game-state.ts", edit: (k) => [`  nextId = 0;`, `  nextId = 0;\n  extra${k} = ${k};`] },
];

// Page-side helpers (a string, so it can be installed once per page).
const PAGE_HELPERS = `
globalThis.__mark = () => {
  const app = globalThis.__app, w = globalThis.__world;
  let n = 0, fresh = 0;
  // __m: every node present now. __f: "fresh" rocks (high on screen), which would still be alive 2 s from now with no HMR at all.
  const walk = (c) => { c.__m = 1; c.__f = 0; n++; if (c.texture && c.label !== "" && !Number.isNaN(Number(c.label)) && c.y < 100) { c.__f = 1; fresh++; } c.children.forEach(walk); };
  walk(app.stage);
  app.canvas.__m = 1; app.renderer.gl.__m = 1; w.__m = 1; w.state.__m = 1;
  globalThis.__fresh = fresh;
  return n;
};
globalThis.__snap = () => {
  const reg = globalThis.__pixiSpike, app = globalThis.__app, w = globalThis.__world, frame = globalThis.__demo.frame;
  const count = (c) => c.children.reduce((s, k) => s + 1 + count(k), 0);
  let marked = 0, total = 0, destroyedAttached = 0, freshAlive = 0, deadTex = 0, sprites = 0;
  const walk = (c) => { total++; if (c.__m) marked++; if (c.__f) freshAlive++; if (c.destroyed) destroyedAttached++; if (c.texture) { sprites++; if (c.texture.destroyed || c.texture.source?.destroyed) deadTex++; } c.children.forEach(walk); };
  walk(app.stage);
  const rocks = w.state.rocks().length;
  const canv = [...document.querySelectorAll('canvas')];
  const gl = app.renderer.gl;
  return {
    bootOrigin: performance.timeOrigin,
    canvasCount: canv.length, canvasUids: canv.map((c) => c.dataset.uid), canvasSameElement: !!app.canvas.__m, glSameContext: !!gl.__m, ctxLost: gl.isContextLost(),
    appsCreated: reg.created, appsDestroyed: reg.destroyed, appsLive: reg.live.size,
    liveStageNodes: [...reg.live].map((a) => count(a.stage)),
    stageNodes: total, nodesSurvivingFromMark: marked, freshRocksMarked: globalThis.__fresh, freshRocksSameObject: freshAlive, destroyedStillAttached: destroyedAttached, sprites, spritesWithDestroyedTexture: deadTex, ticks: frame.ticks,
    rocks, nodesMinus2PerRock: total - 2 * rocks,
    textures: app.renderer.texture.managedTextures.length,
    hooksLive: frame.count, hooksRegisteredEver: frame.registered,
    worldSameInstance: !!w.__m, serviceSameInstance: !!w.state.__m,
    elapsed: +w.state.elapsed.toFixed(2), nextId: w.state.nextId, hits: w.state.hits(), spawned: w.spawned, spawnTimer: +w.spawnTimer.toFixed(4),
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    hmrUpdates: globalThis.__hmrUpdates,
  };
};
`;

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
  const logs = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning" || /hot updated|\[gable|reload/i.test(m.text())) && logs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 300)}`));
  await page.goto(BASE + "/");
  await page.addScriptTag({ content: PAGE_HELPERS });
  await page.waitForFunction(() => globalThis.__world && globalThis.__app && globalThis.__world.state.rocks().length > 40, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  return { page, logs };
}

const hmrLog = (page) => page.evaluate(() => globalThis.__GABLE_DEVTOOLS_HOOK__?.call("hmrLog", undefined) ?? null);

async function runExperiment(browser, ex) {
  const path = `${SRC}/${ex.file}`;
  const original = readFileSync(path, "utf8");
  const base = ex.pre ? ex.pre(original) : original;
  const record = { id: ex.id, title: ex.title, file: ex.file, baseline: null, edits: [] };
  const { page, logs } = await newPage(browser);
  try {
    if (ex.pre) {
      // The method-only experiment first adds the method it will edit; wait for that edit to settle, then take the baseline.
      const before = await page.evaluate(() => globalThis.__hmrUpdates);
      writeFileSync(path, base);
      await page.waitForFunction((b) => globalThis.__hmrUpdates > b, before, { timeout: 15000 });
      await page.waitForTimeout(1500);
    }
    await page.evaluate(() => globalThis.__mark());
    record.baseline = await page.evaluate(() => globalThis.__snap());
    for (let k = 1; k <= EDITS; k++) {
      await page.evaluate(() => globalThis.__mark());
      const pre = await page.evaluate(() => globalThis.__snap());
      const [from, to] = ex.edit(k);
      if (!base.includes(from)) throw new Error(`${ex.id}: pattern not found: ${from}`);
      const prev = await page.evaluate(() => globalThis.__hmrUpdates);
      const t0 = Date.now();
      writeFileSync(path, base.replace(from, to) + `\n// edit ${k}\n`);
      let applied = true;
      try {
        await page.waitForFunction((p) => globalThis.__hmrUpdates > p, prev, { timeout: 15000 });
      } catch {
        applied = false;
      }
      const ms = Date.now() - t0;
      await page.waitForTimeout(1500);
      const reloaded = await page.evaluate((o) => performance.timeOrigin !== o, record.baseline.bootOrigin).catch(() => true);
      let snap = null;
      try {
        snap = await page.evaluate(() => globalThis.__snap());
      } catch (e) {
        snap = { error: String(e.message).split("\n")[0] };
      }
      const t1 = await page.evaluate(() => [globalThis.__demo.frame.ticks, performance.now()]).catch(() => null);
      await page.waitForTimeout(1000);
      const t2 = await page.evaluate(() => [globalThis.__demo.frame.ticks, performance.now()]).catch(() => null);
      const ticksPerSec = t1 && t2 ? +(((t2[0] - t1[0]) / (t2[1] - t1[1])) * 1000).toFixed(1) : null;
      const log = await hmrLog(page).catch(() => null);
      record.edits.push({ k, pre, applied, ticksPerSec, msToAfterUpdate: ms, reloaded, snap, lastHmr: log?.at(-1) ? { status: log.at(-1).status, changes: log.at(-1).changes, errors: log.at(-1).errors } : null });
      if (reloaded) break;
    }
  } finally {
    writeFileSync(path, original);
    await page.waitForTimeout(800);
    record.consoleLogs = logs.slice(0, 30);
    await page.close();
  }
  return record;
}

const browser = await launch(args.gpu ?? "d3d11", ["--enable-precise-memory-info"]);
const results = [];
for (const ex of EXPERIMENTS) {
  if (only && !only.includes(ex.id)) continue;
  console.log("running", ex.id, ex.title);
  try {
    const r = await runExperiment(browser, ex);
    results.push(r);
    const last = r.edits.at(-1)?.snap;
    console.log("  statuses:", r.edits.map((e) => `${e.lastHmr?.status ?? "?"}/${(e.lastHmr?.changes ?? []).map((c) => c.name + ":" + c.kind).join("+")}`).join(" | "));
    console.log("  last snap:", JSON.stringify(last));
  } catch (e) {
    console.log("  FAILED", e.message);
    results.push({ id: ex.id, title: ex.title, error: e.message });
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(results, null, 1));
}
await browser.close();
console.log("wrote", out);
