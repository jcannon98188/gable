// The in-memory browser's Background Sync model: the registration's sync manager as a page sees it, shared by every
// version of the worker, and its tags dispatched to the active version.
import { describe, expect, it } from "vitest";
import { backgroundSync, lifecycle } from "../core/index.js";
import { createBrowser, type InMemoryBrowserOptions } from "./browser.js";

const SW = "https://app.test/sw.js";

async function registered(options?: InMemoryBrowserOptions) {
  const browser = createBrowser(options);
  const synced: string[] = [];
  browser.deploy("/sw.js", (self) => {
    lifecycle(self, { version: "v1" });
    backgroundSync(self, { tag: "outbox", version: "v1", sync: () => void synced.push("outbox") });
  });
  const page = browser.openPage("/");
  const registration = await page.container.register("/sw.js");
  await browser.settled();
  return { browser, page, registration, synced };
}

describe("in-memory browser background sync model", () => {
  it("has no sync manager when the browser has no background sync, on the page and in the worker", async () => {
    const { browser, registration } = await registered({ backgroundSync: false });
    expect(registration.sync).toBeUndefined();
    expect(browser.activeScope(SW)!.registration.sync).toBeUndefined();
  });

  it("registers a tag the active worker's sync event then runs for, and lists it until it has synced", async () => {
    const { browser, registration, synced } = await registered();
    await registration.sync!.register("outbox");
    await registration.sync!.register("outbox");
    expect(await registration.sync!.getTags()).toEqual(["outbox"]);
    await browser.activeScope(SW)!.dispatchSync("outbox");
    expect(synced).toEqual(["outbox"]);
    expect(await registration.sync!.getTags()).toEqual([]);
  });

  it("refuses to register until the worker is active, as a browser does", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", (self) => lifecycle(self, { version: "v1", install: () => new Promise(() => {}) }));
    const page = browser.openPage("/");
    const registration = await page.container.register("/sw.js");
    await expect(registration.sync!.register("outbox")).rejects.toMatchObject({ name: "InvalidStateError" });
  });

  it("keeps the tags across worker versions, which share the registration", async () => {
    const { browser, registration } = await registered();
    await registration.sync!.register("outbox");
    const first = browser.activeScope(SW);
    browser.deploy("/sw.js", (self) => {
      lifecycle(self, { version: "v2" });
      void self.skipWaiting();
    });
    await registration.update();
    await browser.settled();
    expect(browser.activeScope(SW)).not.toBe(first);
    expect(await registration.sync!.getTags()).toEqual(["outbox"]);
    expect(await browser.activeScope(SW)!.registration.sync!.getTags()).toEqual(["outbox"]);
  });
});
