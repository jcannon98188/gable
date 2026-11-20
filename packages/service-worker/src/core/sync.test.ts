// Background sync registrations and sync handlers (service-worker/111), driven through the in-memory worker scope.
import { describe, expect, it } from "vitest";
import { createWorkerScope, type WorkerScopeOptions } from "../testing/worker-scope.js";
import { backgroundSync, type SyncContext } from "./index.js";

async function activeScope(options?: WorkerScopeOptions) {
  const scope = createWorkerScope(options);
  await scope.install();
  await scope.activate();
  const page = scope.connectClient("/outbox");
  return { scope, page };
}

describe("backgroundSync: registration", () => {
  it("register() registers the tag with the browser and resolves true", async () => {
    const { scope } = await activeScope();
    const outbox = backgroundSync(scope, { tag: "outbox", version: "v1", sync: () => {} });
    expect(outbox.tag).toBe("outbox");
    expect(await outbox.isRegistered()).toBe(false);
    expect(await outbox.register()).toBe(true);
    expect(await scope.registration.sync!.getTags()).toEqual(["outbox"]);
    expect(await outbox.isRegistered()).toBe(true);
  });

  it("register() resolves false, and nothing is registered, in a browser without background sync", async () => {
    const { scope } = await activeScope({ backgroundSync: false });
    const outbox = backgroundSync(scope, { tag: "outbox", version: "v1", sync: () => {} });
    expect(outbox.supported).toBe(false);
    expect(await outbox.register()).toBe(false);
    expect(await outbox.isRegistered()).toBe(false);
  });
});

describe("backgroundSync: sync events", () => {
  it("runs the handler for its own tag with lastChance, and the sync lasts until the handler settles", async () => {
    const { scope } = await activeScope();
    const order: string[] = [];
    const outbox = backgroundSync(scope, {
      tag: "outbox",
      version: "v1",
      sync: async ({ tag, lastChance }) => {
        await new Promise((r) => setTimeout(r, 5));
        order.push(`synced ${tag} lastChance=${lastChance}`);
      },
    });
    await outbox.register();
    await scope.dispatchSync("outbox");
    order.push("sync done");
    expect(order).toEqual(["synced outbox lastChance=false", "sync done"]);
    expect(await outbox.isRegistered()).toBe(false);
  });

  it("leaves other tags' syncs to their own handlers", async () => {
    const { scope } = await activeScope();
    const ran: string[] = [];
    const outbox = backgroundSync(scope, { tag: "outbox", version: "v1", sync: () => void ran.push("outbox") });
    const drafts = backgroundSync(scope, { tag: "drafts", version: "v1", sync: () => void ran.push("drafts") });
    await outbox.register();
    await drafts.register();
    await scope.dispatchSync("drafts");
    expect(ran).toEqual(["drafts"]);
    expect(await outbox.isRegistered()).toBe(true);
  });

  it("a failed attempt fails the sync so the browser retries it, without telling the app", async () => {
    const { scope, page } = await activeScope();
    let attempts = 0;
    const outbox = backgroundSync(scope, {
      tag: "outbox",
      version: "v1",
      sync: () => {
        attempts++;
        if (attempts === 1) throw new TypeError("Failed to fetch");
      },
    });
    await outbox.register();
    await expect(scope.dispatchSync("outbox")).rejects.toThrow("Failed to fetch");
    expect(await outbox.isRegistered()).toBe(true);
    expect(page.messages).toEqual([]);

    await scope.dispatchSync("outbox");
    expect(attempts).toBe(2);
    expect(await outbox.isRegistered()).toBe(false);
  });

  it("a failed last chance is reported to the app as a runtime error", async () => {
    const { scope, page } = await activeScope();
    const outbox = backgroundSync(scope, {
      tag: "outbox",
      version: "v1",
      sync: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    await outbox.register();
    await expect(scope.dispatchSync("outbox", { lastChance: true })).rejects.toThrow("Failed to fetch");
    expect(page.messages).toEqual([
      { protocol: "gable-sw@1", type: "error", version: "v1", phase: "runtime", error: { name: "TypeError", message: "Failed to fetch" } },
    ]);
    expect(await outbox.isRegistered()).toBe(false);
  });

  it("dispose() stops handling the tag's syncs", async () => {
    const { scope } = await activeScope();
    const ran: string[] = [];
    const outbox = backgroundSync(scope, { tag: "outbox", version: "v1", sync: () => void ran.push("outbox") });
    await outbox.register();
    outbox.dispose();
    await scope.dispatchSync("outbox");
    expect(ran).toEqual([]);
  });

  it("types the tag and the handler's context", async () => {
    const { scope } = await activeScope();
    const seen: SyncContext<"outbox">[] = [];
    const outbox = backgroundSync(scope, { tag: "outbox", version: "v1", sync: (context) => void seen.push(context) });
    const tag: "outbox" = outbox.tag;
    await outbox.register();
    await scope.dispatchSync(tag);
    expect(seen.map(({ tag, version, lastChance }) => ({ tag, version, lastChance }))).toEqual([{ tag: "outbox", version: "v1", lastChance: false }]);
  });
});
