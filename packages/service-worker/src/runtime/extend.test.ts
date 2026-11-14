// defineWorker's extension point and the default worker's push and notification-click behaviour, on the in-memory
// worker scope.
import { describe, expect, it } from "vitest";
import { backgroundSync, networkOnly, SW_PROTOCOL } from "../core/index.js";
import { createWorkerScope, type Network, offline } from "../testing/worker-scope.js";
import { type AssetManifest, defineWorker, type ServiceWorkerConfig, type WorkerExtendContext, type WorkerExtension } from "./index.js";

const network: Network = (request) => new Response(`network ${new URL(request.url).pathname}`);
const manifest: AssetManifest = { version: "v1", files: ["/index.html", "/app.js"] };
const config: ServiceWorkerConfig = {
  assetGroups: [{ name: "app", files: ["/**"] }],
  dataGroups: [{ name: "api", urls: ["/api/**"], strategy: "performance" }],
  navigationFallback: { url: "/index.html" },
};

async function started(extend?: (context: WorkerExtendContext) => WorkerExtension | void) {
  const scope = createWorkerScope({ network });
  const stop = defineWorker({ config, extend }).start(scope, manifest);
  await scope.install();
  await scope.activate();
  return { scope, stop };
}

const text = async (response: Promise<Response>) => (await response).text();

describe("defineWorker({ extend })", () => {
  it("extension routes are tried before the declarative ones", async () => {
    const { scope } = await started(({ router }) => {
      router.route("/api/live/*", networkOnly());
      router.route("/app.js", () => new Response("custom app.js"));
      router.route("/health", () => new Response("ok"), { method: "*" });
    });
    scope.network = offline;
    expect(await text(scope.dispatchFetch("/app.js"))).toBe("custom app.js");
    expect(await text(scope.dispatchFetch("/health", { method: "POST" }))).toBe("ok");
    expect(await text(scope.dispatchFetch("/index.html"))).toBe("network /index.html"); // declarative routes still answer
    scope.network = network;
    await text(scope.dispatchFetch("/api/live/feed"));
    await scope.idle();
    expect(await (await scope.caches.open("gable-data:api")).keys()).toEqual([]);
  });

  it("is called once per start with the worker's version, config, manifest, scope and precache", async () => {
    const contexts: WorkerExtendContext[] = [];
    const { scope } = await started((context) => void contexts.push(context));
    expect(contexts).toHaveLength(1);
    const [context] = contexts;
    expect(context!.version).toBe("v1");
    expect(context!.manifest).toEqual(manifest);
    expect(context!.config.navigationFallback).toEqual({ url: "/index.html" });
    expect(context!.self).toBe(scope);
    expect(context!.precache.cacheName).toBe("gable-precache:v1");
    expect(context!.precache.has("/app.js")).toBe(true);
  });

  it("an install hook runs after the precache is complete, and its failure fails the install and is reported", async () => {
    const seen: (string | undefined)[] = [];
    const ok = createWorkerScope({ network });
    defineWorker({
      config,
      extend: ({ precache }) => ({
        install: async () => void seen.push(await (await precache.match(new Request("https://app.test/app.js")))?.text()),
      }),
    }).start(ok, manifest);
    await ok.install();
    expect(seen).toEqual(["network /app.js"]);

    const failing = createWorkerScope({ network });
    const page = failing.connectClient("/");
    defineWorker({ config, extend: () => ({ install: () => Promise.reject(new Error("migration failed")) }) }).start(failing, manifest);
    await expect(failing.install()).rejects.toThrow("migration failed");
    expect(page.messages).toEqual([
      { protocol: SW_PROTOCOL, type: "error", version: "v1", phase: "install", error: { name: "Error", message: "migration failed" } },
    ]);
  });

  it("activate and update hooks run at their steps, after the declarative work", async () => {
    const log: string[] = [];
    const scope = createWorkerScope({ network });
    await (await scope.caches.open("gable-lazy:v0")).put("/old.png", new Response("old"));
    defineWorker({
      config,
      extend: ({ self }) => ({
        activate: async () => void log.push(`activate, caches ${(await self.caches.keys()).join(" ")}`),
        update: ({ version }) => void log.push(`update ${version}`),
      }),
    }).start(scope, manifest);
    await scope.install();
    await scope.dispatchMessage({ protocol: SW_PROTOCOL, type: "activate-update" });
    expect(scope.skippedWaiting).toBe(true);
    await scope.activate();
    expect(log).toEqual(["update v1", "activate, caches gable-precache:v1"]);
  });

  it("handlers added with core's API run alongside the declarative ones", async () => {
    const synced: string[] = [];
    let sync: { register(): Promise<boolean> } | undefined;
    const { scope } = await started(({ self, version }) => {
      sync = backgroundSync(self, { tag: "outbox", version, sync: ({ tag }) => void synced.push(tag) });
    });
    expect(await sync!.register()).toBe(true);
    await scope.dispatchSync("outbox");
    expect(synced).toEqual(["outbox"]);
  });

  it("the function start() returns stops the whole worker, extension routes included", async () => {
    const { scope, stop } = await started(({ router }) => void router.route("/custom", () => new Response("custom")));
    stop();
    expect(await text(scope.dispatchFetch("/custom"))).toBe("network /custom");
    scope.network = offline;
    await expect(scope.dispatchFetch("/app.js")).rejects.toThrow(TypeError);
  });
});

describe("push and notification clicks", () => {
  it("shows the notification a push payload carries, and forwards the push to the app", async () => {
    const { scope } = await started();
    const page = scope.connectClient("/");
    const payload = { notification: { title: "New mail", body: "From Ada", tag: "mail", data: { url: "/mail/7" } }, id: 7 };
    await scope.dispatchPush(JSON.stringify(payload));
    const [shown] = await scope.registration.getNotifications();
    expect({ title: shown?.title, body: shown?.body, tag: shown?.tag, data: shown?.data }).toEqual({
      title: "New mail",
      body: "From Ada",
      tag: "mail",
      data: { url: "/mail/7" },
    });
    expect(page.messages).toEqual([{ protocol: SW_PROTOCOL, type: "push", version: "v1", data: payload }]);
  });

  it("a push without a notification is only forwarded", async () => {
    const { scope } = await started();
    const page = scope.connectClient("/");
    await scope.dispatchPush(JSON.stringify({ unread: 3 }));
    await scope.dispatchPush("plain text");
    await scope.dispatchPush(JSON.stringify({ notification: { body: "no title" } }));
    expect(await scope.registration.getNotifications()).toEqual([]);
    expect(page.messages.map((m) => (m as { data: unknown }).data)).toEqual([{ unread: 3 }, "plain text", { notification: { body: "no title" } }]);
  });

  it("a click on a notification opens its data.url, closes it and is forwarded to the app", async () => {
    const { scope } = await started();
    const page = scope.connectClient("/");
    await scope.dispatchPush(JSON.stringify({ notification: { title: "New mail", data: { url: "/mail/7" } } }));
    const [shown] = await scope.registration.getNotifications();
    await scope.dispatchNotificationClick(shown!);
    expect(scope.clients.openedWindows).toEqual(["https://app.test/mail/7"]);
    expect(await scope.registration.getNotifications()).toEqual([]);
    expect(page.messages.at(-1)).toEqual({
      protocol: SW_PROTOCOL,
      type: "notification-click",
      version: "v1",
      action: "",
      notification: { title: "New mail", body: "", tag: "", data: { url: "/mail/7" } },
    });
  });

  it("an action button click, or a notification without data.url, opens nothing", async () => {
    const { scope } = await started();
    await scope.dispatchPush(JSON.stringify({ notification: { title: "A", tag: "a", data: { url: "/a" }, actions: [{ action: "archive", title: "Archive" }] } }));
    await scope.dispatchPush(JSON.stringify({ notification: { title: "B", tag: "b" } }));
    const [a, b] = await scope.registration.getNotifications();
    await scope.dispatchNotificationClick(a!, { action: "archive" });
    await scope.dispatchNotificationClick(b!);
    expect(scope.clients.openedWindows).toEqual([]);
  });

  it("extension push and click handlers replace the defaults; forwarding stays", async () => {
    const handled: unknown[] = [];
    const { scope } = await started(() => ({
      push: ({ data, showNotification }) => showNotification(`custom ${(data as { n: number }).n}`),
      notificationClick: ({ notification }) => void handled.push(notification.title),
    }));
    const page = scope.connectClient("/");
    await scope.dispatchPush(JSON.stringify({ n: 1, notification: { title: "default", data: { url: "/x" } } }));
    const shown = await scope.registration.getNotifications();
    expect(shown.map((n) => n.title)).toEqual(["custom 1"]);
    await scope.dispatchNotificationClick(shown[0]!);
    expect(handled).toEqual(["custom 1"]);
    expect(scope.clients.openedWindows).toEqual([]);
    expect(page.messages.map((m) => (m as { type: string }).type)).toEqual(["push", "notification-click"]);
  });
});
