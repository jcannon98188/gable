// The push and notification-click messages: what a worker forwards to open pages so the app side's SwPush service
// can expose them (service-worker/113). The worker side that sends them is service-worker/111's push handler.
import { describe, expect, it } from "vitest";
import { isWorkerToAppMessage, SW_PROTOCOL } from "./index.js";

describe("protocol: push and notification-click messages", () => {
  it("accepts a push message with any structured-cloneable payload", () => {
    for (const data of [{ title: "New mail" }, "plain text", null]) {
      expect(isWorkerToAppMessage({ protocol: SW_PROTOCOL, type: "push", version: "v1", data })).toBe(true);
    }
  });

  it("accepts a notification-click message with the action and the clicked notification", () => {
    const message = {
      protocol: SW_PROTOCOL,
      type: "notification-click",
      version: "v1",
      action: "reply",
      notification: { title: "New mail", body: "From Ada", tag: "mail", data: { id: 7 } },
    };
    expect(isWorkerToAppMessage(message)).toBe(true);
    expect(isWorkerToAppMessage({ ...message, action: "" })).toBe(true); // a click on the body, not a button
  });

  it("rejects a notification-click message without a well-formed notification or action", () => {
    const base = { protocol: SW_PROTOCOL, type: "notification-click", version: "v1" };
    const notification = { title: "t", body: "", tag: "", data: null };
    expect(isWorkerToAppMessage({ ...base, notification })).toBe(false);
    expect(isWorkerToAppMessage({ ...base, action: "", notification: { ...notification, title: 1 } })).toBe(false);
    expect(isWorkerToAppMessage({ ...base, action: "", notification: "t" })).toBe(false);
    expect(isWorkerToAppMessage({ ...base, action: "", notification: { title: "t" } })).toBe(false);
    expect(isWorkerToAppMessage({ ...base, action: "", notification: { title: "t", body: "" } })).toBe(false);
    expect(isWorkerToAppMessage({ ...base, action: "", notification: { title: "t", tag: "" } })).toBe(false);
  });

  it("rejects a push message without a version, as every worker message carries one", () => {
    expect(isWorkerToAppMessage({ protocol: SW_PROTOCOL, type: "push", data: 1 })).toBe(false);
  });
});
