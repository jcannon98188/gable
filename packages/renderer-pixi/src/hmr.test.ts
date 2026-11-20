// @vitest-environment jsdom
// HMR for the canvas (canvas/118, canvas/135): the Application and GL context survive host and provider edits.
// The scene is projected from a host component with its own template; projected scene components cannot inject boundary
// services (ADR 0019), so services under test are provided by that host.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GableCanvas } from "./index.js";
import { boot, fakeApp, live, manualScheduler, update } from "./hmr-harness.js";
import { html } from "@gable/core";

afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.replaceChildren();
});

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

  it("with two canvases, each keeps its own Application even when the rebuild creates them in the other order", async () => {
    const app = fakeApp();
    const options = { createApplication: () => app.create(), scheduler: manualScheduler().scheduler };
    const one = html`<gable-canvas id="a" [options]="options"><sprite x="1"></sprite></gable-canvas><gable-canvas id="b" [options]="options"><sprite x="2"></sprite></gable-canvas>`;
    const swapped = html`<gable-canvas id="b" [options]="options"><sprite x="2"></sprite></gable-canvas><gable-canvas id="a" [options]="options"><sprite x="1"></sprite></gable-canvas>`;
    const v1 = class Host {
      static meta = { selector: "app-host", imports: [GableCanvas], template: one };
      options = options;
    };
    const v2 = class Host {
      static meta = { selector: "app-host", imports: [GableCanvas], template: swapped };
      options = options;
    };
    const { ref, target } = boot(v1);
    await vi.waitFor(() => expect(target.querySelectorAll("canvas").length).toBe(2));
    const canvasA = target.querySelector("#a canvas")!;
    const canvasB = target.querySelector("#b canvas")!;
    expect(canvasA).not.toBe(canvasB);

    expect(update(ref, v2).status).toBe("applied");
    await vi.waitFor(() => expect(target.querySelectorAll("canvas").length).toBe(2));
    await new Promise((r) => setTimeout(r, 300)); // past the orphan grace period
    expect(target.querySelector("#a canvas")).toBe(canvasA);
    expect(target.querySelector("#b canvas")).toBe(canvasB);
    expect(app.log.created).toBe(2);
    expect(app.log.destroyed).toBe(0);
  });
});
