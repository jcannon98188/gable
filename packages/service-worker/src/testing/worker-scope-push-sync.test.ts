// The in-memory worker scope's push, notification and background sync events (service-worker/111): the browser rules the
// core handlers' tests rely on.
import { describe, expect, it } from "vitest";
import { createWorkerScope } from "./worker-scope.js";

async function activeScope(options?: Parameters<typeof createWorkerScope>[0]) {
  const scope = createWorkerScope(options);
  await scope.install();
  await scope.activate();
  return scope;
}

describe("in-memory scope: push events", () => {
  it("only an activated worker receives pushes, clicks and syncs", async () => {
    const scope = createWorkerScope();
    await expect(scope.dispatchPush("x")).rejects.toThrow("does not receive push events");
    await scope.registration.showNotification("Hi");
    const [notification] = await scope.registration.getNotifications();
    await expect(scope.dispatchNotificationClick(notification!)).rejects.toThrow("does not receive notification clicks");
    await scope.registration.sync!.register("t");
    await expect(scope.dispatchSync("t")).rejects.toThrow("does not receive sync events");
  });

  it("gives the push event text, JSON and bytes of the payload, or null data without one", async () => {
    const scope = await activeScope();
    const seen: unknown[] = [];
    scope.addEventListener("push", (event) => {
      seen.push(event.data && [event.data.text(), event.data.json(), new Uint8Array(event.data.arrayBuffer()).length]);
    });
    await scope.dispatchPush('{"a":1}');
    await scope.dispatchPush(new Uint8Array([0x22, 0xc3, 0xa9, 0x22]).buffer);
    await scope.dispatchPush();
    expect(seen).toEqual([['{"a":1}', { a: 1 }, 7], ['"é"', "é", 4], null]);
  });

  it("waits for the push event's extensions and rejects with their failure", async () => {
    const scope = await activeScope();
    scope.addEventListener("push", (event) => event.waitUntil(Promise.reject(new Error("boom"))));
    await expect(scope.dispatchPush("x")).rejects.toThrow("boom");
  });
});

describe("in-memory scope: notifications", () => {
  it("records shown notifications with defaults, cloned data and actions; a tag replaces its predecessor", async () => {
    const scope = await activeScope();
    const data = { id: 1 };
    await scope.registration.showNotification("One", { tag: "mail", data, actions: [{ action: "archive", title: "Archive" }] });
    data.id = 2;
    await scope.registration.showNotification("Plain");
    let shown = await scope.registration.getNotifications();
    expect(shown.map((n) => [n.title, n.body, n.tag, n.data, n.actions])).toEqual([
      ["One", "", "mail", { id: 1 }, [{ action: "archive", title: "Archive" }]],
      ["Plain", "", "", null, []],
    ]);
    await scope.registration.showNotification("Two", { tag: "mail" });
    shown = await scope.registration.getNotifications({ tag: "mail" });
    expect(shown.map((n) => n.title)).toEqual(["Two"]);
    shown[0]!.close();
    expect((await scope.registration.getNotifications()).map((n) => n.title)).toEqual(["Plain"]);
  });

  it("allows openWindow only while a notification click is handled", async () => {
    const scope = await activeScope();
    await expect(scope.clients.openWindow("/late")).rejects.toThrow("only allowed while handling a notification click");
    await scope.registration.showNotification("Hi");
    const [notification] = await scope.registration.getNotifications();
    const opened: unknown[] = [];
    scope.addEventListener("notificationclick", (event) => {
      expect(event.action).toBe("reply");
      expect(event.notification).toBe(notification);
      event.waitUntil(
        (async () => {
          await new Promise((r) => setTimeout(r, 1));
          const same = await scope.clients.openWindow("/inbox");
          const other = await scope.clients.openWindow("https://elsewhere.test/");
          opened.push(same?.url, same?.type, other);
        })(),
      );
    });
    await scope.dispatchNotificationClick(notification!, { action: "reply" });
    expect(opened).toEqual(["https://app.test/inbox", "window", null]);
    expect(scope.clients.openedWindows).toEqual(["https://app.test/inbox", "https://elsewhere.test/"]);
    await expect(scope.clients.openWindow("/after")).rejects.toThrow("only allowed");
  });
});

describe("in-memory scope: background sync", () => {
  it("dispatches only registered tags; success drops the tag, a failure keeps it unless it was the last chance", async () => {
    const scope = await activeScope();
    const sync = scope.registration.sync!;
    await expect(scope.dispatchSync("outbox")).rejects.toThrow('no background sync is registered for "outbox"');
    let fail = true;
    const seen: unknown[] = [];
    scope.addEventListener("sync", (event) => {
      seen.push([event.tag, event.lastChance]);
      if (fail) event.waitUntil(Promise.reject(new TypeError("offline")));
    });
    await sync.register("outbox");
    await sync.register("outbox");
    expect(await sync.getTags()).toEqual(["outbox"]);
    await expect(scope.dispatchSync("outbox")).rejects.toThrow("offline");
    expect(await sync.getTags()).toEqual(["outbox"]);
    await expect(scope.dispatchSync("outbox", { lastChance: true })).rejects.toThrow("offline");
    expect(await sync.getTags()).toEqual([]);
    fail = false;
    await sync.register("outbox");
    await scope.dispatchSync("outbox");
    expect(await sync.getTags()).toEqual([]);
    expect(seen).toEqual([
      ["outbox", false],
      ["outbox", true],
      ["outbox", false],
    ]);
  });

  it("models a browser without background sync", async () => {
    const scope = await activeScope({ backgroundSync: false });
    expect(scope.registration.sync).toBeUndefined();
    await expect(scope.dispatchSync("outbox")).rejects.toThrow("no background sync");
  });
});
