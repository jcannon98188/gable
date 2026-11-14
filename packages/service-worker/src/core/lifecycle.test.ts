import { describe, expect, it } from "vitest";
import { createWorkerScope } from "../testing/worker-scope.js";
import { lifecycle, SW_PROTOCOL, type UpdateContext, type WorkerScope } from "./index.js";

const ready = (version: string) => ({ protocol: "gable-sw@1", type: "version-ready", version });
const activated = (version: string) => ({ protocol: "gable-sw@1", type: "version-activated", version });
const activateUpdate = { protocol: SW_PROTOCOL, type: "activate-update" } as const;

describe("lifecycle: install", () => {
  it("runs the install hook with the version and finishes installing only once it settles", async () => {
    const scope = createWorkerScope();
    const order: string[] = [];
    lifecycle(scope, {
      version: "v1",
      install: async ({ version }) => {
        await new Promise((r) => setTimeout(r, 5));
        order.push(`install ${version}`);
      },
    });
    await scope.install();
    order.push(scope.state);
    expect(order).toEqual(["install v1", "installed"]);
  });

  it("tells every window client the version is ready once the install hook has finished", async () => {
    const scope = createWorkerScope();
    const oldPage = scope.connectClient("/", { controlled: true });
    let installed = false;
    lifecycle(scope, {
      version: "v2",
      install: async () => {
        await scope.caches.open("v2");
        expect(oldPage.messages).toEqual([]);
        installed = true;
      },
    });
    await scope.install();
    expect(installed).toBe(true);
    expect(oldPage.messages).toEqual([ready("v2")]);
  });

  it("does not skip waiting: an update waits for the app to ask for it", async () => {
    const scope = createWorkerScope();
    lifecycle(scope, { version: "v2" });
    await scope.install();
    expect(scope.skippedWaiting).toBe(false);
  });

  it("a failing install hook fails the install and sends an install error instead of version-ready", async () => {
    const scope = createWorkerScope();
    const page = scope.connectClient("/");
    lifecycle(scope, {
      version: "v2",
      install: () => {
        throw new TypeError("Failed to fetch /app.js");
      },
    });
    await expect(scope.install()).rejects.toThrow("Failed to fetch /app.js");
    expect(scope.state).toBe("redundant");
    expect(page.messages).toEqual([
      { protocol: "gable-sw@1", type: "error", version: "v2", phase: "install", error: { name: "TypeError", message: "Failed to fetch /app.js" } },
    ]);
  });
});

describe("lifecycle: activate", () => {
  it("runs the activate hook, then tells clients the version is active", async () => {
    const scope = createWorkerScope();
    const page = scope.connectClient("/");
    const seen: string[] = [];
    lifecycle(scope, {
      version: "v1",
      activate: async ({ version }) => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(`activate ${version}`);
        expect(page.messages).toEqual([ready("v1")]);
      },
    });
    await scope.install();
    await scope.activate();
    expect(seen).toEqual(["activate v1"]);
    expect(page.messages).toEqual([ready("v1"), activated("v1")]);
  });

  it("a failing activate hook sends an activate error and fails the step", async () => {
    const scope = createWorkerScope();
    const page = scope.connectClient("/");
    lifecycle(scope, {
      version: "v1",
      activate: () => Promise.reject(new Error("cache cleanup failed")),
    });
    await scope.install();
    await expect(scope.activate()).rejects.toThrow("cache cleanup failed");
    expect(page.messages.at(-1)).toEqual({
      protocol: "gable-sw@1",
      type: "error",
      version: "v1",
      phase: "activate",
      error: { name: "Error", message: "cache cleanup failed" },
    });
  });
});

describe("lifecycle: update (app-controlled activation)", () => {
  it("on the app's activate-update request, runs the update hook with the requesting client, then skips waiting", async () => {
    const scope = createWorkerScope();
    const page = scope.connectClient("/", { controlled: true });
    const contexts: UpdateContext[] = [];
    lifecycle(scope, {
      version: "v2",
      update: async (context) => {
        await new Promise((r) => setTimeout(r, 5));
        expect(scope.skippedWaiting).toBe(false);
        contexts.push(context);
      },
    });
    await scope.install();
    await scope.dispatchMessage(activateUpdate, { source: page });
    expect(contexts).toEqual([{ version: "v2", requestedBy: page }]);
    expect(scope.skippedWaiting).toBe(true);

    // The browser now activates the waiting worker; the app hears that the new version is in charge.
    await scope.activate();
    expect(page.messages).toEqual([ready("v2"), activated("v2")]);
  });

  it("skips waiting on activate-update without an update hook", async () => {
    const scope = createWorkerScope();
    lifecycle(scope, { version: "v2" });
    await scope.install();
    await scope.dispatchMessage(activateUpdate);
    expect(scope.skippedWaiting).toBe(true);
  });

  it("ignores messages that are not protocol requests", async () => {
    const scope = createWorkerScope();
    lifecycle(scope, { version: "v2" });
    await scope.install();
    await scope.dispatchMessage({ type: "activate-update" });
    await scope.dispatchMessage("SKIP_WAITING");
    expect(scope.skippedWaiting).toBe(false);
  });

  it("a failing update hook sends an update error and keeps the version waiting", async () => {
    const scope = createWorkerScope();
    const page = scope.connectClient("/", { controlled: true });
    lifecycle(scope, {
      version: "v2",
      update: () => {
        throw new Error("could not flush outbox");
      },
    });
    await scope.install();
    await expect(scope.dispatchMessage(activateUpdate, { source: page })).rejects.toThrow("could not flush outbox");
    expect(scope.skippedWaiting).toBe(false);
    expect(page.messages.at(-1)).toEqual({
      protocol: "gable-sw@1",
      type: "error",
      version: "v2",
      phase: "update",
      error: { name: "Error", message: "could not flush outbox" },
    });
  });
});

describe("lifecycle: disposal and composition", () => {
  it("the returned function removes every hook", async () => {
    const scope = createWorkerScope();
    const page = scope.connectClient("/");
    let calls = 0;
    const stop = lifecycle(scope, { version: "v1", install: () => void calls++, activate: () => void calls++, update: () => void calls++ });
    stop();
    await scope.install();
    await scope.dispatchMessage(activateUpdate);
    await scope.activate();
    expect(calls).toBe(0);
    expect(page.messages).toEqual([]);
    expect(scope.skippedWaiting).toBe(false);
  });

  it("is written against core's WorkerScope, so it composes with a worker's own listeners", async () => {
    function worker(self: WorkerScope) {
      lifecycle(self, { version: "v1", install: () => self.caches.open("v1").then(() => undefined) });
      self.addEventListener("fetch", (event) => event.respondWith(new Response("from worker")));
    }
    const scope = createWorkerScope();
    worker(scope);
    await scope.install();
    await scope.activate();
    expect(await scope.caches.has("v1")).toBe(true);
    expect(await (await scope.dispatchFetch("/")).text()).toBe("from worker");
  });
});
