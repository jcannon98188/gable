import { describe, expect, it } from "vitest";
import type { WorkerScope } from "../core/index.js";
import { createWorkerScope } from "./worker-scope.js";

describe("in-memory worker scope: message events", () => {
  it("delivers a page's message to worker code written against core, with its source client", async () => {
    const received: { data: unknown; from: string | undefined }[] = [];
    function worker(self: WorkerScope) {
      self.addEventListener("message", (event) => received.push({ data: event.data, from: event.source?.id }));
    }
    const scope = createWorkerScope();
    const tab = scope.connectClient("/");
    worker(scope);
    await scope.install();
    await scope.dispatchMessage({ hello: "worker" }, { source: tab });
    expect(received).toEqual([{ data: { hello: "worker" }, from: tab.id }]);
  });

  it("delivers a structured clone, not the object the page posted", async () => {
    const scope = createWorkerScope();
    let seen: unknown;
    scope.addEventListener("message", (event) => {
      seen = event.data;
    });
    const sent = { n: 1 };
    await scope.install();
    await scope.dispatchMessage(sent);
    expect(seen).toEqual(sent);
    expect(seen).not.toBe(sent);
  });

  it("a message without a source client has a null source", async () => {
    const scope = createWorkerScope();
    let source: unknown = "unset";
    scope.addEventListener("message", (event) => {
      source = event.source;
    });
    await scope.dispatchMessage("ping");
    expect(source).toBeNull();
  });

  it("waits for the message event's waitUntil promises and rejects with the first failure", async () => {
    const scope = createWorkerScope();
    const order: string[] = [];
    scope.addEventListener("message", (event) => {
      event.waitUntil(new Promise((r) => setTimeout(r, 5)).then(() => order.push("handled")));
    });
    await scope.dispatchMessage("go");
    order.push("dispatched");
    expect(order).toEqual(["handled", "dispatched"]);

    scope.addEventListener("message", (event) => event.waitUntil(Promise.reject(new Error("handler failed"))));
    await expect(scope.dispatchMessage("go")).rejects.toThrow("handler failed");
  });

  it("a waiting (installed) worker receives messages, as a waiting worker does in the browser", async () => {
    const scope = createWorkerScope();
    let calls = 0;
    scope.addEventListener("message", () => void calls++);
    await scope.install();
    expect(scope.state).toBe("installed");
    await scope.dispatchMessage("activate please");
    expect(calls).toBe(1);
  });

  it("a redundant worker does not receive messages", async () => {
    const scope = createWorkerScope();
    scope.addEventListener("install", (event) => event.waitUntil(Promise.reject(new Error("boom"))));
    await expect(scope.install()).rejects.toThrow("boom");
    await expect(scope.dispatchMessage("hi")).rejects.toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });
});
