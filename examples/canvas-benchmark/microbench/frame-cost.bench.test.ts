// @vitest-environment jsdom
// The Node microbench (canvas/119): the frame-cost model with no browser and no GPU. It builds the same entity scenes as
// the browser benchmark against a fake Application, drives the real boundary loop with a manual scheduler, and times the
// three JS-side phases per frame. It runs on every PR. It asserts the model's structure (every entity's hook ran, every
// frame was recorded), never absolute times: those belong to the same-runner gate in scripts/compare.mjs.
// Writes results/microbench.json (gitignored) with the numbers.
import { mkdirSync, writeFileSync } from "node:fs";
import { Container } from "pixi.js";
import { afterAll, describe, expect, it } from "vitest";
import { bootstrap, whenFlushed } from "@gable/core";
import { createDomRenderer } from "@gable/renderer-dom";
import { type ApplicationLike, type FrameScheduler } from "@gable/renderer-pixi";
import { benchApp, makeSeeds, registerRock, STYLES, type Style } from "../src/entities.js";
import { Recorder, summarizeSeries } from "../src/measure.js";

const COUNTS = (process.env.MICROBENCH_COUNTS ?? "500,2000").split(",").map(Number);
const WARM = 10;
const FRAMES = Number(process.env.MICROBENCH_FRAMES ?? 60);
const results: unknown[] = [];
registerRock();

async function measure(style: Style, n: number) {
  const recorder = new Recorder(WARM + FRAMES);
  recorder.install();
  const stage = new Container();
  const canvas = document.createElement("canvas");
  const app: ApplicationLike = recorder.wrapApplication({
    async init() {},
    canvas,
    stage,
    render() {},
    renderer: { resize() {} },
    destroy() {
      canvas.remove();
    },
  });
  let pending: ((t: number) => void) | null = null;
  const scheduler: FrameScheduler = recorder.wrapScheduler({
    request: (cb) => ((pending = cb), 1),
    cancel: () => void (pending = null),
  });
  const target = document.createElement("div");
  document.body.appendChild(target);
  const options = { createApplication: () => app, scheduler, width: 800, height: 600 };
  const ref = bootstrap(benchApp(style, makeSeeds(n), options), { renderer: createDomRenderer(), target });
  try {
    // Wait for the lazy scene chunk and the (fake) Application to come up and the first frame to be requested.
    for (let i = 0; i < 200 && !pending; i++) await new Promise((r) => setTimeout(r, 10));
    expect(pending, "the boundary asked for a frame").not.toBeNull();
    // The entities are built after the first frame is requested; the scene must be complete before frames are measured.
    if (style !== "particles") for (let i = 0; i < 500 && countNodes(stage) < n; i++) await new Promise((r) => setTimeout(r, 10));
    let time = 0;
    for (let i = 0; i < WARM + FRAMES; i++) {
      const cb = pending!;
      pending = null;
      cb((time += 16));
    }
    await whenFlushed();
    expect(recorder.series.hooks).toHaveLength(WARM + FRAMES);
    return { style, n, ...summarizeSeries(recorder.series, WARM), stageNodes: countNodes(stage) };
  } finally {
    recorder.uninstall();
    (ref as { destroy?: () => void }).destroy?.();
    target.remove();
  }
}

const countNodes = (c: Container): number => c.children.reduce((s, k) => s + 1 + countNodes(k as Container), 0);

describe("frame cost model (Node, fake Application)", () => {
  for (const style of STYLES) {
    for (const n of COUNTS) {
      it(`${style} at ${n} entities: records the hooks, flush and render phases of every frame`, async () => {
        const r = await measure(style, n);
        expect(r.hooksMs.p50, "the entities' hooks ran").toBeGreaterThan(0);
        for (const phase of [r.hooksMs, r.flushMs, r.renderMs, r.jsTotalMs]) {
          expect(Number.isFinite(phase.p50)).toBe(true);
          expect(phase.p50).toBeGreaterThanOrEqual(0);
        }
        // Every entity is in the scene (component entities one node each; the particle style has its container, not nodes).
        if (style !== "particles") expect(r.stageNodes).toBeGreaterThanOrEqual(n);
        results.push(r);
        console.log(`${style.padEnd(9)} n=${String(n).padStart(5)}  hooks p50=${r.hooksMs.p50.toFixed(3)}  flush p50=${r.flushMs.p50.toFixed(3)}  render p50=${r.renderMs.p50.toFixed(3)} ms`);
      });
    }
  }
});

afterAll(() => {
  // The vitest root is the repo root, so a repo-relative path is stable (jsdom replaces URL, so import.meta.url cannot be used).
  const dir = "examples/canvas-benchmark/results";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/microbench.json`, JSON.stringify({ counts: COUNTS, frames: FRAMES, results }, null, 1));
});
