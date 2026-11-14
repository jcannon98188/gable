import { describe, expect, it } from "vitest";
import type { WorkerScope } from "../core/index.js";
import { createWorkerScope, offline } from "./worker-scope.js";

describe("in-memory worker scope: core contract", () => {
  it("runs worker code written against core's WorkerScope", async () => {
    function worker(self: WorkerScope) {
      self.addEventListener("install", (event) => event.waitUntil(self.caches.open("v1").then((c) => c.put("/hello", new Response("hi")))));
      self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
      self.addEventListener("fetch", (event) => event.respondWith(self.caches.match(event.request).then((r) => r ?? self.fetch(event.request))));
    }
    const scope = createWorkerScope();
    const tab = scope.connectClient("/");
    worker(scope);
    await scope.install();
    await scope.activate();
    expect(tab.controlled).toBe(true);
    expect(await (await scope.dispatchFetch("/hello")).text()).toBe("hi");
  });
});

describe("in-memory worker scope: lifecycle", () => {
  it("install waits for every waitUntil promise before the worker is installed", async () => {
    const scope = createWorkerScope();
    const order: string[] = [];
    scope.addEventListener("install", (event) => {
      event.waitUntil(Promise.resolve().then(() => order.push("first")));
      event.waitUntil(new Promise((r) => setTimeout(r, 5)).then(() => order.push("second")));
    });
    expect(scope.state).toBe("parsed");
    await scope.install();
    order.push("installed");
    expect(order).toEqual(["first", "second", "installed"]);
    expect(scope.state).toBe("installed");
  });

  it("a rejected install extension fails the install and makes the worker redundant", async () => {
    const scope = createWorkerScope();
    scope.addEventListener("install", (event) => event.waitUntil(Promise.reject(new Error("precache failed"))));
    await expect(scope.install()).rejects.toThrow("precache failed");
    expect(scope.state).toBe("redundant");
  });

  it("activate runs after install and waits for its extensions", async () => {
    const scope = createWorkerScope();
    const seen: string[] = [];
    scope.addEventListener("activate", (event) => {
      seen.push(event.type);
      event.waitUntil(new Promise((r) => setTimeout(r, 5)).then(() => seen.push("cleaned up")));
    });
    await expect(scope.activate()).rejects.toThrow(/install/);
    await scope.install();
    await scope.activate();
    expect(seen).toEqual(["activate", "cleaned up"]);
    expect(scope.state).toBe("activated");
  });

  it("waitUntil after dispatch has finished throws InvalidStateError", async () => {
    const scope = createWorkerScope();
    let saved: { waitUntil(p: Promise<unknown>): void } | undefined;
    scope.addEventListener("install", (event) => {
      saved = event;
    });
    await scope.install();
    expect(() => saved!.waitUntil(Promise.resolve())).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  it("a listener can be removed", async () => {
    const scope = createWorkerScope();
    let calls = 0;
    const listener = () => void calls++;
    scope.addEventListener("install", listener);
    scope.removeEventListener("install", listener);
    await scope.install();
    expect(calls).toBe(0);
  });

  it("adding the same listener twice registers it once, as in the DOM", async () => {
    const scope = createWorkerScope();
    let calls = 0;
    const listener = () => void calls++;
    scope.addEventListener("install", listener);
    scope.addEventListener("install", listener);
    await scope.install();
    expect(calls).toBe(1);
  });
});

describe("in-memory worker scope: Cache storage", () => {
  it("stores a response and returns a readable copy on every match", async () => {
    const scope = createWorkerScope();
    const cache = await scope.caches.open("assets-v1");
    await cache.put("https://app.test/app.js", new Response("console.log(1)", { headers: { "content-type": "text/javascript" } }));
    const first = await cache.match("https://app.test/app.js");
    const second = await cache.match(new Request("https://app.test/app.js"));
    expect(await first!.text()).toBe("console.log(1)");
    expect(await second!.text()).toBe("console.log(1)");
    expect(first!.headers.get("content-type")).toBe("text/javascript");
    expect(await cache.match("https://app.test/other.js")).toBeUndefined();
  });

  it("resolves relative URLs against the scope's origin", async () => {
    const scope = createWorkerScope({ origin: "https://shop.test" });
    const cache = await scope.caches.open("pages");
    await cache.put("/index.html", new Response("home"));
    expect(await (await cache.match("https://shop.test/index.html"))!.text()).toBe("home");
  });

  it("lists, checks and deletes caches by name, in creation order", async () => {
    const scope = createWorkerScope();
    await scope.caches.open("assets-v1");
    await scope.caches.open("data");
    expect(await scope.caches.keys()).toEqual(["assets-v1", "data"]);
    expect(await scope.caches.has("data")).toBe(true);
    expect(await scope.caches.delete("assets-v1")).toBe(true);
    expect(await scope.caches.delete("assets-v1")).toBe(false);
    expect(await scope.caches.keys()).toEqual(["data"]);
  });

  it("matches across caches in creation order, or in one named cache", async () => {
    const scope = createWorkerScope();
    await (await scope.caches.open("a")).put("https://app.test/x", new Response("from a"));
    await (await scope.caches.open("b")).put("https://app.test/x", new Response("from b"));
    expect(await (await scope.caches.match("https://app.test/x"))!.text()).toBe("from a");
    expect(await (await scope.caches.match("https://app.test/x", { cacheName: "b" }))!.text()).toBe("from b");
    expect(await scope.caches.match("https://app.test/x", { cacheName: "missing" })).toBeUndefined();
  });

  it("keeps one entry per URL, lists request keys and deletes entries", async () => {
    const scope = createWorkerScope();
    const cache = await scope.caches.open("c");
    await cache.put("https://app.test/a", new Response("old"));
    await cache.put("https://app.test/a", new Response("new"));
    await cache.put("https://app.test/b", new Response("b"));
    expect((await cache.keys()).map((r) => r.url)).toEqual(["https://app.test/a", "https://app.test/b"]);
    expect(await (await cache.match("https://app.test/a"))!.text()).toBe("new");
    expect(await cache.delete("https://app.test/a")).toBe(true);
    expect(await cache.delete("https://app.test/a")).toBe(false);
    expect((await cache.matchAll()).length).toBe(1);
  });

  it("only GET requests are stored and matched, unless ignoreMethod is set", async () => {
    const scope = createWorkerScope();
    const cache = await scope.caches.open("c");
    await expect(cache.put(new Request("https://app.test/api", { method: "POST" }), new Response("x"))).rejects.toThrow(TypeError);
    await cache.put("https://app.test/api", new Response("cached"));
    const post = new Request("https://app.test/api", { method: "POST" });
    expect(await cache.match(post)).toBeUndefined();
    expect(await (await cache.match(post, { ignoreMethod: true }))!.text()).toBe("cached");
  });

  it("ignoreSearch matches a URL whatever its query string", async () => {
    const scope = createWorkerScope();
    const cache = await scope.caches.open("c");
    await cache.put("https://app.test/page?v=1", new Response("page"));
    expect(await cache.match("https://app.test/page?v=2")).toBeUndefined();
    expect(await (await cache.match("https://app.test/page?v=2", { ignoreSearch: true }))!.text()).toBe("page");
  });

  it("add and addAll fetch from the network and store the responses", async () => {
    const scope = createWorkerScope({ network: (request) => new Response(`body of ${new URL(request.url).pathname}`) });
    const cache = await scope.caches.open("c");
    await cache.add("/one");
    await cache.addAll(["/two", "/three"]);
    expect(await (await cache.match("/three"))!.text()).toBe("body of /three");
    expect((await cache.keys()).length).toBe(3);
  });

  it("addAll stores nothing when any response is not ok", async () => {
    const scope = createWorkerScope({
      network: (request) => (request.url.endsWith("/missing") ? new Response("no", { status: 404 }) : new Response("ok")),
    });
    const cache = await scope.caches.open("c");
    await expect(cache.addAll(["/fine", "/missing"])).rejects.toThrow(TypeError);
    expect(await cache.keys()).toEqual([]);
  });
});

async function activated(options?: Parameters<typeof createWorkerScope>[0]) {
  const scope = createWorkerScope(options);
  await scope.install();
  await scope.activate();
  return scope;
}

describe("in-memory worker scope: fetch events", () => {
  it("answers with the response a listener passed to respondWith", async () => {
    const scope = await activated();
    const seen: string[] = [];
    scope.addEventListener("fetch", (event) => {
      seen.push(`${event.request.method} ${event.request.url} from ${event.clientId}`);
      event.respondWith(Promise.resolve(new Response("from the worker")));
    });
    const response = await scope.dispatchFetch("/data.json", { clientId: "tab-1" });
    expect(await response.text()).toBe("from the worker");
    expect(seen).toEqual(["GET https://app.test/data.json from tab-1"]);
  });

  it("goes to the network when no listener responds", async () => {
    const scope = await activated({ network: () => new Response("from the network") });
    scope.addEventListener("fetch", () => {});
    expect(await (await scope.dispatchFetch("/x")).text()).toBe("from the network");
    scope.network = offline;
    await expect(scope.dispatchFetch("/x")).rejects.toThrow(TypeError);
  });

  it("only an activated worker receives fetch events", async () => {
    const scope = createWorkerScope();
    await expect(scope.dispatchFetch("/x")).rejects.toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  it("respondWith must be called during dispatch, and once", async () => {
    const scope = await activated();
    const errors: string[] = [];
    let late: { respondWith(r: Response): void } | undefined;
    scope.addEventListener("fetch", (event) => {
      event.respondWith(new Response("first"));
      try {
        event.respondWith(new Response("second"));
      } catch (error) {
        errors.push((error as DOMException).name);
      }
      late = event;
    });
    expect(await (await scope.dispatchFetch("/x")).text()).toBe("first");
    expect(() => late!.respondWith(new Response("late"))).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    expect(errors).toEqual(["InvalidStateError"]);
  });

  it("a rejected respondWith is a network error", async () => {
    const scope = await activated();
    scope.addEventListener("fetch", (event) => event.respondWith(Promise.reject(new Error("strategy blew up"))));
    await expect(scope.dispatchFetch("/x")).rejects.toThrow(TypeError);
  });

  it("idle() waits for work a fetch event extended itself with", async () => {
    const scope = await activated({ network: () => new Response("fresh") });
    scope.addEventListener("fetch", (event) => {
      event.respondWith(new Response("stale"));
      event.waitUntil(
        (async () => {
          const cache = await scope.caches.open("data");
          await cache.put(event.request, await scope.fetch(event.request));
        })(),
      );
    });
    expect(await (await scope.dispatchFetch("/feed")).text()).toBe("stale");
    await scope.idle();
    expect(await (await scope.caches.match("/feed"))!.text()).toBe("fresh");
  });

  it("a pending respondWith keeps the event alive, so waitUntil still works after an await", async () => {
    const scope = await activated({ network: () => new Response("fresh") });
    scope.addEventListener("fetch", (event) =>
      event.respondWith(
        (async () => {
          const response = await scope.fetch(event.request);
          event.waitUntil(scope.caches.open("data").then((c) => c.put("/late", new Response("stored"))));
          return response;
        })(),
      ),
    );
    expect(await (await scope.dispatchFetch("/x")).text()).toBe("fresh");
    await scope.idle();
    expect(await (await scope.caches.match("/late"))!.text()).toBe("stored");
  });

  it("dispatches requests with a destination, and navigations with mode navigate", async () => {
    const scope = await activated();
    const seen: string[] = [];
    scope.addEventListener("fetch", (event) => {
      seen.push(`${event.request.mode} ${event.request.destination || "(none)"}`);
      event.respondWith(new Response("ok"));
    });
    await scope.dispatchFetch("/logo.png", { destination: "image" });
    await scope.dispatchFetch("/about", { mode: "navigate" });
    await scope.dispatchFetch("/frame", { mode: "navigate", destination: "iframe" });
    await scope.dispatchFetch("/data.json");
    expect(seen).toEqual(["cors image", "navigate document", "navigate iframe", "cors (none)"]);
  });

  it("runs a whole cache-first worker: precache on install, serve offline", async () => {
    const scope = createWorkerScope({ network: (request) => new Response(`network ${new URL(request.url).pathname}`) });
    scope.addEventListener("install", (event) => event.waitUntil(scope.caches.open("v1").then((c) => c.addAll(["/", "/app.js"]))));
    scope.addEventListener("activate", (event) =>
      event.waitUntil(scope.caches.keys().then((names) => Promise.all(names.filter((n) => n !== "v1").map((n) => scope.caches.delete(n))))),
    );
    scope.addEventListener("fetch", (event) =>
      event.respondWith(scope.caches.match(event.request).then((hit) => hit ?? scope.fetch(event.request))),
    );
    await scope.caches.open("v0");
    await scope.install();
    await scope.activate();
    expect(await scope.caches.keys()).toEqual(["v1"]);
    scope.network = offline;
    expect(await (await scope.dispatchFetch("/app.js")).text()).toBe("network /app.js");
    await expect(scope.dispatchFetch("/not-cached")).rejects.toThrow(TypeError);
  });
});

describe("in-memory worker scope: clients", () => {
  it("pages open before activation are uncontrolled until the worker claims them", async () => {
    const scope = createWorkerScope();
    const early = scope.connectClient("/");
    await scope.install();
    await scope.activate();
    const late = scope.connectClient("/settings");
    expect(early.controlled).toBe(false);
    expect(late.controlled).toBe(true);
    expect((await scope.clients.matchAll()).map((c) => c.url)).toEqual(["https://app.test/settings"]);
    expect((await scope.clients.matchAll({ includeUncontrolled: true })).length).toBe(2);
    await scope.clients.claim();
    expect(early.controlled).toBe(true);
    expect((await scope.clients.matchAll()).length).toBe(2);
  });

  it("claim needs an active worker", async () => {
    const scope = createWorkerScope();
    await expect(scope.clients.claim()).rejects.toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  it("finds clients by id and type, and forgets closed ones", async () => {
    const scope = await activated();
    const tab = scope.connectClient("/");
    const worker = scope.connectClient("/worker.js", { type: "worker" });
    expect(await scope.clients.get(tab.id)).toBe(tab);
    expect(tab.id).not.toBe(worker.id);
    expect(await scope.clients.matchAll()).toEqual([tab]);
    expect(await scope.clients.matchAll({ type: "all" })).toEqual([tab, worker]);
    tab.close();
    expect(await scope.clients.get(tab.id)).toBeUndefined();
  });

  it("records the messages the worker posts to a client, as copies", async () => {
    const scope = await activated();
    const tab = scope.connectClient("/");
    const payload = { type: "update-available", version: "v2" };
    for (const client of await scope.clients.matchAll()) client.postMessage(payload);
    payload.version = "changed";
    expect(tab.messages).toEqual([{ type: "update-available", version: "v2" }]);
  });

  it("records skipWaiting", async () => {
    const scope = createWorkerScope();
    expect(scope.skippedWaiting).toBe(false);
    scope.addEventListener("install", () => void scope.skipWaiting());
    await scope.install();
    expect(scope.skippedWaiting).toBe(true);
  });
});
