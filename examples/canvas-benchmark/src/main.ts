// Benchmark page. Query: ?style=signals|shared|ref|particles &n=5000 &warm=120 &frames=600
// Publishes window.__result when the measured frames are done. One configuration per page load.
import { bootstrap } from "@gablejs/core";
import { createDomRenderer } from "@gablejs/renderer-dom";
import { Application } from "pixi.js";
import { benchApp, H, makeSeeds, registerRock, STYLES, W, type Style } from "./entities.js";
import { Recorder, summarizeSeries } from "./measure.js";

const q = new URLSearchParams(location.search);
const style = (q.get("style") ?? "signals") as Style;
if (!STYLES.includes(style)) throw new Error(`unknown style ${style}`);
const n = Number(q.get("n") ?? 1000);
const warm = Number(q.get("warm") ?? 120);
const frames = Number(q.get("frames") ?? 600);

registerRock();

const recorder = new Recorder(warm + frames);
recorder.install();
let app: Application | undefined;
const options = {
  background: 0x05070d,
  resolution: 1,
  width: W,
  height: H,
  createApplication: () => (app = recorder.wrapApplication(new Application()) as unknown as Application) as never,
  scheduler: recorder.wrapScheduler({ request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) }),
};

recorder.onDone = () => {
  const gl = (app!.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  const stageCount = (c: { children: unknown[] }): number => c.children.reduce<number>((s, k) => s + 1 + stageCount(k as { children: unknown[] }), 0);
  (globalThis as { __result?: unknown }).__result = {
    style,
    n,
    frames,
    warm,
    stageNodes: stageCount(app!.stage as never),
    ...summarizeSeries(recorder.series, warm),
    gl: gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown",
    userAgent: navigator.userAgent,
  };
  recorder.uninstall();
};

const target = document.getElementById("app")!;
target.style.cssText = `width:${W}px;height:${H}px`;
bootstrap(benchApp(style, makeSeeds(n), options), { renderer: createDomRenderer(), target });
