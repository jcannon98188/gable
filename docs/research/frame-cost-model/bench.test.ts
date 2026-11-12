// Frame-cost bench for TASK-104.6. Run: npx vitest run --config docs/research/frame-cost-model/vitest.config.ts
// Writes results to docs/research/frame-cost-model/results.json and prints a table.
import { writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { html, signal, type WritableSignal } from "@gable/core";
import { mount } from "@gable/testing";
import { createTestRenderer } from "@gable/testing/renderer";

const FRAMES = 300;
const WARMUP = 30;
const SIZES = [100, 1000, 2000, 3000, 4000, 5000];

interface Pose { x: number; y: number; rotation: number }
interface Row { variant: string; n: number; bindings: number; writeMed: number; writeP95: number; flushMed: number; flushP95: number; totalMed: number; totalP95: number; setPropertyPerFrame: number }

const results: Row[] = [];

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

function countingRenderer() {
  const r = createTestRenderer();
  const box = { calls: 0 };
  const wrapped = { ...r, setProperty(node: any, name: string, value: unknown) { box.calls++; return r.setProperty(node, name, value); } };
  return { renderer: wrapped as typeof r, box };
}

function record(variant: string, n: number, bindings: number, write: number[], flush: number[], calls: number) {
  const total = write.map((w, i) => w + flush[i]!);
  results.push({
    variant, n, bindings,
    writeMed: pct(write, 0.5), writeP95: pct(write, 0.95),
    flushMed: pct(flush, 0.5), flushP95: pct(flush, 0.95),
    totalMed: pct(total, 0.5), totalP95: pct(total, 0.95),
    setPropertyPerFrame: calls / (FRAMES + WARMUP),
  });
}

// Deterministic changing values, so every write really changes the signal.
const val = (frame: number, i: number, k: number) => frame * 1.01 + i * 0.37 + k;

// --- A: three signals per entity, three bindings per entity --------------------
function runThreeSignals(n: number, mode: "sync" | "microtask") {
  class E { constructor(public id: number, public x = signal(0), public y = signal(0), public r = signal(0)) {} }
  const entities = Array.from({ length: n }, (_, i) => new E(i));
  class Scene {
    static meta = { selector: "app-scene-a", template: html`@for (e of entities; track e.id) {<i [x]="e.x()" [y]="e.y()" [rotation]="e.r()"></i>}` };
    entities = entities;
  }
  const { renderer, box } = countingRenderer();
  const f = mount(Scene, { renderer });
  return { f, box, step: async (frame: number) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { const e = entities[i]!; e.x.set(val(frame, i, 0)); e.y.set(val(frame, i, 1)); e.r.set(val(frame, i, 2)); }
    const t1 = performance.now();
    if (mode === "sync") f.flushSync(); else await Promise.resolve();
    const t2 = performance.now();
    return [t1 - t0, t2 - t1] as const;
  }, verify: (frame: number) => {
    const last = n - 1;
    const node = f.queryAll("i")[last]!;
    if (node.props.x !== val(frame, last, 0) || node.props.rotation !== val(frame, last, 2)) throw new Error("binding did not update");
  } };
}

// --- C: one signal per entity holding an immutable Pose ------------------------
function runOneSignal(n: number, singleBinding: boolean) {
  class E { constructor(public id: number, public s: WritableSignal<Pose> = signal({ x: 0, y: 0, rotation: 0 })) {} }
  const entities = Array.from({ length: n }, (_, i) => new E(i));
  const template = singleBinding
    ? html`@for (e of entities; track e.id) {<i [pose]="e.s()"></i>}`
    : html`@for (e of entities; track e.id) {<i [x]="e.s().x" [y]="e.s().y" [rotation]="e.s().rotation"></i>}`;
  class Scene { static meta = { selector: "app-scene-c", template }; entities = entities; }
  const { renderer, box } = countingRenderer();
  const f = mount(Scene, { renderer });
  return { f, box, step: async (frame: number) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) entities[i]!.s.set({ x: val(frame, i, 0), y: val(frame, i, 1), rotation: val(frame, i, 2) });
    const t1 = performance.now();
    f.flushSync();
    const t2 = performance.now();
    return [t1 - t0, t2 - t1] as const;
  }, verify: (frame: number) => {
    const node = f.queryAll("i")[n - 1]!;
    const want = val(frame, n - 1, 0);
    const got = singleBinding ? (node.props.pose as Pose).x : node.props.x;
    if (got !== want) throw new Error("binding did not update");
  } };
}

async function drive(variant: string, n: number, bindings: number, h: { box: { calls: number }; step: (f: number) => Promise<readonly [number, number]>; verify: (f: number) => void }) {
  const write: number[] = [];
  const flush: number[] = [];
  const base = h.box.calls; // calls made while mounting are excluded
  for (let frame = 1; frame <= WARMUP + FRAMES; frame++) {
    const [w, fl] = await h.step(frame);
    if (frame > WARMUP) { write.push(w); flush.push(fl); }
  }
  h.verify(WARMUP + FRAMES);
  record(variant, n, bindings, write, flush, h.box.calls - base);
}

// --- B: ref fast path, plain fields on stub nodes ------------------------------
async function refFastPath(n: number) {
  const nodes: Pose[] = Array.from({ length: n }, () => ({ x: 0, y: 0, rotation: 0 }));
  const write: number[] = [];
  for (let frame = 1; frame <= WARMUP + FRAMES; frame++) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { const nd = nodes[i]!; nd.x = val(frame, i, 0); nd.y = val(frame, i, 1); nd.rotation = val(frame, i, 2); }
    const t1 = performance.now();
    if (frame > WARMUP) write.push(t1 - t0);
  }
  if (nodes[n - 1]!.x !== val(WARMUP + FRAMES, n - 1, 0)) throw new Error("ref write failed");
  record("B ref fast path (plain fields on stub nodes)", n, 3 * n / n, write, write.map(() => 0), 0);
}

describe("frame cost", () => {
  it("measures", async () => {
    for (const n of SIZES) {
      await drive("A 3 signals/entity, 3 bindings, flushSync", n, 3, runThreeSignals(n, "sync"));
      await drive("A' same, flush via microtask (await Promise.resolve())", n, 3, runThreeSignals(n, "microtask"));
      await refFastPath(n);
      await drive("C1 1 signal/entity (immutable pose), 3 bindings reading it", n, 3, runOneSignal(n, false));
      await drive("C2 1 signal/entity (immutable pose), 1 binding", n, 1, runOneSignal(n, true));
    }
    const meta = {
      node: process.version, platform: `${os.platform()} ${os.release()}`, arch: os.arch(),
      cpu: os.cpus()[0]?.model, cores: os.cpus().length, totalMemGB: +(os.totalmem() / 2 ** 30).toFixed(1),
      frames: FRAMES, warmup: WARMUP,
    };
    writeFileSync(fileURLToPath(new URL("./results.json", import.meta.url)), JSON.stringify({ meta, results }, null, 2));
    console.table(results.map((r) => ({ variant: r.variant.slice(0, 40), n: r.n, b: r.bindings, wMed: +r.writeMed.toFixed(3), wP95: +r.writeP95.toFixed(3), fMed: +r.flushMed.toFixed(3), fP95: +r.flushP95.toFixed(3), tMed: +r.totalMed.toFixed(3), tP95: +r.totalP95.toFixed(3), sp: r.setPropertyPerFrame })));
  }, 600000);
});
