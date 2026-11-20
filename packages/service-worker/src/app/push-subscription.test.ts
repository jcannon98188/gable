// SwPush's subscription helper (service-worker/117): permission, subscribe, getSubscription and unsubscribe, driven through
// the package's root entry and DI against pages of the in-memory browser. The browser models pushManager, the
// notification permission and its prompt, so the flow is tested end to end with the worker's push handlers.
import { afterEach, describe, expect, it } from "vitest";
import { createInjector, type Injector } from "@gable/core";
import { lifecycle, onNotificationClick, onPush } from "../core/index.js";
import { createBrowser, type InMemoryBrowser, type InMemoryBrowserOptions, type InMemoryPage, type WorkerScript } from "../testing/browser.js";
import {
  provideServiceWorker,
  SERVICE_WORKER_CONTAINER,
  SERVICE_WORKER_NOTIFICATIONS,
  SwPush,
  SwRegistration,
  type NotificationClick,
  type NotificationsLike,
  type ServiceWorkerContainerLike,
} from "../index.js";

const SW = "https://app.test/sw.js";
const KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

const worker: WorkerScript = (self) => {
  const version = "v1";
  lifecycle(self, { version });
  onPush(self, {
    version,
    handle: ({ data, showNotification }) => {
      const mail = data as { id: number; from: string };
      return showNotification("New mail", { body: `From ${mail.from}`, tag: "mail", data: { id: mail.id } });
    },
  });
  onNotificationClick(self, {
    version,
    handle: async ({ notification, openWindow }) => {
      await openWindow(`/mail/${(notification.data as { id: number }).id}`);
    },
  });
};

const injectors: Injector[] = [];
afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
});

interface AppOptions {
  /** The browser's behaviour: permission, what the user answers the prompt, push support. */
  browser?: InMemoryBrowserOptions;
  /** Whether the app registers the worker. Defaults to true. */
  enabled?: boolean;
  /** Replaces the page's `Notification`; `null` is a browser without it. */
  notifications?: NotificationsLike | null;
  /** Replaces the page's `navigator.serviceWorker`; `null` is a browser without it. */
  container?: ServiceWorkerContainerLike | null;
  /** Wait for the worker to activate before returning. Defaults to true. */
  settle?: boolean;
}

async function app(options: AppOptions = {}) {
  const browser: InMemoryBrowser = createBrowser(options.browser);
  browser.deploy("/sw.js", worker);
  const page: InMemoryPage = browser.openPage("/");
  const injector = createInjector([
    ...provideServiceWorker({ url: "/sw.js", enabled: options.enabled ?? true }),
    { provide: SERVICE_WORKER_CONTAINER, useValue: options.container === undefined ? page.container : options.container },
    { provide: SERVICE_WORKER_NOTIFICATIONS, useValue: options.notifications === undefined ? page.notifications : options.notifications },
  ]);
  injectors.push(injector);
  const push = injector.get(SwPush)!;
  await injector.get(SwRegistration)!.ready;
  if (options.settle ?? true) await browser.settled();
  return { browser, page, injector, push };
}

describe("SwPush.subscribe", () => {
  it("asks for permission, subscribes and gives the subscription to send to the server", async () => {
    const { browser, push } = await app();
    expect(push.permission()).toBe("default");

    const result = await push.subscribe({ applicationServerKey: KEY });

    expect(result.status).toBe("subscribed");
    if (result.status !== "subscribed") return;
    expect(push.permission()).toBe("granted");
    expect(result.subscription.endpoint).toMatch(/^https:\/\/push\.test\//);
    expect(result.subscription.toJSON().keys).toEqual({ p256dh: expect.any(String), auth: expect.any(String) });
    expect(await push.getSubscription()).toBe(result.subscription);
    expect(browser.pushSubscriptions(SW)).toEqual([result.subscription.endpoint]);
  });

  it("receives pushes the server sends to that subscription, and notification clicks, through the worker's handlers", async () => {
    const { browser, push } = await app();
    const payloads: unknown[] = [];
    const clicks: NotificationClick[] = [];
    push.messages.subscribe((data) => payloads.push(data));
    push.notificationClicks.subscribe((click) => clicks.push(click));
    const result = await push.subscribe({ applicationServerKey: KEY });
    if (result.status !== "subscribed") throw new Error("not subscribed");

    await browser.deliverPush(result.subscription.endpoint, JSON.stringify({ id: 7, from: "Ada" }));
    await browser.settled();

    expect(payloads).toEqual([{ id: 7, from: "Ada" }]);
    const scope = browser.activeScope(SW)!;
    const [shown] = await scope.registration.getNotifications();
    expect(shown?.title).toBe("New mail");
    await scope.dispatchNotificationClick(shown!);
    await browser.settled();
    expect(clicks.map((c) => c.notification.data)).toEqual([{ id: 7 }]);
  });

  it("passes userVisibleOnly: true unless the app says otherwise, which the browser then refuses as a failure", async () => {
    const { push } = await app();
    const refused = await push.subscribe({ applicationServerKey: KEY, userVisibleOnly: false });
    expect(refused.status).toBe("failed");
    if (refused.status === "failed") expect((refused.error as Error).name).toBe("NotSupportedError");
    expect((await push.subscribe({ applicationServerKey: KEY })).status).toBe("subscribed");
  });

  it("accepts the key as bytes, and returns the existing subscription for the same key", async () => {
    const { push } = await app();
    const first = await push.subscribe({ applicationServerKey: "AQIDBA" }); // the bytes 1, 2, 3, 4
    const second = await push.subscribe({ applicationServerKey: Uint8Array.of(1, 2, 3, 4) });
    expect(second.status === "subscribed" && first.status === "subscribed" && second.subscription === first.subscription).toBe(true);
  });

  it("reports a different key than the existing subscription used as a failure, until the app unsubscribes", async () => {
    const { push } = await app();
    await push.subscribe({ applicationServerKey: KEY });
    const other = await push.subscribe({ applicationServerKey: "AQIDBQ" });
    expect(other.status).toBe("failed");
    if (other.status === "failed") expect((other.error as Error).name).toBe("InvalidStateError");
    expect(await push.unsubscribe()).toBe(true);
    expect((await push.subscribe({ applicationServerKey: "AQIDBQ" })).status).toBe("subscribed");
  });

  it("waits for a worker that is still installing to become active", async () => {
    const { browser, push } = await app({ settle: false });
    expect(browser.activeScope(SW)).toBeNull();
    const result = await push.subscribe({ applicationServerKey: KEY });
    expect(result.status).toBe("subscribed");
    expect(browser.activeScope(SW)).not.toBeNull();
  });
});

describe("SwPush.subscribe outcomes", () => {
  it("denied: the user denies the prompt; the app is not told by an exception, and the permission signal follows", async () => {
    const { browser, push } = await app({ browser: { permissionAnswer: "denied" } });
    expect(await push.subscribe({ applicationServerKey: KEY })).toEqual({ status: "denied" });
    expect(push.permission()).toBe("denied");
    expect(browser.pushSubscriptions(SW)).toEqual([]);
  });

  it("denied: an already denied permission is reported without asking again", async () => {
    const { browser, push } = await app({ browser: { notificationPermission: "denied" } });
    expect(push.permission()).toBe("denied");
    expect(await push.subscribe({ applicationServerKey: KEY })).toEqual({ status: "denied" });
    expect(browser.permission.prompts).toBe(0);
  });

  it("dismissed: a prompt closed without an answer leaves the permission default, and the app may ask again", async () => {
    const { browser, push } = await app({ browser: { permissionAnswer: "default" } });
    expect(await push.subscribe({ applicationServerKey: KEY })).toEqual({ status: "dismissed" });
    expect(push.permission()).toBe("default");
    browser.permission.answer = "granted";
    expect((await push.subscribe({ applicationServerKey: KEY })).status).toBe("subscribed");
    expect(browser.permission.prompts).toBe(2);
  });

  it("unsupported: a browser without PushManager", async () => {
    const { push } = await app({ browser: { push: false } });
    expect(await push.subscribe({ applicationServerKey: KEY })).toEqual({ status: "unsupported" });
    expect(await push.getSubscription()).toBeNull();
    expect(await push.unsubscribe()).toBe(false);
  });

  it("unsupported: a browser without notifications; the permission reads unsupported", async () => {
    const { push } = await app({ notifications: null });
    expect(push.permission()).toBe("unsupported");
    expect(await push.subscribe({ applicationServerKey: KEY })).toEqual({ status: "unsupported" });
    expect(await push.requestPermission()).toBe("unsupported");
  });

  it("unsupported: a browser without service workers", async () => {
    const { push } = await app({ container: null });
    expect(await push.subscribe({ applicationServerKey: KEY })).toEqual({ status: "unsupported" });
    expect(await push.getSubscription()).toBeNull();
  });

  it("unavailable: no worker is registered, as in development", async () => {
    const { browser, push } = await app({ enabled: false });
    expect(await push.subscribe({ applicationServerKey: KEY })).toEqual({ status: "unavailable" });
    expect(await push.getSubscription()).toBeNull();
    expect(browser.permission.prompts).toBe(0);
  });

  it("denied, not failed: a permission revoked while subscribing", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", worker);
    const page = browser.openPage("/");
    const container: ServiceWorkerContainerLike = {
      ...page.container,
      register: async (url, options) => {
        const registration = await page.container.register(url, options);
        return {
          pushManager: {
            getSubscription: async () => null,
            subscribe: async () => {
              browser.permission.permission = "denied";
              throw Object.assign(new Error("permission denied"), { name: "NotAllowedError" });
            },
          },
          get installing() {
            return registration.installing;
          },
          get waiting() {
            return registration.waiting;
          },
          get active() {
            return registration.active;
          },
          update: () => registration.update(),
        };
      },
    };
    const injector = createInjector([
      ...provideServiceWorker({ url: "/sw.js", enabled: true }),
      { provide: SERVICE_WORKER_CONTAINER, useValue: container },
      { provide: SERVICE_WORKER_NOTIFICATIONS, useValue: page.notifications },
    ]);
    injectors.push(injector);
    const push = injector.get(SwPush)!;
    await injector.get(SwRegistration)!.ready;
    await browser.settled();
    browser.permission.permission = "granted";

    expect(await push.subscribe({ applicationServerKey: KEY })).toEqual({ status: "denied" });
    expect(push.permission()).toBe("denied");
  });
});

describe("SwPush permission, getSubscription and unsubscribe", () => {
  it("requestPermission asks once and resolves with the answer", async () => {
    const { browser, push } = await app();
    expect(await push.requestPermission()).toBe("granted");
    expect(await push.requestPermission()).toBe("granted");
    expect(browser.permission.prompts).toBe(1);
    expect(push.permission()).toBe("granted");
  });

  it("the permission signal picks up a change made in the browser's settings on the next call", async () => {
    const { browser, push } = await app({ browser: { notificationPermission: "granted" } });
    expect(push.permission()).toBe("granted");
    browser.permission.permission = "denied";
    expect(push.permission()).toBe("granted");
    await push.getSubscription();
    expect(push.permission()).toBe("denied");
  });

  it("getSubscription is null before subscribing and does not ask for the permission", async () => {
    const { browser, push } = await app();
    expect(await push.getSubscription()).toBeNull();
    expect(browser.permission.prompts).toBe(0);
  });

  it("unsubscribe cancels the subscription: it resolves true once, the push service forgets the endpoint, and later pushes are not delivered", async () => {
    const { browser, push } = await app();
    const result = await push.subscribe({ applicationServerKey: KEY });
    if (result.status !== "subscribed") throw new Error("not subscribed");
    const payloads: unknown[] = [];
    push.messages.subscribe((data) => payloads.push(data));

    expect(await push.unsubscribe()).toBe(true);
    expect(await push.getSubscription()).toBeNull();
    expect(await push.unsubscribe()).toBe(false);
    expect(await browser.deliverPush(result.subscription.endpoint, JSON.stringify({ id: 1, from: "Ada" }))).toBe(false);
    await browser.settled();
    expect(payloads).toEqual([]);
  });

  it("a subscription found after a reload is the one subscribe made", async () => {
    const { browser, push } = await app();
    const result = await push.subscribe({ applicationServerKey: KEY });
    const reopened = browser.openPage("/");
    const injector = createInjector([
      ...provideServiceWorker({ url: "/sw.js", enabled: true }),
      { provide: SERVICE_WORKER_CONTAINER, useValue: reopened.container },
      { provide: SERVICE_WORKER_NOTIFICATIONS, useValue: reopened.notifications },
    ]);
    injectors.push(injector);
    const found = await injector.get(SwPush)!.getSubscription();
    expect(found?.endpoint).toBe(result.status === "subscribed" ? result.subscription.endpoint : null);
  });
});
