// The app-side services (service-worker/113), driven through the package's root entry and DI, against pages of an in-memory
// browser whose workers run on the in-memory worker scope. Workers are built two ways: on core's lifecycle(), as the
// default worker is, and as a custom worker on createAppChannel() alone, which proves the services rely on the
// message protocol and nothing else.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInjector, ErrorHandler, type Injector } from "@gable/core";
import { createAppChannel, lifecycle, SW_PROTOCOL, type WorkerScope } from "../core/index.js";
import { createBrowser, type InMemoryBrowser, type InMemoryPage, type WorkerScript } from "../testing/browser.js";
import {
  provideServiceWorker,
  SERVICE_WORKER_CONTAINER,
  SwPush,
  SwRegistration,
  SwUpdates,
  type ServiceWorkerOptions,
} from "../index.js";

const SW = "https://app.test/sw.js";

/** A worker built on core's lifecycle(), as the default worker is. `log` records the update hook's calls. */
function lifecycleWorker(version: string, hooks: { log?: string[]; failUpdate?: boolean; failInstall?: boolean } = {}): WorkerScript {
  return (self) => {
    lifecycle(self, {
      version,
      install: () => {
        if (hooks.failInstall) throw new Error("precache failed");
      },
      update: ({ requestedBy }) => {
        hooks.log?.push(`update ${version} for ${requestedBy?.url ?? "nobody"}`);
        if (hooks.failUpdate) throw new TypeError("migration failed");
      },
    });
  };
}

/** A custom worker written against core's message channel alone, without lifecycle(). */
function customWorker(version: string): WorkerScript {
  return (self) => {
    const channel = createAppChannel(self);
    self.addEventListener("install", (event) => event.waitUntil(channel.broadcast({ protocol: SW_PROTOCOL, type: "version-ready", version })));
    self.addEventListener("activate", (event) =>
      event.waitUntil(channel.broadcast({ protocol: SW_PROTOCOL, type: "version-activated", version })),
    );
    channel.onRequest((request) => (request.type === "activate-update" ? self.skipWaiting() : undefined));
  };
}

interface App {
  page: InMemoryPage;
  injector: Injector;
  updates: SwUpdates;
  registration: SwRegistration;
}

const injectors: Injector[] = [];

/** Opens a page and bootstraps the app's injector on it with the service worker providers. */
function openApp(browser: InMemoryBrowser, options: Partial<ServiceWorkerOptions> = { enabled: true }, extra: unknown[] = []): App {
  const page = browser.openPage("/");
  const injector = createInjector([
    ...provideServiceWorker({ url: "/sw.js", ...options }),
    { provide: SERVICE_WORKER_CONTAINER, useValue: page.container },
    ...(extra as never[]),
  ]);
  injectors.push(injector);
  return { page, injector, updates: injector.get(SwUpdates)!, registration: injector.get(SwRegistration)! };
}

/** A browser that served `script` to an earlier visit, so the app opened next is controlled by it. */
async function visited(script: WorkerScript): Promise<InMemoryBrowser> {
  const browser = createBrowser();
  browser.deploy("/sw.js", script);
  const first = openApp(browser);
  await first.registration.ready;
  await browser.settled();
  first.injector.destroy();
  first.page.close();
  return browser;
}

afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
  vi.unstubAllGlobals();
});

describe("SwRegistration: registers only in production builds", () => {
  it("does nothing in a development build, so HMR is unaffected", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", lifecycleWorker("v1"));
    const app = openApp(browser, {});
    expect(app.registration.enabled).toBe(false);
    expect(await app.registration.ready).toBeNull();
    await browser.settled();
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: null, active: null });
    expect(await app.updates.checkForUpdate()).toBe(false);
    expect(await app.updates.activateUpdate()).toBe(false);
  });

  it("registers the worker in a production build (__GABLE_DEV__ is false)", async () => {
    vi.stubGlobal("__GABLE_DEV__", false);
    const browser = createBrowser();
    browser.deploy("/sw.js", lifecycleWorker("v1"));
    const app = openApp(browser, {});
    expect(app.registration.enabled).toBe(true);
    const registration = await app.registration.ready;
    expect(registration).not.toBeNull();
    expect(app.registration.registration()).toBe(registration);
    await browser.settled();
    expect(browser.versions(SW).active).toBe("activated");
  });

  it("enabled overrides the build: false never registers, true registers in development", async () => {
    vi.stubGlobal("__GABLE_DEV__", false);
    const browser = createBrowser();
    browser.deploy("/sw.js", lifecycleWorker("v1"));
    expect(await openApp(browser, { enabled: false }).registration.ready).toBeNull();
    vi.unstubAllGlobals();
    expect(await openApp(browser, { enabled: true }).registration.ready).not.toBeNull();
  });

  it("does nothing where the browser has no service worker support", async () => {
    const injector = createInjector([...provideServiceWorker({ url: "/sw.js", enabled: true }), { provide: SERVICE_WORKER_CONTAINER, useValue: null }]);
    injectors.push(injector);
    const updates = injector.get(SwUpdates)!;
    expect(await injector.get(SwRegistration)!.ready).toBeNull();
    expect(updates.updateAvailable()).toBe(false);
    expect(await updates.checkForUpdate()).toBe(false);
  });

  it("reports a failed registration to the ErrorHandler and resolves ready with null", async () => {
    const handled: unknown[] = [];
    const browser = createBrowser(); // nothing deployed: the script is a 404
    const app = openApp(browser, { enabled: true }, [{ provide: ErrorHandler, useValue: { handleError: (e: unknown) => handled.push(e) } }]);
    expect(await app.registration.ready).toBeNull();
    expect(handled).toEqual([expect.any(TypeError)]);
  });

  it("tells you to provide the options when they are missing", () => {
    const injector = createInjector([]);
    injectors.push(injector);
    expect(() => injector.get(SwRegistration)).toThrow(/provideServiceWorker/);
  });
});

describe.each([
  ["a worker built on lifecycle()", lifecycleWorker],
  ["a custom worker built on createAppChannel()", customWorker],
])("SwUpdates with %s", (_name, worker) => {
  it("does not offer the first install as an update: the page has no controlling worker yet", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", worker("v1"));
    const app = openApp(browser);
    const versions: unknown[] = [];
    const availableWhenReady: boolean[] = [];
    app.updates.versions.subscribe((v) => {
      versions.push(v);
      if (v.type === "version-ready") availableWhenReady.push(app.updates.updateAvailable());
    });
    await app.registration.ready;
    await browser.settled();
    expect(availableWhenReady).toEqual([false]);
    expect(versions).toEqual([
      { protocol: SW_PROTOCOL, type: "version-ready", version: "v1" },
      { protocol: SW_PROTOCOL, type: "version-activated", version: "v1" },
    ]);
    expect(app.updates.updateAvailable()).toBe(false);
  });

  it("checkForUpdate() finds a new version, which raises updateAvailable", async () => {
    const browser = await visited(worker("v1"));
    const app = openApp(browser);
    await app.registration.ready;
    expect(await app.updates.checkForUpdate()).toBe(false);
    expect(app.updates.updateAvailable()).toBe(false);

    browser.deploy("/sw.js", worker("v2"));
    const versions: unknown[] = [];
    app.updates.versions.subscribe((v) => versions.push(v));
    expect(await app.updates.checkForUpdate()).toBe(true);
    expect(app.updates.updateAvailable()).toBe(true);
    expect(versions).toEqual([{ protocol: SW_PROTOCOL, type: "version-ready", version: "v2" }]);
    await browser.settled(); // the browser moves the version to the waiting slot after it reports ready
    expect(browser.versions(SW).waiting).toBe("installed");
  });

  it("activateUpdate() has the waiting version take over and clears updateAvailable", async () => {
    const browser = await visited(worker("v1"));
    const app = openApp(browser);
    await app.registration.ready;
    browser.deploy("/sw.js", worker("v2"));
    await app.updates.checkForUpdate();
    let controllerChanges = 0;
    app.page.container.addEventListener("controllerchange", () => void controllerChanges++);
    const versions: unknown[] = [];
    app.updates.versions.subscribe((v) => versions.push(v));

    expect(await app.updates.activateUpdate()).toBe(true);
    expect(versions).toEqual([{ protocol: SW_PROTOCOL, type: "version-activated", version: "v2" }]);
    expect(app.updates.updateAvailable()).toBe(false);
    await browser.settled();
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: null, active: "activated" });
    expect(controllerChanges).toBe(1);
    expect(await app.updates.activateUpdate()).toBe(false); // nothing waits any more
  });

  it("a page opened while a version waits sees updateAvailable once registered", async () => {
    const browser = await visited(worker("v1"));
    browser.deploy("/sw.js", worker("v2"));
    const other = openApp(browser);
    await other.registration.ready;
    await other.updates.checkForUpdate();
    await browser.settled();

    const app = openApp(browser);
    expect(app.updates.updateAvailable()).toBe(false);
    await app.registration.ready;
    expect(app.updates.updateAvailable()).toBe(true);
  });

  it("every open tab learns of an update found by one of them", async () => {
    const browser = await visited(worker("v1"));
    const a = openApp(browser);
    const b = openApp(browser);
    await Promise.all([a.registration.ready, b.registration.ready]);
    browser.deploy("/sw.js", worker("v2"));
    await a.updates.checkForUpdate();
    await browser.settled();
    expect(b.updates.updateAvailable()).toBe(true);

    await a.updates.activateUpdate();
    await browser.settled();
    expect(b.updates.updateAvailable()).toBe(false); // b is now controlled by the new version too
  });

  it("checkForUpdate() is false on a page no worker controls: the new version takes over at once", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", worker("v1"));
    const app = openApp(browser); // a first visit: v1 activates, but this page stays uncontrolled
    await app.registration.ready;
    await browser.settled();
    browser.deploy("/sw.js", worker("v2"));
    expect(await app.updates.checkForUpdate()).toBe(false);
    await browser.settled();
    expect(app.updates.updateAvailable()).toBe(false);
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: null, active: "activated" });
  });
});

describe("SwUpdates: failures", () => {
  it("checkForUpdate() is false when the new version fails to install, and the old one stays", async () => {
    const browser = await visited(lifecycleWorker("v1"));
    const app = openApp(browser);
    await app.registration.ready;
    browser.deploy("/sw.js", lifecycleWorker("v2", { failInstall: true }));
    expect(await app.updates.checkForUpdate()).toBe(false);
    expect(app.updates.updateAvailable()).toBe(false);
  });

  it("checkForUpdate() is false when the new version fails to install without telling the app", async () => {
    const browser = await visited(lifecycleWorker("v1"));
    const app = openApp(browser);
    await app.registration.ready;
    browser.deploy("/sw.js", (self) => self.addEventListener("install", (e) => e.waitUntil(Promise.reject(new Error("bad")))));
    expect(await app.updates.checkForUpdate()).toBe(false);
  });

  it("checkForUpdate() settles when the new version installs without sending version-ready", async () => {
    const browser = await visited(lifecycleWorker("v1"));
    const app = openApp(browser);
    await app.registration.ready;
    browser.deploy("/sw.js", () => {}); // a custom worker that never speaks the protocol
    vi.useFakeTimers();
    try {
      let outcome: boolean | "pending" = "pending";
      void app.updates.checkForUpdate().then((ready) => (outcome = ready));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(outcome).toBe(true); // the registration's waiting slot holds the new version
      expect(app.updates.updateAvailable()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("checkForUpdate() rejects when the worker script cannot be fetched", async () => {
    const browser = await visited(lifecycleWorker("v1"));
    const app = openApp(browser);
    await app.registration.ready;
    browser.scripts.clear();
    await expect(app.updates.checkForUpdate()).rejects.toThrow(TypeError);
  });

  it("activateUpdate() rejects with the worker's error when its update hook fails, and the version keeps waiting", async () => {
    const browser = await visited(lifecycleWorker("v1"));
    const app = openApp(browser);
    await app.registration.ready;
    browser.deploy("/sw.js", lifecycleWorker("v2", { failUpdate: true }));
    await app.updates.checkForUpdate();
    await expect(app.updates.activateUpdate()).rejects.toThrow(expect.objectContaining({ name: "TypeError", message: "migration failed" }));
    expect(app.updates.updateAvailable()).toBe(true);
    expect(browser.versions(SW).waiting).toBe("installed");
  });

  it("activateUpdate() tells the worker which page asked", async () => {
    const log: string[] = [];
    const browser = await visited(lifecycleWorker("v1"));
    const app = openApp(browser);
    await app.registration.ready;
    browser.deploy("/sw.js", lifecycleWorker("v2", { log }));
    await app.updates.checkForUpdate();
    await app.updates.activateUpdate();
    expect(log).toEqual(["update v2 for https://app.test/"]);
  });
});

describe("SwPush: push and notification-click events", () => {
  /** A worker that keeps its scope, so the test can forward push events from it as service-worker/111's handler will. */
  function pushWorker(scopes: WorkerScope[]): WorkerScript {
    return (self) => {
      scopes.push(self);
      customWorker("v1")(self);
    };
  }

  it("exposes the worker's push and notification-click messages as Observables", async () => {
    const scopes: WorkerScope[] = [];
    const browser = await visited(pushWorker(scopes));
    const app = openApp(browser);
    await app.registration.ready;
    const push = app.injector.get(SwPush)!;
    const payloads: unknown[] = [];
    const clicks: unknown[] = [];
    push.messages.subscribe((data) => payloads.push(data));
    push.notificationClicks.subscribe((click) => clicks.push(click));

    const channel = createAppChannel(scopes[0]!);
    const notification = { title: "New mail", body: "From Ada", tag: "mail", data: { id: 7 } };
    await channel.broadcast({ protocol: SW_PROTOCOL, type: "push", version: "v1", data: { unread: 3 } });
    await channel.broadcast({ protocol: SW_PROTOCOL, type: "notification-click", version: "v1", action: "open", notification });
    await channel.broadcast({ protocol: SW_PROTOCOL, type: "version-ready", version: "v1" });
    await browser.settled();

    expect(payloads).toEqual([{ unread: 3 }]);
    expect(clicks).toEqual([{ action: "open", notification }]);
  });

  it("ignores messages that are not protocol messages, and stops listening when the injector is destroyed", async () => {
    const scopes: WorkerScope[] = [];
    const browser = await visited(pushWorker(scopes));
    const app = openApp(browser);
    await app.registration.ready;
    const payloads: unknown[] = [];
    app.injector.get(SwPush)!.messages.subscribe((data) => payloads.push(data));
    const clients = await scopes[0]!.clients.matchAll();
    for (const client of clients) client.postMessage({ type: "push", data: "not ours" });
    await browser.settled();
    expect(payloads).toEqual([]);

    app.injector.destroy();
    await createAppChannel(scopes[0]!).broadcast({ protocol: SW_PROTOCOL, type: "push", version: "v1", data: "late" });
    await browser.settled();
    expect(payloads).toEqual([]);
  });
});
