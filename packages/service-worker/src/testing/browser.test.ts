import { describe, expect, it } from "vitest";
import type { WorkerScope } from "../core/index.js";
import { createBrowser } from "./browser.js";

const SW = "https://app.test/sw.js";

/** A worker that posts its name to every window on install and skips waiting when asked with "skip". */
const worker = (name: string) => (self: WorkerScope) => {
  self.addEventListener("install", (event) =>
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) => clients.forEach((c) => c.postMessage(`${name} installed`))),
    ),
  );
  self.addEventListener("message", (event) => {
    if (event.data === "skip") event.waitUntil(self.skipWaiting());
  });
};

describe("in-memory browser", () => {
  it("installs and activates a first version straight away, leaving the registering page uncontrolled", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", worker("v1"));
    const page = browser.openPage("/");
    const registration = await page.container.register("/sw.js");
    expect(registration.installing?.state).toBe("installing");
    await browser.settled();
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: null, active: "activated" });
    expect(page.container.controller).toBeNull();
    expect(page.received).toEqual(["v1 installed"]);
    expect(browser.openPage("/").container.controller?.state).toBe("activated");
  });

  it("keeps a changed script waiting until it skips waiting, then switches controlled pages to it", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", worker("v1"));
    await browser.openPage().container.register("/sw.js");
    await browser.settled();

    const page = browser.openPage();
    const v1 = page.container.controller;
    let controllerChanges = 0;
    page.container.addEventListener("controllerchange", () => void controllerChanges++);
    const registration = await page.container.register("/sw.js");
    await registration.update();
    await browser.settled();
    expect(browser.versions(SW).waiting).toBeNull(); // same script: nothing to install

    browser.deploy("/sw.js", worker("v2"));
    await registration.update();
    await browser.settled();
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: "installed", active: "activated" });
    expect(page.received).toEqual(["v2 installed"]);

    registration.waiting!.postMessage("skip");
    await browser.settled();
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: null, active: "activated" });
    expect(v1?.state).toBe("redundant");
    expect(page.container.controller).toBe(registration.active);
    expect(controllerChanges).toBe(1);
  });

  it("activates a new version at once when no page is controlled by the active one, and when the last one closes", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", worker("v1"));
    const registration = await browser.openPage().container.register("/sw.js");
    await browser.settled();
    browser.deploy("/sw.js", worker("v2"));
    await registration.update();
    await browser.settled();
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: null, active: "activated" });
    expect(registration.active?.state).toBe("activated");

    const controlled = browser.openPage();
    browser.deploy("/sw.js", worker("v3"));
    await registration.update();
    await browser.settled();
    expect(browser.versions(SW).waiting).toBe("installed");
    controlled.close();
    await browser.settled();
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: null, active: "activated" });
  });

  it("rejects update() when the script is gone, as a 404 does", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", worker("v1"));
    const registration = await browser.openPage().container.register("/sw.js");
    browser.scripts.clear();
    await expect(registration.update()).rejects.toThrow(TypeError);
  });

  it("a version whose install fails becomes redundant and the previous one stays in charge", async () => {
    const browser = createBrowser();
    browser.deploy("/sw.js", worker("v1"));
    const registration = await browser.openPage().container.register("/sw.js");
    await browser.settled();
    browser.deploy("/sw.js", (self) => self.addEventListener("install", (e) => e.waitUntil(Promise.reject(new Error("no")))));
    await registration.update();
    const installing = registration.installing;
    await browser.settled();
    expect(installing?.state).toBe("redundant");
    expect(browser.versions(SW)).toEqual({ installing: null, waiting: null, active: "activated" });
  });

  it("every worker version of the origin shares its Cache storage", async () => {
    const storing = (name: string) => (self: WorkerScope) => {
      self.addEventListener("install", (event) => event.waitUntil(self.caches.open(name)));
    };
    const browser = createBrowser();
    browser.deploy("/sw.js", storing("v1"));
    const page = browser.openPage("/");
    await page.container.register("/sw.js");
    await browser.settled();
    browser.deploy("/sw.js", storing("v2"));
    await (await page.container.register("/sw.js")).update();
    await browser.settled();
    expect(await browser.activeScope(SW)!.caches.keys()).toEqual(["v1", "v2"]);
  });
});
