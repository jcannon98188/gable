// @vitest-environment jsdom
// canvas/118 item 3: the dev build warns when a component's Setup starts a raw setInterval or setTimeout without onCleanup.
import { afterEach, describe, expect, it, vi } from "vitest";
import { html, inject, onCleanup } from "@gablejs/core";
import { GableCanvas } from "./index.js";
import { boot, fakeApp, live, manualScheduler } from "./hmr-harness.js";

const timers: Array<ReturnType<typeof setInterval>> = [];
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.replaceChildren();
  while (timers.length) clearInterval(timers.pop());
  vi.restoreAllMocks();
});

const track = <T extends ReturnType<typeof setInterval>>(id: T): T => (timers.push(id), id);
const rockMeta = { selector: "app-rock", template: html`<sprite></sprite>` };

/** Boots a page whose canvas holds one scene component, `Rock`; resolves once the canvas exists. */
async function bootRock(Rock: new () => object, providers: unknown[] = []) {
  const app = fakeApp();
  const options = { createApplication: () => app.create(), scheduler: manualScheduler().scheduler };
  class Host {
    static meta = { selector: "app-host", imports: [GableCanvas, Rock], providers, template: html`<gable-canvas [options]="options"><app-rock></app-rock></gable-canvas>` };
    options = options;
  }
  const page = boot(Host);
  await vi.waitFor(() => expect(page.target.querySelector("canvas")).not.toBeNull());
  return page;
}

const warnings = (warn: { mock: { calls: unknown[][] } }, word: string) => warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes(word));

describe("dev warning for raw timers", () => {
  it("warns when a component's Setup starts a raw setInterval without onCleanup", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    class Rock {
      static meta = rockMeta;
      spawn = track(setInterval(() => {}, 60_000));
    }
    await bootRock(Rock);
    const found = warnings(warn, "setInterval");
    expect(found.length).toBe(1);
    expect(found[0]).toContain("Rock");
  });

  it("warns for a raw setTimeout too", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    class Rock {
      static meta = rockMeta;
      once = track(setTimeout(() => {}, 60_000));
    }
    await bootRock(Rock);
    expect(warnings(warn, "setTimeout").length).toBe(1);
  });

  it("does not warn when the component registers onCleanup", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    class Rock {
      static meta = rockMeta;
      spawn = (() => {
        const id = setInterval(() => {}, 60_000);
        onCleanup(() => clearInterval(id));
        return id;
      })();
    }
    await bootRock(Rock);
    expect(warnings(warn, "setInterval")).toEqual([]);
  });

  it("does not warn for a timer owned by a service the component injects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    class Spawner {
      id = track(setInterval(() => {}, 60_000));
    }
    class Rock {
      static meta = rockMeta;
      spawner = inject(Spawner);
    }
    await bootRock(Rock, [Spawner]);
    expect(warnings(warn, "setInterval")).toEqual([]);
  });

  it("an unrelated onCleanup (an unrelated cleanup) does not hide a raw timer: the leak is reported when the component is destroyed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    class Rock {
      static meta = rockMeta;
      unrelated = onCleanup(() => {}); // what Frame.onFrame and Assets.load do
      spawn = track(setInterval(() => {}, 60_000));
    }
    const page = await bootRock(Rock);
    page.ref.destroy();
    await Promise.resolve();
    const found = warnings(warn, "setInterval");
    expect(found.length).toBe(1);
    expect(found[0]).toContain("Rock");
  });

  it("stays quiet when the cleanup really clears the timer, even next to unrelated cleanups", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    class Rock {
      static meta = rockMeta;
      unrelated = onCleanup(() => {}); // what Frame.onFrame and Assets.load do
      spawn = (() => {
        const id = setInterval(() => {}, 60_000);
        onCleanup(() => clearInterval(id));
        return id;
      })();
    }
    const page = await bootRock(Rock);
    page.ref.destroy();
    await Promise.resolve();
    expect(warnings(warn, "setInterval")).toEqual([]);
  });

  it("a one-shot setTimeout that already fired is not a leak", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    class Rock {
      static meta = rockMeta;
      unrelated = onCleanup(() => {}); // what Frame.onFrame and Assets.load do
      once = setTimeout(() => {}, 0);
    }
    const page = await bootRock(Rock);
    await new Promise((r) => setTimeout(r, 10));
    page.ref.destroy();
    await Promise.resolve();
    expect(warnings(warn, "setTimeout")).toEqual([]);
  });
});
