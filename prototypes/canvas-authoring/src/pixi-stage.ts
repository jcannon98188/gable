// <pixi-stage [scene]="SceneClass">: a DOM-side Gable component that owns a Pixi Application and mounts a component
// subtree into app.stage through the Pixi renderer, so the surrounding page stays an ordinary DOM Gable app.
import { createComponent, createInjector, inject, input, RENDERER, type ComponentClass } from "@gable/core";
import { currentScope, INJECTOR, flushSync, injectHost } from "@gable/core/internal";
import { Application } from "pixi.js";
import { Frame, H, W } from "./game-state.js";
import { createPixiRenderer } from "./pixi-renderer.js";

export class PixiStage {
  static meta = { selector: "pixi-stage" };

  scene = input.required<ComponentClass<object>>();
  #frame = inject(Frame);
  // HACK(core gap): the DOM app's injector is the only way to give the canvas subtree the same GameState/Frame.
  #parent = inject(INJECTOR);
  #host = injectHost<HTMLElement>().host;
  boot = this.#boot();

  async #boot() {
    const app = new Application();
    const scope = currentScope();
    let dead = false;
    scope?.onDispose(() => ((dead = true), app.destroy(true, { children: true })));
    await app.init({ width: W, height: H, background: "#0b1020", antialias: true, autoStart: false });
    if (dead) return;
    this.#host.appendChild(app.canvas);
    (globalThis as { __app?: Application }).__app = app;

    const renderer = createPixiRenderer(app);
    // HACK(core gap): createComponent installs neither RENDERER nor renderer.providers, and has no parentScope. We
    // build the injector by hand, and the scene's lifetime is ours (destroy() below), not owned by this component's scope.
    const injector = createInjector([{ provide: RENDERER, useValue: renderer }, ...(renderer.providers ?? [])], this.#parent);
    // HACK(core gap): no per-subtree renderer in templates, so Pixi scenes can only be mounted imperatively like this.
    const ref = createComponent(this.scene(), { renderer, injector, host: app.stage });
    scope?.onDispose(() => ref.destroy());

    // Pixi's ticker is off; we drive: run frame hooks, flush Gable effects (which write to Pixi nodes), then render.
    let last = performance.now();
    const loop = (now: number) => {
      if (dead) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.#frame.tick(dt);
      // HACK(core gap): effects flush in a microtask; we need them applied before render(), so flushSync from internal.
      flushSync();
      app.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
