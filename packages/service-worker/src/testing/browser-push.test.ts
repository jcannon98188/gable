// The in-memory browser's push model: permission and prompt, pushManager, and the push service's delivery.
import { describe, expect, it } from "vitest";
import { lifecycle, onPush } from "../core/index.js";
import { createBrowser, type InMemoryBrowserOptions } from "./browser.js";

const SW = "https://app.test/sw.js";
const KEY = "AQIDBA";

async function registered(options?: InMemoryBrowserOptions) {
  const browser = createBrowser(options);
  const pushes: unknown[] = [];
  browser.deploy("/sw.js", (self) => {
    lifecycle(self, { version: "v1" });
    onPush(self, { version: "v1", handle: ({ data }) => void pushes.push(data) });
  });
  const page = browser.openPage("/");
  const registration = await page.container.register("/sw.js");
  return { browser, page, registration, pushes };
}

describe("in-memory browser push model", () => {
  it("has no pushManager when the browser has no push", async () => {
    const { registration } = await registered({ push: false });
    expect(registration.pushManager).toBeUndefined();
  });

  it("refuses to subscribe until the worker is active, as a browser does", async () => {
    const { browser, registration } = await registered({ notificationPermission: "granted" });
    await expect(registration.pushManager!.subscribe({ userVisibleOnly: true, applicationServerKey: KEY })).rejects.toMatchObject({
      name: "AbortError",
    });
    await browser.settled();
    await expect(registration.pushManager!.subscribe({ userVisibleOnly: true, applicationServerKey: KEY })).resolves.toMatchObject({
      endpoint: expect.stringContaining("https://push.test/"),
    });
  });

  it("asks the permission prompt when the permission is default, and refuses on a denied or dismissed one", async () => {
    for (const [answer, name] of [["denied", "NotAllowedError"], ["default", "NotAllowedError"]] as const) {
      const { browser, registration } = await registered({ permissionAnswer: answer });
      await browser.settled();
      await expect(registration.pushManager!.subscribe({ userVisibleOnly: true, applicationServerKey: KEY })).rejects.toMatchObject({ name });
      expect(browser.permission.prompts).toBe(1);
    }
    const granted = await registered({ permissionAnswer: "granted" });
    await granted.browser.settled();
    await granted.registration.pushManager!.subscribe({ userVisibleOnly: true, applicationServerKey: KEY });
    expect(granted.page.notifications.permission).toBe("granted");
  });

  it("requires an application server key", async () => {
    const { browser, registration } = await registered({ notificationPermission: "granted" });
    await browser.settled();
    await expect(registration.pushManager!.subscribe({ userVisibleOnly: true })).rejects.toMatchObject({ name: "InvalidAccessError" });
  });

  it("delivers a push to the active worker, and drops it once the permission is no longer granted", async () => {
    const { browser, registration, pushes } = await registered({ notificationPermission: "granted" });
    await browser.settled();
    const subscription = await registration.pushManager!.subscribe({ userVisibleOnly: true, applicationServerKey: KEY });

    expect(await browser.deliverPush(subscription.endpoint, "hello")).toBe(true);
    expect(pushes).toEqual(["hello"]);
    expect(browser.pushSubscriptions(SW)).toEqual([subscription.endpoint]);

    browser.permission.permission = "denied";
    expect(await browser.deliverPush(subscription.endpoint, "again")).toBe(false);
    expect(await browser.deliverPush("https://push.test/endpoint/unknown", "again")).toBe(false);
    expect(pushes).toEqual(["hello"]);
  });
});
