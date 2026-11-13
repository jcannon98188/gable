// Page bundled by browser-smoke.test.ts: a real <gable-canvas> boundary with a host component (a scene component
// projected from a page cannot inject boundary services, ADR 0019), driven by DOM events, reporting what a real
// Chromium did. axe-core is injected by the test as a global before this script runs.
import { bootstrap, html, inject } from "@gable/core";
import { createDomRenderer } from "@gable/renderer-dom";
import { Application, Rectangle } from "pixi.js";
import { GableCanvas } from "../src/host.js";
import { Keyboard } from "../src/keyboard.js";
import { Pointer } from "../src/pointer.js";
import { pixiRenderer } from "../src/renderer.js";

let app: Application | undefined;
const options = {
  background: 0x000000,
  resolution: 1,
  createApplication: () => (app = new Application()) as never,
};

const taps: string[] = [];
let keyboard: Keyboard | undefined;
let pointer: Pointer | undefined;

// Services are provided at the boundary, so a scene component inside the host injects them (the host itself cannot).
class Probe {
  static meta = { selector: "smoke-probe", template: html`<container></container>` };
  keyboard = (keyboard = inject(Keyboard));
  pointer = (pointer = inject(Pointer));
}

class Scene {
  static meta = {
    selector: "smoke-scene",
    renderer: pixiRenderer(options),
    imports: [Probe],
    template: html`
      <smoke-probe></smoke-probe>
      <graphics [a11y]="a11y" (pointertap)="tap()"><rect width="40" height="40" fill="#ff0000"></rect></graphics>
    `,
  };
  a11y = { role: "button", label: "Red square" };
  tap() {
    taps.push("red");
  }
}

class Page {
  static meta = {
    selector: "app-page",
    imports: [GableCanvas, Scene],
    template: html`<smoke-scene></smoke-scene>`,
  };
}

const errors: string[] = [];
console.error = (...a: unknown[]) => void errors.push(a.map((x) => String((x as Error)?.stack ?? x)).join(" "));
addEventListener("error", (e) => errors.push(String(e.message)));

const target = document.getElementById("app")!;
bootstrap(Page as never, { renderer: createDomRenderer(), target });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ready: () => boolean, what: string) {
  for (let i = 0; i < 100 && !ready(); i++) await sleep(100);
  if (!ready()) throw new Error("timed out waiting for " + what);
}

async function report() {
  const host = target.querySelector("smoke-scene") as HTMLElement;
  // The Application initialises lazily.
  await until(() => !!app && !!host.querySelector("canvas") && !!pointer, "the canvas");
  const canvas = host.querySelector("canvas")!;
  const px = (x: number, y: number) => Array.from(app!.renderer.extract.pixels({ target: app!.stage, frame: new Rectangle(x, y, 1, 1) }).pixels);
  const out: Record<string, unknown> = { errors, pixelInside: px(10, 10), pixelOutside: px(100, 60), canvases: host.querySelectorAll("canvas").length };

  // Pointer: through the real DOM event system and Pixi's hit test on the real canvas.
  const r = canvas.getBoundingClientRect();
  const at = { clientX: r.left + 10, clientY: r.top + 10, pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true };
  // Hit testing needs the scene laid out by a frame, so repeat the gesture until the first frames have run and it lands.
  for (let i = 0; i < 50 && taps.length === 0; i++) {
    canvas.dispatchEvent(new PointerEvent("pointermove", { ...at, button: -1 }));
    canvas.dispatchEvent(new PointerEvent("pointerdown", { ...at, button: 0, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { ...at, button: 0, buttons: 0 }));
    if (taps.length === 0) await sleep(100);
  }
  out.taps = taps.slice();
  out.pointerPosition = pointer!.position();

  // Keyboard: focus the host (it takes a tab index) and dispatch a key.
  host.focus();
  host.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
  out.hostFocused = document.activeElement === host;
  out.keyIsDown = keyboard!.isDown("KeyW");

  // axe-core on the host with its a11y mirror.
  const mirror = host.querySelector("[data-gable-a11y]");
  out.mirrorButtons = mirror ? mirror.querySelectorAll("button").length : 0;
  const axe = (globalThis as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } }).axe;
  const results = await axe.run(host, {});
  out.violations = results.violations.map((v) => `${v.id} (${v.nodes.length})`);
  return out;
}

report().then(
  (o) => document.body.setAttribute("data-report", JSON.stringify(o)),
  (e) => document.body.setAttribute("data-report", JSON.stringify({ error: String(e?.stack ?? e) })),
);
