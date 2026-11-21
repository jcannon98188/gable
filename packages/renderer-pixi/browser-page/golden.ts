// Page bundled by browser-golden.test.ts (canvas/133): a few small scenes, each in its own <gable-canvas> boundary,
// reporting the rendered pixels (RGBA, base64) of each. No text and no external assets: those depend on fonts and
// the network, not on the renderer. Shapes only, so a golden changes when rendering changes, not when the machine does.
import { bootstrap, html } from "@gablejs/core";
import { createDomRenderer } from "@gablejs/renderer-dom";
import { Application, Rectangle } from "pixi.js";
import { GableCanvas } from "../src/host.js";
import { pixiRenderer } from "../src/renderer.js";

export const WIDTH = 160;
export const HEIGHT = 120;

const apps: Record<string, Application> = {};
const options = (name: string) => ({
  background: 0x000000,
  resolution: 1,
  antialias: true,
  createApplication: () => (apps[name] = new Application()) as never,
});

class Shapes {
  static meta = {
    selector: "golden-shapes",
    renderer: pixiRenderer(options("shapes")),
    template: html`
      <graphics>
        <rect x="10" y="10" width="50" height="30" fill="#e63946"></rect>
        <rect x="70" y="10" width="80" height="30" fill="#457b9d" stroke="#1d3557" strokeWidth="3"></rect>
        <circle x="35" y="80" radius="25" fill="#2a9d8f"></circle>
        <ellipse x="100" y="80" halfWidth="40" halfHeight="22" stroke="#f4a261" strokeWidth="4"></ellipse>
      </graphics>
    `,
  };
}

class Transforms {
  static meta = {
    selector: "golden-transforms",
    renderer: pixiRenderer(options("transforms")),
    template: html`
      <container x="80" y="60" rotation="0.5" scale="1.4">
        <graphics><rect x="-40" y="-20" width="80" height="40" fill="#ffffff"></rect></graphics>
        <container x="30" y="0" alpha="0.5">
          <graphics><circle radius="20" fill="#ff0000"></circle></graphics>
        </container>
      </container>
    `,
  };
}

class Polygons {
  static meta = {
    selector: "golden-polygons",
    renderer: pixiRenderer(options("polygons")),
    template: html`
      <graphics>
        <polygon [points]="big" fill="#9b5de5"></polygon>
        <polygon [points]="small" fill="#fee440"></polygon>
      </graphics>
    `,
  };
  big = [20, 100, 80, 15, 140, 100];
  small = [60, 100, 80, 60, 100, 100];
}

const names = ["shapes", "transforms", "polygons"] as const;

class Page {
  static meta = {
    selector: "app-page",
    imports: [GableCanvas, Shapes, Transforms, Polygons],
    template: html`
      <golden-shapes></golden-shapes>
      <golden-transforms></golden-transforms>
      <golden-polygons></golden-polygons>
    `,
  };
}

const errors: string[] = [];
console.error = (...a: unknown[]) => void errors.push(a.map((x) => String((x as Error)?.stack ?? x)).join(" "));
addEventListener("error", (e) => errors.push(String(e.message)));

const target = document.getElementById("app")!;
bootstrap(Page as never, { renderer: createDomRenderer(), target });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function report() {
  for (let i = 0; i < 100 && !names.every((n) => apps[n]?.renderer); i++) await sleep(100);
  for (const n of names) if (!apps[n]?.renderer) throw new Error(`timed out waiting for the ${n} application`);
  await sleep(500); // let a few frames run so the first render has landed
  const scenes: Record<string, string> = {};
  for (const n of names) {
    const app = apps[n]!;
    app.renderer.resize(WIDTH, HEIGHT);
    app.render();
    scenes[n] = toBase64(app.renderer.extract.pixels({ target: app.stage, frame: new Rectangle(0, 0, WIDTH, HEIGHT) }).pixels);
  }
  return { width: WIDTH, height: HEIGHT, scenes, errors };
}

report().then(
  (o) => document.body.setAttribute("data-report", JSON.stringify(o)),
  (e) => document.body.setAttribute("data-report", JSON.stringify({ error: String(e?.stack ?? e) })),
);
