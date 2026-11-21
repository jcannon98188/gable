// @vitest-environment jsdom
// Release-gate soak for canvas HMR (canvas/118 item 6, canvas/135): hundreds of hot edits of a running <gable-canvas>
// game with a forced GC at every checkpoint, recording heap growth and Pixi resource growth.
//
// Run it with `npm run soak -w packages/renderer-pixi` (needs `--expose-gc`, which that script sets). It writes
// `soak-report.json` next to this file (or to $SOAK_REPORT) and fails if the trend says the edits leak.
// Pixi has no GL context under jsdom, so "Pixi resources" are what the scene owns on the JS side: display objects alive
// but not in the scene tree, scene tree size, Application instances and live timers. Everything else is the real
// machinery: the real Gable hot-update runtime, the real <gable-canvas> host and the real Pixi scene renderer.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Container, Sprite } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { flushSync, html, inject, onCleanup, signal } from "@gablejs/core";
import { GableCanvas } from "../src/index.js";
import { boot, fakeApp, live, manualScheduler, update } from "../src/hmr-harness.js";

const EDITS = Number(process.env.SOAK_EDITS ?? 240);
const CHECK_EVERY = 20;
const ROCKS = Number(process.env.SOAK_ROCKS ?? 12);

const gc = (globalThis as { gc?: () => void }).gc;

// Every display object the scene ever adds to a parent, weakly: after a GC, those still alive that are neither destroyed nor in the tree leaked.
const everAdded: Array<WeakRef<Container>> = [];
const addChild = Container.prototype.addChild;
Container.prototype.addChild = function (this: Container, ...children: never[]) {
  if (!process.env.SOAK_NOTRACK) for (const child of children) everAdded.push(new WeakRef(child as Container));
  return addChild.apply(this, children as never) as never;
} as typeof Container.prototype.addChild;

function treeSize(node: Container): number {
  return 1 + node.children.reduce((n, c) => n + treeSize(c as Container), 0);
}

function inTree(root: Container, node: Container): boolean {
  for (let p: Container | null = node; p; p = p.parent) if (p === root) return true;
  return false;
}

interface Sample {
  edit: number;
  heapMB: number;
  treeNodes: number;
  liveUnparented: number;
  applications: number;
  intervals: number;
  hooks: number;
}

describe("canvas HMR soak", () => {
  it(`survives ${EDITS} hot edits without growth in heap or Pixi resources`, async () => {
    expect(gc, "run with --expose-gc (npm run soak -w packages/renderer-pixi)").toBeTypeOf("function");
    const app = fakeApp();
    const frames = manualScheduler();
    const options = { createApplication: () => app.create(), scheduler: frames.scheduler };

    // A timer that is cleaned up and a per-frame-style hook list, so growth in either shows.
    let intervals = 0;
    let hooks = 0;
    const realSet = globalThis.setInterval;
    const realClear = globalThis.clearInterval;
    // Plain wrappers, not vi.spyOn: a spy records every call's arguments, which would keep each rock's closure alive and fake a leak.
    globalThis.setInterval = ((...a: Parameters<typeof realSet>) => (intervals++, realSet(...a))) as typeof realSet;
    globalThis.clearInterval = ((id: Parameters<typeof realClear>[0]) => (intervals--, realClear(id))) as typeof realClear;

    const Pool = class Pool {
      x = signal(0);
      rocks = signal(Array.from({ length: ROCKS }, (_, i) => i));
    };
    const rockTemplate = html`<container [x]="state.x()"><sprite></sprite><graphics><rect width="8" height="8"></rect></graphics><text>r</text></container>`;
    const pageTemplate = html`<gable-canvas [options]="options">@for (id of pool.rocks(); track id) {<app-rock [id]="id"></app-rock>}</gable-canvas>`;

    // Each edit is a new class source, so the update is a real re-setup every time.
    const rock = (n: number) =>
      new Function(
        "inject",
        "input",
        "Pool",
        "tpl",
        "onCleanup",
        "tick",
        `return class Rock {
          static meta = { selector: "app-rock", template: tpl };
          state = inject(Pool);
          id = input(0);
          edit${n} = ${n};
          hook = (() => { const id = setInterval(() => {}, 600000); tick(1); onCleanup(() => { clearInterval(id); tick(-1); }); return id; })();
        }`,
      );
    const { input } = await import("@gablejs/core");
    const makeRock = (n: number) => rock(n)(inject, input, Pool, rockTemplate, onCleanup, (d: number) => (hooks += d)) as new () => object;
    const makeHost = (n: number, RockClass: new () => object, PoolClass: new () => object) =>
      new Function(
        "GableCanvas",
        "Rock",
        "Pool",
        "inject",
        "tpl",
        "options",
        `return class Host {
          static meta = { selector: "app-host", imports: [GableCanvas, Rock], providers: [Pool], template: tpl };
          options = options;
          pool = inject(Pool);
          edit${n} = ${n};
        }`,
      )(GableCanvas, RockClass, PoolClass, inject, pageTemplate, options) as new () => object;
    const makePool = (n: number) =>
      new Function("signal", `return class Pool { x = signal(0); rocks = signal(Array.from({ length: ${ROCKS} }, (_, i) => i)); edit${n} = ${n}; }`)(signal) as new () => object;

    // Class edits keep the same token: the Pool class the Rocks inject is the canonical one the hot runtime tracks.
    const { ref } = boot(makeHost(0, makeRock(0), Pool));
    const root = () => app.stages[0]?.children[0] as Container;
    await vi.waitFor(() => expect(root() && treeSize(root())).toBeGreaterThan(ROCKS));

    const samples: Sample[] = [];
    const sample = async (edit: number) => {
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 4; i++) {
        gc!();
        await new Promise((r) => setTimeout(r, 0));
      }
      const r = root();
      let liveUnparented = 0;
      for (const w of everAdded) {
        const c = w.deref();
        if (c && !c.destroyed && !inTree(r, c)) liveUnparented++;
      }
      samples.push({
        edit,
        heapMB: Math.round((process.memoryUsage().heapUsed / 1048576) * 100) / 100,
        treeNodes: treeSize(r),
        liveUnparented,
        applications: app.log.created - app.log.destroyed,
        intervals,
        hooks,
      });
    };
    await sample(0);

    for (let edit = 1; edit <= EDITS; edit++) {
      const kind = edit % 3;
      // Host edit, rock edit, or service (Pool) edit, in rotation; all three keep the Application alive.
      const result = update(ref, kind === 0 ? makeHost(edit, makeRock(edit), Pool) : kind === 1 ? makeRock(edit) : makePool(edit));
      expect(["applied", "unchanged"]).toContain(result.status);
      flushSync();
      await new Promise((r) => setTimeout(r, 0));
      if (edit % CHECK_EVERY === 0) await sample(edit);
    }
    live.pop()!.destroy();
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
    await new Promise((r) => setTimeout(r, 300)); // lets the grace period for an unclaimed renderer pass

    const first = samples[1]!; // after the first checkpoint: past warm-up
    const last = samples[samples.length - 1]!;
    const report = {
      edits: EDITS,
      rocks: ROCKS,
      samples,
      growth: {
        heapMB: Math.round((last.heapMB - first.heapMB) * 100) / 100,
        treeNodes: last.treeNodes - first.treeNodes,
        liveUnparented: last.liveUnparented - first.liveUnparented,
        heapKBPerEdit: Math.round(((last.heapMB - first.heapMB) * 1024) / (last.edit - first.edit)),
      },
      applicationsCreated: app.log.created,
      applicationsDestroyedAfterUnmount: app.log.destroyed,
    };
    writeFileSync(process.env.SOAK_REPORT ?? join(import.meta.dirname ?? process.cwd(), "soak-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.growth), `applications created: ${report.applicationsCreated}`);

    expect(app.log.created).toBe(1); // one GL context for every edit
    expect(last.applications).toBe(1);
    expect(last.treeNodes).toBe(first.treeNodes); // the scene is the same size
    expect(last.liveUnparented - first.liveUnparented).toBeLessThanOrEqual(0); // no display objects left alive and detached
    expect(last.intervals).toBe(ROCKS); // old rocks' timers were cleared
    expect(last.hooks).toBe(ROCKS);
    // Forced-GC heap. Each edit legitimately adds a few KB (the runtime keeps one definition per edited class); retaining a
    // generation of rock instances, as the runtime did before it let go of the replaced record, cost about 120 KB per edit.
    expect(report.growth.heapKBPerEdit).toBeLessThan(50);
    expect(app.log.destroyed).toBe(1); // and the unmount released it
    void Sprite;
  }, 600_000);
});
