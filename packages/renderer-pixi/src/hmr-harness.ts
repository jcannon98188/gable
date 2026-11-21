// Shared harness for the canvas HMR suites: a fake Pixi Application, a manual frame source and a DOM-hosted boot.
import { Container } from "pixi.js";
import { bootstrap } from "@gablejs/core";
import { applyUpdate } from "@gablejs/core/hmr";
import { createDomRenderer } from "@gablejs/renderer-dom";
import type { ApplicationLike, FrameScheduler } from "./index.js";

export function fakeApp() {
  const stages: Container[] = [];
  const log = { created: 0, inits: 0, renders: 0, destroyed: 0 };
  return {
    log,
    stages,
    create(): ApplicationLike {
      log.created++;
      const stage = new Container();
      stages.push(stage);
      const canvas = document.createElement("canvas");
      return {
        async init() {
          log.inits++;
        },
        canvas,
        stage,
        render() {
          log.renders++;
        },
        renderer: { resize() {} },
        destroy() {
          log.destroyed++;
          canvas.remove();
        },
      };
    },
  };
}

/** A manual frame source: nothing runs until `step()`. */
export function manualScheduler() {
  let next: ((t: number) => void) | null = null;
  let now = 0;
  const scheduler: FrameScheduler = {
    request(cb) {
      next = cb;
      return 1;
    },
    cancel() {
      next = null;
    },
  };
  return {
    scheduler,
    step(ms = 16) {
      now += ms;
      const cb = next;
      next = null;
      cb?.(now);
    },
  };
}

export const live: Array<{ destroy(): void }> = [];
// Each boot is its own "module", so classes registered by an earlier test never shadow this one's.
let moduleUrl = "gable-test://host-0";
let boots = 0;

export function boot(Host: new () => object) {
  moduleUrl = `gable-test://host-${++boots}`;
  const target = document.createElement("div");
  document.body.append(target);
  const ref = bootstrap(Host as never, { renderer: createDomRenderer(), target });
  live.push(ref);
  return { ref, target };
}

export const update = (_ref: object, Host: Function) => applyUpdate([{ url: moduleUrl, exports: { [Host.name]: Host } }]);

