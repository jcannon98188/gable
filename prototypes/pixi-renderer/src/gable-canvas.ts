// <gable-canvas>: a DOM-hosted component that declares a renderer boundary. Its host stays a DOM element; its template and
// whatever is projected into its <slot> are built with the Pixi renderer into a Container, which is attached to a Pixi
// Application's stage once the Application has initialised (Pixi 8 init is async; scene building is not).
// Gable owns the one rAF loop: frame hooks, then a synchronous effect flush, then one render. Pixi's ticker is off.
import { flushSync, html, inject, injectHost, input, onCleanup } from "@gable/core";
import { Application } from "pixi.js";
import { Frame } from "./frame.js";
import { createPixiBoundary } from "./pixi-renderer.js";

/** Debug registry the experiments read; counts Applications this spike created and destroyed. */
export interface SpikeRegistry {
  created: number;
  destroyed: number;
  live: Set<Application>;
}
const registry: SpikeRegistry = ((globalThis as { __pixiSpike?: SpikeRegistry }).__pixiSpike ??= { created: 0, destroyed: 0, live: new Set() });

const MAX_DT = 1 / 20;

export class GableCanvas {
  static meta = {
    selector: "gable-canvas",
    template: html`<slot></slot>`,
    // Called once per instance after Setup; the scene (this template + projected content + everything nested) uses this renderer.
    renderer: (self: GableCanvas) => self.#boundary,
  };

  width = input(800);
  height = input(600);
  /** Bench option: measure `gl.finish()` after each render (blocks until the GPU/driver has drained). */
  finish = input(false);

  #frame = inject(Frame);
  #host = injectHost<HTMLElement>().host;
  #boundary = createPixiBoundary();
  #app: Application | null = null;
  #dead = false;
  #raf = 0;

  // The Application is created after Setup so width/height inputs are bound. Cleanup runs with the component scope.
  #boot = Promise.resolve().then(() => this.#start());

  #cleanup = onCleanup(() => this.#stop());

  async #start() {
    const app = new Application();
    const uid = ++registry.created;
    registry.live.add(app);
    this.#app = app;
    await app.init({
      width: this.width(),
      height: this.height(),
      background: "#0b1020",
      antialias: false,
      resolution: 1,
      autoStart: false, // Pixi's ticker stays off: Gable drives
      sharedTicker: false,
      preference: "webgl",
    });
    if (this.#dead) return this.#teardown(app);
    app.canvas.dataset.uid = String(uid); // identity tag for the HMR experiments
    this.#host.appendChild(app.canvas);
    app.stage.addChild(this.#boundary.root);
    (globalThis as { __app?: Application }).__app = app;

    const frame = this.#frame;
    const gl = (app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
    let last = performance.now();
    const loop = (now: number) => {
      if (this.#dead) return;
      this.#raf = requestAnimationFrame(loop);
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      const t0 = performance.now();
      frame.tick(dt); // 1. frame hooks (write state)
      const t1 = performance.now();
      flushSync(); // 2. Gable effects apply the state to Pixi nodes
      const t2 = performance.now();
      app.render(); // 3. one render
      const t3 = performance.now();
      let t4 = t3;
      if (this.finish()) {
        gl.finish();
        t4 = performance.now();
      }
      frame.probe?.(t1 - t0, t2 - t1, t3 - t2, t4 - t3, now);
    };
    this.#raf = requestAnimationFrame(loop);
  }

  #teardown(app: Application) {
    if (!registry.live.delete(app)) return;
    registry.destroyed++;
    app.destroy(true, { children: false }); // the scene root is destroyed by the renderer's destroy()
  }

  #stop() {
    this.#dead = true;
    cancelAnimationFrame(this.#raf);
    if (this.#app) this.#teardown(this.#app);
  }
}
