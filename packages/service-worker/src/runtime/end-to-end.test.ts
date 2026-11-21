// The default worker (runtime) paired with the app-side services (root entry) on the in-memory browser: a worker
// built by defineWorker() from a config and hand-written asset manifests installs, serves offline, is offered to the
// app as an update by SwUpdates, takes over on activateUpdate(), and forwards pushes and clicks to SwPush.
import { afterEach, describe, expect, it } from "vitest";
import { createInjector, type Injector } from "@gablejs/core";
import { SW_PROTOCOL } from "../core/index.js";
import { createBrowser, type InMemoryBrowser, type WorkerScript } from "../testing/browser.js";
import type { Network } from "../testing/worker-scope.js";
import { provideServiceWorker, SERVICE_WORKER_CONTAINER, SwPush, SwRegistration, SwUpdates, type NotificationClick } from "../index.js";
import { type AssetManifest, defineWorker, type ServiceWorkerConfig } from "./index.js";

const SW = "https://app.test/sw.js";

/** gable.sw.json for a small app: its shell and bundles prefetched, images lazy, an API network-first. */
const config: ServiceWorkerConfig = {
  assetGroups: [
    { name: "app", installMode: "prefetch", files: ["/index.html", "/assets/**"] },
    { name: "images", installMode: "lazy", files: ["/images/**"] },
  ],
  dataGroups: [{ name: "api", urls: ["/api/**"], strategy: "freshness" }],
  navigationFallback: { url: "/index.html" },
};

/** The manifest of one release, as the Vite plugin would emit it: hashed bundle names change with the release. */
const release = (version: string): AssetManifest => ({
  version,
  files: ["/index.html", `/assets/app.${version}.js`, "/images/logo.png"],
});

/** The worker file of one release: the default worker, started with that release's manifest. */
const workerFile = (manifest: AssetManifest): WorkerScript => (self) => void defineWorker({ config }).start(self, manifest);

/** The origin's server: what it serves says which release is deployed. `online` false takes the network down. */
function server() {
  const state = { release: "v1", online: true, missing: undefined as string | undefined };
  const network: Network = (request) => {
    const { pathname } = new URL(request.url);
    if (!state.online) throw new TypeError(`Failed to fetch ${request.url}`);
    if (pathname === state.missing) return new Response("not found", { status: 404 });
    return new Response(`${pathname} ${state.release}`);
  };
  return { state, network };
}

const injectors: Injector[] = [];
afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
});

/** Opens a page and boots the app's injector on it, with the service worker enabled. */
function openApp(browser: InMemoryBrowser) {
  const page = browser.openPage("/");
  const injector = createInjector([
    ...provideServiceWorker({ url: "/sw.js", enabled: true }),
    { provide: SERVICE_WORKER_CONTAINER, useValue: page.container },
  ]);
  injectors.push(injector);
  return { page, injector, updates: injector.get(SwUpdates)!, registration: injector.get(SwRegistration)!, push: injector.get(SwPush)! };
}

/** A browser whose first visit installed release v1; the app opened next is controlled by it. */
async function visitedV1() {
  const { state, network } = server();
  const browser = createBrowser({ network });
  browser.deploy("/sw.js", workerFile(release("v1")));
  const first = openApp(browser);
  await first.registration.ready;
  await browser.settled();
  first.injector.destroy();
  first.page.close();
  return { browser, state };
}

/** The response the active worker gives a page for `url`. */
async function load(browser: InMemoryBrowser, url: string, init?: { mode?: RequestMode }) {
  const scope = browser.activeScope(SW);
  if (!scope) throw new Error("no active worker");
  return (await scope.dispatchFetch(url, init)).text();
}

describe("the default worker with the app-side services", () => {
  it("installs on the first visit without offering an update, and then serves the app offline", async () => {
    const { state, network } = server();
    const browser = createBrowser({ network });
    browser.deploy("/sw.js", workerFile(release("v1")));
    const app = openApp(browser);
    const versions: unknown[] = [];
    app.updates.versions.subscribe((v) => versions.push(v));
    await app.registration.ready;
    await browser.settled();

    expect(versions).toEqual([
      { protocol: SW_PROTOCOL, type: "version-ready", version: "v1" },
      { protocol: SW_PROTOCOL, type: "version-activated", version: "v1" },
    ]);
    expect(app.updates.updateAvailable()).toBe(false);
    state.online = false;
    expect(await load(browser, "/inbox/42", { mode: "navigate" })).toBe("/index.html v1");
    expect(await load(browser, "/assets/app.v1.js")).toBe("/assets/app.v1.js v1");
  });

  it("controls the registering page as soon as the first release is active, with no update offered along the way", async () => {
    const { state, network } = server();
    const browser = createBrowser({ network });
    browser.deploy("/sw.js", workerFile(release("v1")));
    const app = openApp(browser);
    const offered: boolean[] = [];
    const sample = () => offered.push(app.updates.updateAvailable());
    app.updates.versions.subscribe(sample);
    app.page.container.addEventListener("controllerchange", sample);
    let controllerChanges = 0;
    app.page.container.addEventListener("controllerchange", () => void controllerChanges++);

    await app.registration.ready;
    expect(app.registration.controlled).toBe(false); // the worker is still installing
    await browser.settled();

    expect(app.registration.controlled).toBe(true);
    expect(app.page.container.controller?.state).toBe("activated");
    expect(controllerChanges).toBe(1);
    expect(offered.length).toBeGreaterThanOrEqual(3); // both version events and the controller change
    expect(offered.every((available) => !available)).toBe(true);
    expect(app.updates.updateAvailable()).toBe(false);
    expect(await app.updates.checkForUpdate()).toBe(false);
    expect(await browser.activeScope(SW)!.clients.matchAll()).toHaveLength(1);

    state.online = false; // offline, on the first visit's page, with no reload
    expect(await load(browser, "/inbox/42", { mode: "navigate" })).toBe("/index.html v1");
  });

  it("does not claim for an update: a page of the running release changes controller once, on activateUpdate()", async () => {
    const { browser, state } = await visitedV1();
    const app = openApp(browser);
    await app.registration.ready;
    let controllerChanges = 0;
    app.page.container.addEventListener("controllerchange", () => void controllerChanges++);
    state.release = "v2";
    browser.deploy("/sw.js", workerFile(release("v2")));
    expect(await app.updates.checkForUpdate()).toBe(true);
    await browser.settled();
    expect(controllerChanges).toBe(0); // v2 installed and waits: nothing took over
    expect(app.updates.updateAvailable()).toBe(true);
    expect(await app.updates.activateUpdate()).toBe(true);
    await browser.settled();
    expect(controllerChanges).toBe(1);
    expect(app.updates.updateAvailable()).toBe(false);
  });

  it("a new release is offered through updateAvailable while the running one keeps serving its own files", async () => {
    const { browser, state } = await visitedV1();
    const app = openApp(browser);
    await app.registration.ready;
    expect(await load(browser, "/images/logo.png")).toBe("/images/logo.png v1");
    await browser.activeScope(SW)!.idle();

    state.release = "v2";
    browser.deploy("/sw.js", workerFile(release("v2")));
    expect(await app.updates.checkForUpdate()).toBe(true);
    expect(app.updates.updateAvailable()).toBe(true);
    await browser.settled();
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: "installed", active: "activated" });

    state.online = false;
    expect(await load(browser, "/", { mode: "navigate" })).toBe("/index.html v1");
    expect(await load(browser, "/assets/app.v1.js")).toBe("/assets/app.v1.js v1");
    expect(await load(browser, "/images/logo.png")).toBe("/images/logo.png v1");
  });

  it("activateUpdate() makes the new release take over, and the old release's caches are removed", async () => {
    const { browser, state } = await visitedV1();
    const app = openApp(browser);
    await app.registration.ready;
    await load(browser, "/images/logo.png");
    state.release = "v2";
    browser.deploy("/sw.js", workerFile(release("v2")));
    await app.updates.checkForUpdate();
    const versions: unknown[] = [];
    app.updates.versions.subscribe((v) => versions.push(v));

    expect(await app.updates.activateUpdate()).toBe(true);
    await browser.settled();
    expect(versions).toEqual([{ protocol: SW_PROTOCOL, type: "version-activated", version: "v2" }]);
    expect(app.updates.updateAvailable()).toBe(false);

    const scope = browser.activeScope(SW)!;
    expect(await scope.caches.keys()).toEqual(["gable-precache:v2"]);
    state.online = false;
    expect(await load(browser, "/settings", { mode: "navigate" })).toBe("/index.html v2");
    expect(await load(browser, "/assets/app.v2.js")).toBe("/assets/app.v2.js v2");
  });

  it("a release whose prefetch fails is never offered, and the running one stays in charge", async () => {
    const { browser, state } = await visitedV1();
    const app = openApp(browser);
    await app.registration.ready;
    state.release = "v2";
    state.missing = "/assets/app.v2.js";
    browser.deploy("/sw.js", workerFile(release("v2")));

    expect(await app.updates.checkForUpdate()).toBe(false);
    await browser.settled();
    expect(app.updates.updateAvailable()).toBe(false);
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: null, active: "activated" });
    state.online = false;
    expect(await load(browser, "/", { mode: "navigate" })).toBe("/index.html v1");
  });

  it("pushes and notification clicks reach SwPush", async () => {
    const { browser } = await visitedV1();
    const app = openApp(browser);
    await app.registration.ready;
    const payloads: unknown[] = [];
    const clicks: NotificationClick[] = [];
    app.push.messages.subscribe((data) => payloads.push(data));
    app.push.notificationClicks.subscribe((click) => clicks.push(click));
    const scope = browser.activeScope(SW)!;

    const payload = { notification: { title: "New mail", body: "From Ada", data: { url: "/mail/7" } } };
    await scope.dispatchPush(JSON.stringify(payload));
    const [shown] = await scope.registration.getNotifications();
    await scope.dispatchNotificationClick(shown!);
    await browser.settled();

    expect(payloads).toEqual([payload]);
    expect(clicks).toEqual([{ action: "", notification: { title: "New mail", body: "From Ada", tag: "", data: { url: "/mail/7" } } }]);
    expect(scope.clients.openedWindows).toEqual(["https://app.test/mail/7"]);
  });
});
