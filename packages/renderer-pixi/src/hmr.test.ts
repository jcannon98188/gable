// @vitest-environment jsdom
// HMR for the canvas (TASK-104.13, TASK-105.16): the Application and GL context survive host and provider edits.
// The scene is projected from a host component with its own template; projected scene components cannot inject boundary
// services (ADR 0019), so services under test are provided by that host.
import { Container } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Frame, GableCanvas, type ApplicationLike, type FrameScheduler } from "./index.js";
import { bootstrap, html, inject, onCleanup, signal, flushSync } from "@gable/core";
import { applyUpdate } from "@gable/core/hmr";
import { createDomRenderer } from "@gable/renderer-dom";

function fakeApp() {
  const log = { created: 0, inits: 0, renders: 0, destroyed: 0 };
  return {
    log,
    create(): ApplicationLike {
      log.created++;
      const stage = new Container();
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
function manualScheduler() {
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

const live: Array<{ destroy(): void }> = [];
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.replaceChildren();
});

function boot(Host: new () => object) {
  const target = document.createElement("div");
  document.body.append(target);
  const ref = bootstrap(Host as never, { renderer: createDomRenderer(), target });
  live.push(ref);
  return { ref, target };
}

const update = (_ref: object, Host: Function) => applyUpdate([{ url: "gable-test://host", exports: { [Host.name]: Host } }]);

describe("Application survival", () => {
  it("keeps the same Application and canvas when the host component's class is edited", async () => {
    const app = fakeApp();
    const frames = manualScheduler();
    const options = { createApplication: () => app.create(), scheduler: frames.scheduler };
    const template = html`<gable-canvas [options]="options"><sprite x="1"></sprite></gable-canvas>`;
    const v1 = class Host {
      static meta = { selector: "app-host", imports: [GableCanvas], template };
      options = options;
    };
    const v2 = class Host {
      static meta = { selector: "app-host", imports: [GableCanvas], template };
      options = options;
      added = 1;
    };
    const { ref, target } = boot(v1);
    await vi.waitFor(() => expect(target.querySelector("canvas")).not.toBeNull());
    const canvas = target.querySelector("canvas")!;

    const result = update(ref, v2);
    expect(result.status).toBe("applied");
    await vi.waitFor(() => expect(target.querySelector("canvas")).toBe(canvas));

    expect(app.log.created).toBe(1);
    expect(app.log.destroyed).toBe(0);
    expect(target.querySelector("canvas")).toBe(canvas);
    expect(target.querySelectorAll("canvas").length).toBe(1);
  });
});
