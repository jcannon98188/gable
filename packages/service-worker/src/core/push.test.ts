// Push and notification-click handlers (service-worker/111), driven through the in-memory worker scope.
import { describe, expect, it } from "vitest";
import { createWorkerScope } from "../testing/worker-scope.js";
import { onNotificationClick, onPush } from "./index.js";

/** An activated in-memory scope with one open page, as a worker that receives pushes is. */
async function activeScope() {
  const scope = createWorkerScope();
  await scope.install();
  await scope.activate();
  const page = scope.connectClient("/inbox");
  return { scope, page };
}

describe("onPush", () => {
  it("hands the handler the parsed JSON payload and waits for it before the push event ends", async () => {
    const { scope } = await activeScope();
    const order: string[] = [];
    onPush(scope, {
      version: "v1",
      handle: async ({ data }) => {
        await new Promise((r) => setTimeout(r, 5));
        order.push(`handled ${JSON.stringify(data)}`);
      },
    });
    await scope.dispatchPush(JSON.stringify({ unread: 3 }));
    order.push("push done");
    expect(order).toEqual(['handled {"unread":3}', "push done"]);
  });

  it("decodes a text payload as text and a push without one as null, and keeps the raw message data", async () => {
    const { scope } = await activeScope();
    const seen: unknown[] = [];
    onPush(scope, { version: "v1", handle: ({ data, message }) => void seen.push(data, message?.text() ?? null) });
    await scope.dispatchPush("ping");
    await scope.dispatchPush(null);
    expect(seen).toEqual(["ping", "ping", null, null]);
  });

  it("forwards each push to every window client as the protocol's push message", async () => {
    const { scope, page } = await activeScope();
    const uncontrolled = scope.connectClient("/other", { controlled: false });
    onPush(scope, { version: "v1" });
    await scope.dispatchPush(JSON.stringify({ unread: 3 }));
    const push = { protocol: "gable-sw@1", type: "push", version: "v1", data: { unread: 3 } };
    expect(page.messages).toEqual([push]);
    expect(uncontrolled.messages).toEqual([push]);
  });

  it("does not forward when forward is false", async () => {
    const { scope, page } = await activeScope();
    onPush(scope, { version: "v1", forward: false });
    await scope.dispatchPush("ping");
    expect(page.messages).toEqual([]);
  });

  it("lets the handler show a notification, which the push event waits for", async () => {
    const { scope } = await activeScope();
    onPush(scope, {
      version: "v1",
      handle: ({ data, showNotification }) => {
        const { from } = data as { from: string };
        void showNotification("New mail", { body: `From ${from}`, tag: "mail", data: { id: 7 } });
      },
    });
    await scope.dispatchPush(JSON.stringify({ from: "Ada" }));
    const shown = await scope.registration.getNotifications();
    expect(shown.map(({ title, body, tag, data }) => ({ title, body, tag, data }))).toEqual([
      { title: "New mail", body: "From Ada", tag: "mail", data: { id: 7 } },
    ]);
  });

  it("a failing handler fails the push event and reports a runtime error to the app", async () => {
    const { scope, page } = await activeScope();
    onPush(scope, {
      version: "v1",
      handle: () => {
        throw new TypeError("bad payload");
      },
    });
    await expect(scope.dispatchPush("x")).rejects.toThrow("bad payload");
    expect(page.messages).toContainEqual({
      protocol: "gable-sw@1",
      type: "error",
      version: "v1",
      phase: "runtime",
      error: { name: "TypeError", message: "bad payload" },
    });
  });

  it("returns a function that stops handling pushes", async () => {
    const { scope, page } = await activeScope();
    const stop = onPush(scope, { version: "v1" });
    stop();
    await scope.dispatchPush("ping");
    expect(page.messages).toEqual([]);
  });
});

describe("onNotificationClick", () => {
  async function shown(scope: Awaited<ReturnType<typeof activeScope>>["scope"]) {
    await scope.registration.showNotification("New mail", { body: "From Ada", tag: "mail", data: { id: 7 }, actions: [{ action: "archive", title: "Archive" }] });
    const [notification] = await scope.registration.getNotifications();
    return notification!;
  }

  it("runs the handler with the clicked action and notification, closes the notification and waits for the handler", async () => {
    const { scope } = await activeScope();
    const seen: unknown[] = [];
    onNotificationClick(scope, {
      version: "v1",
      handle: async ({ action, notification }) => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push({ action, title: notification.title, data: notification.data });
      },
    });
    await scope.dispatchNotificationClick(await shown(scope), { action: "archive" });
    expect(seen).toEqual([{ action: "archive", title: "New mail", data: { id: 7 } }]);
    expect(await scope.registration.getNotifications()).toEqual([]);
  });

  it("keeps the notification open when keepOpen is set", async () => {
    const { scope } = await activeScope();
    onNotificationClick(scope, { version: "v1", keepOpen: true });
    await scope.dispatchNotificationClick(await shown(scope));
    expect(await scope.registration.getNotifications()).toHaveLength(1);
  });

  it("forwards the click to every window client as the protocol's notification-click message", async () => {
    const { scope, page } = await activeScope();
    onNotificationClick(scope, { version: "v1" });
    await scope.dispatchNotificationClick(await shown(scope), { action: "archive" });
    expect(page.messages).toEqual([
      {
        protocol: "gable-sw@1",
        type: "notification-click",
        version: "v1",
        action: "archive",
        notification: { title: "New mail", body: "From Ada", tag: "mail", data: { id: 7 } },
      },
    ]);
  });

  it("forwards a notification without body, tag or data with the protocol's empty values", async () => {
    const { scope, page } = await activeScope();
    onNotificationClick(scope, { version: "v1" });
    await scope.registration.showNotification("Hello");
    const [notification] = await scope.registration.getNotifications();
    await scope.dispatchNotificationClick(notification!);
    expect(page.messages).toEqual([
      expect.objectContaining({ type: "notification-click", notification: { title: "Hello", body: "", tag: "", data: null } }),
    ]);
  });

  it("does not forward when forward is false", async () => {
    const { scope, page } = await activeScope();
    onNotificationClick(scope, { version: "v1", forward: false });
    await scope.dispatchNotificationClick(await shown(scope));
    expect(page.messages).toEqual([]);
  });

  it("lets the handler open a window while it handles the click", async () => {
    const { scope } = await activeScope();
    onNotificationClick(scope, {
      version: "v1",
      handle: async ({ notification, openWindow }) => {
        const { id } = notification.data as { id: number };
        await openWindow(`/mail/${id}`);
      },
    });
    await scope.dispatchNotificationClick(await shown(scope));
    const windows = await scope.clients.matchAll({ includeUncontrolled: true });
    expect(windows.map((client) => client.url)).toContain("https://app.test/mail/7");
  });

  it("a failing handler fails the click event and reports a runtime error to the app", async () => {
    const { scope, page } = await activeScope();
    onNotificationClick(scope, {
      version: "v1",
      handle: () => Promise.reject(new Error("no route")),
    });
    await expect(scope.dispatchNotificationClick(await shown(scope))).rejects.toThrow("no route");
    expect(page.messages).toContainEqual(expect.objectContaining({ type: "error", phase: "runtime", error: { name: "Error", message: "no route" } }));
  });

  it("returns a function that stops handling clicks", async () => {
    const { scope, page } = await activeScope();
    const stop = onNotificationClick(scope, { version: "v1" });
    stop();
    await scope.dispatchNotificationClick(await shown(scope));
    expect(page.messages).toEqual([]);
  });
});
