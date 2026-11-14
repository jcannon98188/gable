import { describe, expect, it } from "vitest";
import { createWorkerScope } from "../testing/worker-scope.js";
import {
  type AppToWorkerMessage,
  createAppChannel,
  isAppToWorkerMessage,
  isWorkerToAppMessage,
  SW_PROTOCOL,
  type WorkerToAppMessage,
} from "./index.js";

describe("protocol", () => {
  it("the protocol marker is gable-sw@1", () => {
    // Pinned literally: the app side and custom workers depend on this value, so changing it is a breaking change.
    expect(SW_PROTOCOL).toBe("gable-sw@1");
  });

  it("recognises each worker-to-app message", () => {
    const messages: WorkerToAppMessage[] = [
      { protocol: "gable-sw@1", type: "version-ready", version: "v2" },
      { protocol: "gable-sw@1", type: "version-activated", version: "v2" },
      { protocol: "gable-sw@1", type: "error", version: "v2", phase: "install", error: { name: "TypeError", message: "offline" } },
    ];
    for (const message of messages) expect(isWorkerToAppMessage(message)).toBe(true);
  });

  it("rejects messages that are not the protocol's", () => {
    const others: unknown[] = [
      null,
      "version-ready",
      { type: "version-ready", version: "v2" },
      { protocol: "gable-sw@0", type: "version-ready", version: "v2" },
      { protocol: "gable-sw@1", type: "version-detected", version: "v2" },
      { protocol: "gable-sw@1", type: "version-ready" },
      { protocol: "gable-sw@1", type: "error", version: "v2", phase: "install" },
      { protocol: "gable-sw@1", type: "error", version: "v2", phase: "fetch", error: { name: "E", message: "m" } },
      { protocol: "gable-sw@1", type: "activate-update" },
    ];
    for (const other of others) expect(isWorkerToAppMessage(other), JSON.stringify(other)).toBe(false);
  });

  it("recognises the app's activate-update request and nothing else", () => {
    const request: AppToWorkerMessage = { protocol: "gable-sw@1", type: "activate-update" };
    expect(isAppToWorkerMessage(request)).toBe(true);
    expect(isAppToWorkerMessage({ type: "activate-update" })).toBe(false);
    expect(isAppToWorkerMessage({ protocol: "gable-sw@1", type: "version-ready", version: "v2" })).toBe(false);
    expect(isAppToWorkerMessage(undefined)).toBe(false);
  });
});

describe("app channel", () => {
  it("broadcasts to every window client, including pages the worker does not control yet", async () => {
    const scope = createWorkerScope();
    const controlled = scope.connectClient("/a", { controlled: true });
    const uncontrolled = scope.connectClient("/b", { controlled: false });
    const sharedWorker = scope.connectClient("/w.js", { type: "sharedworker" });
    const channel = createAppChannel(scope);
    await channel.broadcast({ protocol: SW_PROTOCOL, type: "version-ready", version: "v2" });
    const expected = [{ protocol: "gable-sw@1", type: "version-ready", version: "v2" }];
    expect(controlled.messages).toEqual(expected);
    expect(uncontrolled.messages).toEqual(expected);
    expect(sharedWorker.messages).toEqual([]);
  });

  it("reports an error as a structured-cloneable error event for a phase", async () => {
    const scope = createWorkerScope();
    const tab = scope.connectClient("/");
    const channel = createAppChannel(scope);
    await channel.reportError("v2", "runtime", new RangeError("quota exceeded"));
    await channel.reportError("v2", "install", "not an Error");
    expect(tab.messages).toEqual([
      { protocol: "gable-sw@1", type: "error", version: "v2", phase: "runtime", error: { name: "RangeError", message: "quota exceeded" } },
      { protocol: "gable-sw@1", type: "error", version: "v2", phase: "install", error: { name: "Error", message: "not an Error" } },
    ]);
    expect(tab.messages.every(isWorkerToAppMessage)).toBe(true);
  });

  it("hands a listener only protocol requests from the app, with the event", async () => {
    const scope = createWorkerScope();
    const tab = scope.connectClient("/");
    const channel = createAppChannel(scope);
    const seen: { type: string; from: string | undefined }[] = [];
    channel.onRequest((request, event) => void seen.push({ type: request.type, from: event.source?.id }));
    await scope.dispatchMessage({ some: "app message" }, { source: tab });
    await scope.dispatchMessage({ protocol: SW_PROTOCOL, type: "activate-update" }, { source: tab });
    expect(seen).toEqual([{ type: "activate-update", from: tab.id }]);
  });

  it("keeps the message event alive until the request listener's promise settles", async () => {
    const scope = createWorkerScope();
    const channel = createAppChannel(scope);
    const order: string[] = [];
    channel.onRequest(() => new Promise<void>((r) => setTimeout(r, 5)).then(() => void order.push("handled")));
    await scope.dispatchMessage({ protocol: SW_PROTOCOL, type: "activate-update" });
    order.push("dispatched");
    expect(order).toEqual(["handled", "dispatched"]);
  });

  it("a request listener can be removed", async () => {
    const scope = createWorkerScope();
    const channel = createAppChannel(scope);
    let calls = 0;
    const stop = channel.onRequest(() => void calls++);
    stop();
    await scope.dispatchMessage({ protocol: SW_PROTOCOL, type: "activate-update" });
    expect(calls).toBe(0);
  });
});
