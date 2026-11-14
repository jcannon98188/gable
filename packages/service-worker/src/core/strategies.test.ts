import { describe, expect, it } from "vitest";
import { createWorkerScope, type InMemoryWorkerScope, type Network, offline } from "../testing/worker-scope.js";
import { createFetchRouter, type FetchRouteHandler } from "./router.js";
import { cacheFirst, networkFirst, networkOnly, staleWhileRevalidate } from "./strategies.js";

/** A network that answers `<path> v<n>`, counting requests; `version` changes what it serves. */
function server() {
  const state = { version: 1, requests: 0, status: 200 };
  const network: Network = (request) => {
    state.requests++;
    return new Response(`${new URL(request.url).pathname} v${state.version}`, { status: state.status });
  };
  return { state, network };
}

async function routed(handler: FetchRouteHandler, network: Network): Promise<InMemoryWorkerScope> {
  const scope = createWorkerScope({ network });
  await scope.install();
  await scope.activate();
  createFetchRouter(scope).route("/*", handler).listen();
  return scope;
}

const get = async (scope: InMemoryWorkerScope, path: string) => (await scope.dispatchFetch(path)).text();
const cached = async (scope: InMemoryWorkerScope, cacheName: string, path: string) =>
  (await scope.caches.match(path, { cacheName }))?.text();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("cache-first", () => {
  it("serves a cached response without going to the network", async () => {
    const { state, network } = server();
    const scope = await routed(cacheFirst({ cacheName: "assets" }), network);
    await (await scope.caches.open("assets")).put("/app.js", new Response("cached app"));
    expect(await get(scope, "/app.js")).toBe("cached app");
    expect(state.requests).toBe(0);
  });

  it("on a miss fetches, answers, and stores the response for next time", async () => {
    const { state, network } = server();
    const scope = await routed(cacheFirst({ cacheName: "assets" }), network);
    expect(await get(scope, "/app.js")).toBe("/app.js v1");
    await scope.idle();
    expect(await cached(scope, "assets", "/app.js")).toBe("/app.js v1");
    state.version = 2;
    scope.network = offline;
    expect(await get(scope, "/app.js")).toBe("/app.js v1");
    expect(state.requests).toBe(1);
  });

  it("does not store responses that are not cacheable, by default anything but 200", async () => {
    const { state, network } = server();
    state.status = 404;
    const scope = await routed(cacheFirst({ cacheName: "assets" }), network);
    expect(await get(scope, "/missing.js")).toBe("/missing.js v1");
    await scope.idle();
    expect(await cached(scope, "assets", "/missing.js")).toBeUndefined();
  });

  it("stores what a cacheable predicate accepts", async () => {
    const { state, network } = server();
    state.status = 404;
    const scope = await routed(cacheFirst({ cacheName: "assets", cacheable: (r) => r.status === 404 }), network);
    await get(scope, "/missing.js");
    await scope.idle();
    expect(await cached(scope, "assets", "/missing.js")).toBe("/missing.js v1");
  });

  it("a miss while offline is a network error", async () => {
    const scope = await routed(cacheFirst({ cacheName: "assets" }), offline);
    await expect(scope.dispatchFetch("/app.js")).rejects.toThrow(TypeError);
    await scope.idle();
  });

  it("reads only its own cache", async () => {
    const { network } = server();
    const scope = await routed(cacheFirst({ cacheName: "assets" }), network);
    await (await scope.caches.open("other")).put("/app.js", new Response("someone else's"));
    expect(await get(scope, "/app.js")).toBe("/app.js v1");
  });
});

describe("network-first", () => {
  it("answers from the network and keeps the cache up to date", async () => {
    const { state, network } = server();
    const scope = await routed(networkFirst({ cacheName: "api" }), network);
    expect(await get(scope, "/feed")).toBe("/feed v1");
    state.version = 2;
    expect(await get(scope, "/feed")).toBe("/feed v2");
    await scope.idle();
    expect(await cached(scope, "api", "/feed")).toBe("/feed v2");
  });

  it("falls back to the cache when the network fails", async () => {
    const { network } = server();
    const scope = await routed(networkFirst({ cacheName: "api" }), network);
    await get(scope, "/feed");
    await scope.idle();
    scope.network = offline;
    expect(await get(scope, "/feed")).toBe("/feed v1");
  });

  it("is a network error when the network fails and nothing is cached", async () => {
    const scope = await routed(networkFirst({ cacheName: "api" }), offline);
    await expect(scope.dispatchFetch("/feed")).rejects.toThrow(TypeError);
  });

  it("returns a non-cacheable network response without replacing the cached one", async () => {
    const { state, network } = server();
    const scope = await routed(networkFirst({ cacheName: "api" }), network);
    await get(scope, "/feed");
    state.status = 500;
    state.version = 2;
    expect(await get(scope, "/feed")).toBe("/feed v2");
    await scope.idle();
    expect(await cached(scope, "api", "/feed")).toBe("/feed v1");
  });

  it("with a network timeout, serves the cache when the network is slow, and still stores the late response", async () => {
    const { state, network } = server();
    const scope = await routed(networkFirst({ cacheName: "api", networkTimeoutMs: 10 }), network);
    await get(scope, "/feed");
    await scope.idle();
    state.version = 2;
    scope.network = async (request) => {
      await delay(50);
      return network(request);
    };
    expect(await get(scope, "/feed")).toBe("/feed v1");
    await scope.idle();
    expect(await cached(scope, "api", "/feed")).toBe("/feed v2");
  });

  it("with a network timeout and nothing cached, waits for the network", async () => {
    const { network } = server();
    const scope = await routed(networkFirst({ cacheName: "api", networkTimeoutMs: 5 }), async (request) => {
      await delay(30);
      return network(request);
    });
    expect(await get(scope, "/feed")).toBe("/feed v1");
  });
});

describe("stale-while-revalidate", () => {
  it("answers from the cache and refreshes it in the background", async () => {
    const { state, network } = server();
    const scope = await routed(staleWhileRevalidate({ cacheName: "avatars" }), network);
    await (await scope.caches.open("avatars")).put("/me.png", new Response("old avatar"));
    expect(await get(scope, "/me.png")).toBe("old avatar");
    await scope.idle();
    expect(state.requests).toBe(1);
    expect(await get(scope, "/me.png")).toBe("/me.png v1");
  });

  it("on a miss waits for the network and stores the response", async () => {
    const { network } = server();
    const scope = await routed(staleWhileRevalidate({ cacheName: "avatars" }), network);
    expect(await get(scope, "/me.png")).toBe("/me.png v1");
    await scope.idle();
    expect(await cached(scope, "avatars", "/me.png")).toBe("/me.png v1");
  });

  it("offline, keeps serving the cached response and the failed refresh is not an error", async () => {
    const scope = await routed(staleWhileRevalidate({ cacheName: "avatars" }), offline);
    await (await scope.caches.open("avatars")).put("/me.png", new Response("old avatar"));
    expect(await get(scope, "/me.png")).toBe("old avatar");
    await scope.idle();
    expect(await cached(scope, "avatars", "/me.png")).toBe("old avatar");
    await expect(scope.dispatchFetch("/other.png")).rejects.toThrow(TypeError);
  });
});

describe("network-only", () => {
  it("always goes to the network and caches nothing", async () => {
    const { state, network } = server();
    const scope = await routed(networkOnly(), network);
    expect(await get(scope, "/live")).toBe("/live v1");
    state.version = 2;
    expect(await get(scope, "/live")).toBe("/live v2");
    await scope.idle();
    expect(await scope.caches.keys()).toEqual([]);
    scope.network = offline;
    await expect(scope.dispatchFetch("/live")).rejects.toThrow(TypeError);
  });
});
