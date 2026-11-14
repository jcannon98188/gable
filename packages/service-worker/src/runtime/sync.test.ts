// defineWorker({ sync }): sync handlers keyed by tag, wired through core's backgroundSync, on the in-memory worker
// scope; and the default worker paired with the app's SwSync on the in-memory browser.
import { afterEach, describe, expect, it } from "vitest";
import { createInjector, type Injector } from "@gable/core";
import { SW_PROTOCOL, type SyncContext } from "../core/index.js";
import { createBrowser, type InMemoryBrowserOptions } from "../testing/browser.js";
import { createWorkerScope, type Network } from "../testing/worker-scope.js";
import { provideServiceWorker, SERVICE_WORKER_CONTAINER, SwRegistration, SwSync } from "../index.js";
import { type AssetManifest, defineWorker, type ServiceWorkerConfig, ServiceWorkerConfigError } from "./index.js";

const SW = "https://app.test/sw.js";
const network: Network = (request) => new Response(`network ${new URL(request.url).pathname}`);
const manifest: AssetManifest = { version: "v1", files: ["/index.html", "/app.js"] };
const config: ServiceWorkerConfig = { assetGroups: [{ name: "app", files: ["/**"] }], navigationFallback: { url: "/index.html" } };

type Handlers = Record<string, (context: SyncContext) => void | Promise<unknown>>;

async function started(sync: Handlers) {
  const scope = createWorkerScope({ network });
  const stop = defineWorker({ config, sync }).start(scope, manifest);
  await scope.install();
  await scope.activate();
  return { scope, stop };
}

describe("defineWorker({ sync })", () => {
  it("runs the handler of the tag that was synced, with its context, and no other", async () => {
    const calls: string[] = [];
    const { scope } = await started({
      outbox: ({ tag, version, lastChance }) => void calls.push(`outbox ${tag} ${version} ${lastChance}`),
      "refresh-feed": () => void calls.push("refresh-feed"),
    });
    await scope.registration.sync!.register("outbox");
    await scope.registration.sync!.register("refresh-feed");

    await scope.dispatchSync("outbox");
    expect(calls).toEqual(["outbox outbox v1 false"]);
    await scope.dispatchSync("refresh-feed", { lastChance: true });
    expect(calls).toEqual(["outbox outbox v1 false", "refresh-feed"]);
  });

  it("a failed attempt fails the event so the browser retries; only a failed last chance reaches the app", async () => {
    const { scope } = await started({
      outbox: () => {
        throw new Error("server down");
      },
    });
    const posted: unknown[] = [];
    scope.connectClient("https://app.test/", { controlled: true, onMessage: (message) => posted.push(message) });
    await scope.registration.sync!.register("outbox");

    await expect(scope.dispatchSync("outbox")).rejects.toThrow("server down");
    expect(posted).toEqual([]);
    expect(await scope.registration.sync!.getTags()).toEqual(["outbox"]); // still registered, to be retried

    await expect(scope.dispatchSync("outbox", { lastChance: true })).rejects.toThrow("server down");
    expect(posted).toEqual([
      { protocol: SW_PROTOCOL, type: "error", version: "v1", phase: "runtime", error: { name: "Error", message: "server down" } },
    ]);
  });

  it("a tag with no handler is left alone", async () => {
    const { scope } = await started({ outbox: () => {} });
    await scope.registration.sync!.register("other");
    await expect(scope.dispatchSync("other")).resolves.toBeUndefined();
  });

  it("the disposer stops handling sync events", async () => {
    const calls: string[] = [];
    const { scope, stop } = await started({ outbox: () => void calls.push("outbox") });
    stop();
    await scope.registration.sync!.register("outbox");
    await scope.dispatchSync("outbox");
    expect(calls).toEqual([]);
  });

  it("without background sync in the browser, starting the worker works and the handlers never run", async () => {
    const calls: string[] = [];
    const scope = createWorkerScope({ network, backgroundSync: false });
    defineWorker({ config, sync: { outbox: () => void calls.push("outbox") } }).start(scope, manifest);
    await scope.install();
    await scope.activate();
    expect(scope.registration.sync).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("rejects handlers that are not functions, and empty tags, naming each", () => {
    const sync = { outbox: "send", "": () => {} } as unknown as Handlers;
    let error: unknown;
    try {
      defineWorker({ config, sync });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ServiceWorkerConfigError);
    expect((error as ServiceWorkerConfigError).issues.map((issue) => issue.path)).toEqual(["sync.outbox", "sync[\"\"]"]);
  });

  it("works with extend alongside, and the extension's own sync handlers", async () => {
    const calls: string[] = [];
    const scope = createWorkerScope({ network });
    defineWorker({
      config,
      sync: { outbox: () => void calls.push("outbox") },
      extend: ({ self, version }) => {
        self.addEventListener("sync", (event) => {
          if (event.tag === "custom") event.waitUntil(Promise.resolve().then(() => void calls.push(`custom ${version}`)));
        });
      },
    }).start(scope, manifest);
    await scope.install();
    await scope.activate();
    await scope.registration.sync!.register("outbox");
    await scope.registration.sync!.register("custom");
    await scope.dispatchSync("outbox");
    await scope.dispatchSync("custom");
    expect(calls).toEqual(["outbox", "custom v1"]);
  });
});

describe("SwSync with a defineWorker worker", () => {
  const injectors: Injector[] = [];
  afterEach(() => {
    for (const injector of injectors.splice(0)) injector.destroy();
  });

  async function app(options?: InMemoryBrowserOptions, handlers: Handlers = {}) {
    const browser = createBrowser({ network, ...options });
    browser.deploy("/sw.js", (self) => void defineWorker({ config, sync: handlers }).start(self, manifest));
    const page = browser.openPage("/");
    const injector = createInjector([
      ...provideServiceWorker({ url: "/sw.js", enabled: true }),
      { provide: SERVICE_WORKER_CONTAINER, useValue: page.container },
    ]);
    injectors.push(injector);
    await injector.get(SwRegistration)!.ready;
    await browser.settled();
    return { browser, page, sync: injector.get(SwSync)! };
  }

  it("the app registers a tag, the browser syncs it, the worker's handler for that tag runs", async () => {
    const sent: string[] = [];
    const { browser, sync } = await app(undefined, { outbox: () => void sent.push("sent queued messages") });
    expect(await sync.isSupported()).toBe(true);
    expect(await sync.register("outbox")).toBe(true);
    expect(sent).toEqual([]);

    await browser.activeScope(SW)!.dispatchSync("outbox");

    expect(sent).toEqual(["sent queued messages"]);
    expect(await sync.getTags()).toEqual([]);
  });

  it("a failing handler keeps the tag for the browser's retry, and the last chance's failure reaches the page", async () => {
    const { browser, page, sync } = await app(undefined, {
      outbox: () => {
        throw new Error("server down");
      },
    });
    await sync.register("outbox");
    const scope = browser.activeScope(SW)!;

    await expect(scope.dispatchSync("outbox")).rejects.toThrow();
    expect(await sync.getTags()).toEqual(["outbox"]);
    await expect(scope.dispatchSync("outbox", { lastChance: true })).rejects.toThrow();
    await browser.settled();

    expect(await sync.getTags()).toEqual([]);
    expect(page.received.filter((message) => (message as { type: string }).type === "error")).toEqual([
      { protocol: SW_PROTOCOL, type: "error", version: "v1", phase: "runtime", error: { name: "Error", message: "server down" } },
    ]);
  });

  it("without Background Sync the app is told, register resolves false, and the worker still starts", async () => {
    const sent: string[] = [];
    const { browser, sync } = await app({ backgroundSync: false }, { outbox: () => void sent.push("outbox") });
    expect(browser.versions(SW).active).toBe("activated");
    expect(await sync.isSupported()).toBe(false);
    expect(await sync.register("outbox")).toBe(false);
    expect(sent).toEqual([]);
  });
});
