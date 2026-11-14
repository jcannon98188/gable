// SwSync, the app side of background sync, against a worker built on core's backgroundSync on the in-memory browser.
import { afterEach, describe, expect, it } from "vitest";
import { createInjector, type Injector } from "@gable/core";
import { backgroundSync, lifecycle } from "../core/index.js";
import { createBrowser, type InMemoryBrowserOptions, type WorkerScript } from "../testing/browser.js";
import { provideServiceWorker, SERVICE_WORKER_CONTAINER, SwRegistration, SwSync } from "../index.js";

const SW = "https://app.test/sw.js";

const sent: string[] = [];
const worker: WorkerScript = (self) => {
  lifecycle(self, { version: "v1" });
  backgroundSync(self, { tag: "outbox", version: "v1", sync: () => void sent.push("outbox") });
};

const injectors: Injector[] = [];
afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
  sent.length = 0;
});

async function app(options?: InMemoryBrowserOptions, { enabled = true, script = worker, settle = true } = {}) {
  const browser = createBrowser(options);
  browser.deploy("/sw.js", script);
  const page = browser.openPage("/");
  const injector = createInjector([
    ...provideServiceWorker({ url: "/sw.js", enabled }),
    { provide: SERVICE_WORKER_CONTAINER, useValue: page.container },
  ]);
  injectors.push(injector);
  const sync = injector.get(SwSync)!;
  await injector.get(SwRegistration)!.ready;
  if (settle) await browser.settled();
  return { browser, page, injector, sync };
}

describe("SwSync", () => {
  it("registers a tag, and the worker's handler runs when the browser syncs it", async () => {
    const { browser, sync } = await app();
    expect(await sync.isSupported()).toBe(true);
    expect(await sync.register("outbox")).toBe(true);
    expect(await sync.getTags()).toEqual(["outbox"]);

    await browser.activeScope(SW)!.dispatchSync("outbox");

    expect(sent).toEqual(["outbox"]);
    expect(await sync.getTags()).toEqual([]);
  });

  it("registering a pending tag again is still true and leaves one registration", async () => {
    const { sync } = await app();
    expect(await sync.register("outbox")).toBe(true);
    expect(await sync.register("outbox")).toBe(true);
    expect(await sync.getTags()).toEqual(["outbox"]);
  });

  it("waits for the worker to become active before registering", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { browser, sync } = await app(undefined, {
      settle: false,
      script: (self) => {
        lifecycle(self, { version: "v1", install: () => gate });
        backgroundSync(self, { tag: "outbox", version: "v1", sync: () => void sent.push("outbox") });
      },
    });
    const registering = sync.register("outbox");
    release();
    expect(await registering).toBe(true);
    await browser.settled();
    expect(await sync.getTags()).toEqual(["outbox"]);
  });

  it("without Background Sync, register resolves false, nothing is listed, and nothing throws", async () => {
    const { sync } = await app({ backgroundSync: false });
    expect(await sync.isSupported()).toBe(false);
    expect(await sync.register("outbox")).toBe(false);
    expect(await sync.getTags()).toEqual([]);
  });

  it("without a registered worker (development), it is unsupported and register resolves false", async () => {
    const { sync, browser } = await app(undefined, { enabled: false });
    expect(await sync.isSupported()).toBe(false);
    expect(await sync.register("outbox")).toBe(false);
    expect(await sync.getTags()).toEqual([]);
    expect(browser.activeScope(SW)).toBeNull();
  });

  it("without service workers at all, it is unsupported", async () => {
    const injector = createInjector([
      ...provideServiceWorker({ url: "/sw.js", enabled: true }),
      { provide: SERVICE_WORKER_CONTAINER, useValue: null },
    ]);
    injectors.push(injector);
    const sync = injector.get(SwSync)!;
    expect(await sync.isSupported()).toBe(false);
    expect(await sync.register("outbox")).toBe(false);
  });

  it("a browser that refuses the registration is a false outcome, not an exception", async () => {
    const { page, sync } = await app();
    const registration = await page.container.register("/sw.js");
    const manager = registration.sync!;
    manager.register = async () => {
      throw Object.assign(new Error("Registration failed - permission denied"), { name: "NotAllowedError" });
    };
    expect(await sync.register("outbox")).toBe(false);
    manager.getTags = async () => {
      throw new Error("boom");
    };
    expect(await sync.getTags()).toEqual([]);
  });
});
