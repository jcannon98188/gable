// Benchmark page. Query: ?style=signals|pose|ref|particles &n=5000 &warm=120 &frames=600 &finish=0|1
// Publishes window.__result when the measured frames are done. One configuration per page load.
import { bootstrap, html, inject } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import type { Application } from "pixi.js";
import { Frame } from "./frame.js";
import { GableCanvas } from "./gable-canvas.js";
import { RockParticles, RockPose, RockRef, RockSignals, makeSeeds, type Seed, H, W } from "./bench-entities.js";

const q = new URLSearchParams(location.search);
const style = (q.get("style") ?? "signals") as "signals" | "pose" | "ref" | "particles";
const n = Number(q.get("n") ?? 1000);
const warm = Number(q.get("warm") ?? 120);
const frames = Number(q.get("frames") ?? 600);
const finish = q.get("finish") === "1";
const seeds: Seed[] = makeSeeds(n);

class BenchApp {
  static meta = {
    selector: "bench-app",
    imports: [GableCanvas, RockSignals, RockPose, RockRef, RockParticles],
    template: html`
      <gable-canvas [width]="W" [height]="H" [finish]="finish">
        @switch (style) {
          @case ("signals") {
            @for (s of seeds; track s.id) {
              <rock-signals [seed]="s"></rock-signals>
            }
          }
          @case ("pose") {
            @for (s of seeds; track s.id) {
              <rock-pose [seed]="s"></rock-pose>
            }
          }
          @case ("ref") {
            @for (s of seeds; track s.id) {
              <rock-ref [seed]="s"></rock-ref>
            }
          }
          @default {
            <rock-particles [seeds]="seeds"></rock-particles>
          }
        }
      </gable-canvas>
    `,
  };
  frame = inject(Frame);
  style = style;
  seeds = seeds;
  W = W;
  H = H;
  finish = finish;
}

const frame = new Frame();
const total = warm + frames;
const hooks = new Float64Array(total);
const flush = new Float64Array(total);
const render = new Float64Array(total);
const fin = new Float64Array(total);
const stamps = new Float64Array(total);
let i = 0;
frame.probe = (h, f, r, g, now) => {
  if (i >= total) return;
  hooks[i] = h;
  flush[i] = f;
  render[i] = r;
  fin[i] = g;
  stamps[i] = now;
  i++;
  if (i === total) finishRun();
};

function pct(a: ArrayLike<number>, from: number, p: number): number {
  const xs = Array.from(a).slice(from).sort((x, y) => x - y);
  return xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;
}

function summary(a: Float64Array) {
  return { p50: pct(a, warm, 50), p95: pct(a, warm, 95), p99: pct(a, warm, 99), mean: Array.from(a).slice(warm).reduce((s, v) => s + v, 0) / frames };
}

function finishRun() {
  const deltas = new Float64Array(total - 1);
  for (let k = 1; k < total; k++) deltas[k - 1] = stamps[k]! - stamps[k - 1]!;
  const measured = Array.from(deltas).slice(warm - 1);
  const refresh = 1000 / 60;
  const app = (globalThis as { __app?: Application }).__app!;
  const gl = (app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const stageCount = (c: { children: unknown[] }): number => c.children.reduce<number>((s, k) => s + 1 + stageCount(k as { children: unknown[] }), 0);
  const result = {
    style,
    n,
    finish,
    frames,
    mountMs,
    stageNodes: stageCount(app.stage as never),
    hookCount: frame.count,
    hooksMs: summary(hooks),
    flushMs: summary(flush),
    renderMs: summary(render),
    finishMs: summary(fin),
    jsTotalMs: summary(hooks.map((v, k) => v + flush[k]! + render[k]!)),
    frameMs: { p50: pctArr(measured, 50), p95: pctArr(measured, 95), p99: pctArr(measured, 99), mean: measured.reduce((s, v) => s + v, 0) / measured.length },
    dropped: measured.filter((d) => d > refresh * 1.5).length,
    missed: measured.reduce((s, d) => s + Math.max(0, Math.round(d / refresh) - 1), 0),
    gl: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown",
    glVersion: gl.getParameter(gl.VERSION),
    userAgent: navigator.userAgent,
  };
  (globalThis as { __result?: unknown }).__result = result;
}

function pctArr(a: number[], p: number) {
  const xs = [...a].sort((x, y) => x - y);
  return xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;
}

const mountStart = performance.now();
bootstrap(BenchApp, { renderer: dom(), target: "#app", providers: [{ provide: Frame, useValue: frame }] });
const mountMs = performance.now() - mountStart;
(globalThis as { __ready?: boolean }).__ready = true;
