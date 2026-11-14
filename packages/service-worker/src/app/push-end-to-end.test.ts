// The worker's push and notification-click handlers (core, TASK-106.4) paired with the app's SwPush (TASK-106.6):
// a worker built on onPush and onNotificationClick runs on the in-memory browser, and an app page's SwPush
// Observables receive what the handlers forward, through the message protocol alone.
import { afterEach, describe, expect, it } from "vitest";
import { createInjector, type Injector } from "@gable/core";
import { lifecycle, onNotificationClick, onPush } from "../core/index.js";
import { createBrowser, type WorkerScript } from "../testing/browser.js";
import { provideServiceWorker, SERVICE_WORKER_CONTAINER, SwPush, SwRegistration, type NotificationClick } from "../index.js";

const SW = "https://app.test/sw.js";

/** A worker as an app would write it: lifecycle hooks, a push that shows a notification, a click that opens a page. */
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
    handle: async ({ action, notification, openWindow }) => {
      if (action === "") await openWindow(`/mail/${(notification.data as { id: number }).id}`);
    },
  });
};

const injectors: Injector[] = [];
afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
});

async function app() {
  const browser = createBrowser();
  browser.deploy("/sw.js", worker);
  const page = browser.openPage("/");
  const injector = createInjector([
    ...provideServiceWorker({ url: "/sw.js", enabled: true }),
    { provide: SERVICE_WORKER_CONTAINER, useValue: page.container },
  ]);
  injectors.push(injector);
  await injector.get(SwRegistration)!.ready;
  await browser.settled();
  const scope = browser.activeScope(SW);
  if (!scope) throw new Error("the worker did not activate");
  return { browser, scope, push: injector.get(SwPush)! };
}

describe("push and notification clicks, worker to app", () => {
  it("a push reaches SwPush.messages, and the worker shows its notification", async () => {
    const { browser, scope, push } = await app();
    const payloads: unknown[] = [];
    push.messages.subscribe((data) => payloads.push(data));

    await scope.dispatchPush(JSON.stringify({ id: 7, from: "Ada" }));
    await browser.settled();

    expect(payloads).toEqual([{ id: 7, from: "Ada" }]);
    const [shown] = await scope.registration.getNotifications();
    expect({ title: shown?.title, body: shown?.body }).toEqual({ title: "New mail", body: "From Ada" });
  });

  it("a click on that notification reaches SwPush.notificationClicks, and the worker opens the mail", async () => {
    const { browser, scope, push } = await app();
    const clicks: NotificationClick[] = [];
    push.notificationClicks.subscribe((click) => clicks.push(click));
    await scope.dispatchPush(JSON.stringify({ id: 7, from: "Ada" }));
    const [shown] = await scope.registration.getNotifications();

    await scope.dispatchNotificationClick(shown!);
    await browser.settled();

    expect(clicks).toEqual([{ action: "", notification: { title: "New mail", body: "From Ada", tag: "mail", data: { id: 7 } } }]);
    expect(scope.clients.openedWindows).toEqual(["https://app.test/mail/7"]);
    expect(await scope.registration.getNotifications()).toEqual([]);
  });
});
