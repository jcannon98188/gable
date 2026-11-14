import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerScope, type InMemoryWorkerScope, type Network, offline } from "../testing/worker-scope.js";
import { createPrecache, type Precache, type PrecacheManifest } from "./precache.js";
import { createFetchRouter } from "./router.js";

/** A server whose files say which release they belong to; `fail` makes one path fail. */
function server() {
  const state = { release: "v1", requests: [] as string[], fail: undefined as string | undefined, failWith: 404 as number | "offline" };
  const network: Network = (request) => {
    const path = new URL(request.url).pathname;
    state.requests.push(path);
    if (path === state.fail) {
      if (state.failWith === "offline") throw new TypeError(`Failed to fetch ${request.url}`);
      return new Response("not found", { status: state.failWith });
    }
    return new Response(`${path} ${state.release}`);
  };
  return { state, network };
}

const v1: PrecacheManifest = { version: "v1", urls: ["/", "/app.js", "/app.css"] };
const v2: PrecacheManifest = { version: "v2", urls: ["/", "/app.js", "/app.css", "/new.js"] };

/** Worker code for one release: precache on install, clean up on activate, serve precached URLs. */
function worker(scope: InMemoryWorkerScope, manifest: PrecacheManifest): Precache {
  const precache = createPrecache(scope, manifest);
  scope.addEventListener("install", (event) => event.waitUntil(precache.install()));
  scope.addEventListener("activate", (event) => event.waitUntil(precache.activate()));
  createFetchRouter(scope).route((url) => precache.has(url), precache.handler).listen();
  return precache;
}

async function body(precache: Precache, path: string) {
  return (await precache.match(new Request(`https://app.test${path}`)))?.text();
}

async function bodies(precache: Precache, paths: readonly string[]) {
  return Promise.all(paths.map((path) => body(precache, path)));
}

describe("precache: install", () => {
  it("installs every manifest URL into the version's cache and serves them offline", async () => {
    const { network } = server();
    const scope = createWorkerScope({ network });
    const precache = worker(scope, v1);
    await scope.install();
    await scope.activate();
    expect(precache.cacheName).toBe("gable-precache:v1");
    expect(await scope.caches.keys()).toEqual(["gable-precache:v1"]);
    scope.network = offline;
    expect(await (await scope.dispatchFetch("/app.js")).text()).toBe("/app.js v1");
    expect(await (await scope.dispatchFetch("/")).text()).toBe("/ v1");
    await expect(scope.dispatchFetch("/not-precached.js")).rejects.toThrow(TypeError);
  });

  it("installs nothing, and fails the worker's install, when any URL does not answer 200", async () => {
    const { state, network } = server();
    state.fail = "/app.css";
    const scope = createWorkerScope({ network });
    const precache = worker(scope, v1);
    await expect(scope.install()).rejects.toThrow(/app\.css/);
    expect(scope.state).toBe("redundant");
    expect(await scope.caches.has(precache.cacheName)).toBe(false);
    expect(await bodies(precache, v1.urls)).toEqual([undefined, undefined, undefined]);
  });

  it("installs nothing when the network fails part way", async () => {
    const { state, network } = server();
    state.fail = "/app.js";
    state.failWith = "offline";
    const scope = createWorkerScope({ network });
    const precache = createPrecache(scope, v1);
    await expect(precache.install()).rejects.toThrow(TypeError);
    expect(await scope.caches.keys()).toEqual([]);
  });

  it("does not serve a version whose install was interrupted, and reinstalls it in full", async () => {
    const { network } = server();
    const scope = createWorkerScope({ network });
    // What a worker killed mid-install leaves behind: some of v2's entries and no record that the install finished.
    await (await scope.caches.open("gable-precache:v2")).put("/app.js", new Response("/app.js half-installed"));
    const precache = createPrecache(scope, v2);
    expect(await body(precache, "/app.js")).toBeUndefined();
    await precache.install();
    expect(await bodies(precache, v2.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1", "/new.js v1"]);
  });

  it("concurrent installs of a version share one install instead of deleting each other's cache", async () => {
    const { state, network } = server();
    const scope = createWorkerScope({ network });
    const precache = createPrecache(scope, v1);
    const twin = createPrecache(scope, v1); // a second precache for the same version and Cache storage
    await Promise.all([precache.install(), precache.install(), twin.install()]);
    expect([...state.requests].sort()).toEqual(["/", "/app.css", "/app.js"]);
    expect(await bodies(precache, v1.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1"]);
    expect(await bodies(twin, v1.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1"]);
  });

  it("a failed install is not shared with a later call, which starts again", async () => {
    const { state, network } = server();
    state.fail = "/app.js";
    const scope = createWorkerScope({ network });
    const precache = createPrecache(scope, v1);
    await expect(precache.install()).rejects.toThrow(/app\.js/);
    state.fail = undefined;
    await precache.install();
    expect(await bodies(precache, v1.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1"]);
  });

  it("an installed version is not fetched again", async () => {
    const { state, network } = server();
    const scope = createWorkerScope({ network });
    await createPrecache(scope, v1).install();
    state.requests.length = 0;
    const again = createPrecache(scope, v1);
    await again.install();
    expect(state.requests).toEqual([]);
    expect(await body(again, "/app.js")).toBe("/app.js v1");
  });

  it("requests revalidate with the server, so the HTTP cache cannot hand back an older release", async () => {
    const modes: RequestCache[] = [];
    const scope = createWorkerScope({ network: (request) => (modes.push(request.cache), new Response("x")) });
    await createPrecache(scope, v1).install();
    expect(modes).toEqual(["no-cache", "no-cache", "no-cache"]);
  });
});

describe("precache: versions never mix", () => {
  it("while a new version installs, and after it fails, the old one serves only its own files", async () => {
    const { state, network } = server();
    const scope = createWorkerScope({ network });
    const old = worker(scope, v1);
    await scope.install();
    await scope.activate();

    // The server now has release v2, but one of its files is broken: v2 installs nothing.
    state.release = "v2";
    state.fail = "/new.js";
    const next = createPrecache(scope, v2);
    await expect(next.install()).rejects.toThrow(/new\.js/);
    expect(await bodies(next, v2.urls)).toEqual([undefined, undefined, undefined, undefined]);
    expect(await bodies(old, v1.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1"]);

    // Fixed: v2 installs in full beside v1, and each version serves only its own release.
    state.fail = undefined;
    await next.install();
    expect(await bodies(old, v1.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1"]);
    expect(await bodies(next, v2.urls)).toEqual(["/ v2", "/app.js v2", "/app.css v2", "/new.js v2"]);
    expect(await body(old, "/new.js")).toBeUndefined();
  });
});

describe("precache: activation", () => {
  it("removes the caches of other versions, and leaves runtime caches and other precaches alone", async () => {
    const { network } = server();
    const scope = createWorkerScope({ network });
    await createPrecache(scope, v1).install();
    await createPrecache(scope, { version: "v0", urls: ["/"] }).install();
    await createPrecache(scope, { version: "v1", urls: ["/"] }, { name: "gable-precache-extra" }).install();
    await scope.caches.open("api");
    await scope.caches.open("gable-precache:v1.5:interrupted");
    const precache = createPrecache(scope, v2);
    await precache.install();
    await precache.activate();
    expect(await scope.caches.keys()).toEqual(["gable-precache-extra:v1", "api", "gable-precache:v2"]);
    expect(await bodies(precache, v2.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1", "/new.js v1"]);
  });

  it("the new worker removes the old version's cache when it activates", async () => {
    const { state, network } = server();
    const first = createWorkerScope({ network });
    worker(first, v1);
    await first.install();
    await first.activate();
    // A second worker on the same origin shares Cache storage; here the same scope stands in for the next release.
    state.release = "v2";
    const next = createPrecache(first, v2);
    await next.install();
    expect(await first.caches.keys()).toEqual(["gable-precache:v1", "gable-precache:v2"]);
    await next.activate();
    expect(await first.caches.keys()).toEqual(["gable-precache:v2"]);
  });
});

describe("precache: lookups", () => {
  it("has() resolves URLs against the origin and ignores fragments", () => {
    const precache = createPrecache(createWorkerScope(), v1);
    expect(precache.has("/app.js")).toBe(true);
    expect(precache.has("https://app.test/app.js#top")).toBe(true);
    expect(precache.has(new URL("https://app.test/"))).toBe(true);
    expect(precache.has(new Request("https://app.test/app.css"))).toBe(true);
    expect(precache.has("/app.js?v=2")).toBe(false);
    expect(precache.has("https://cdn.test/app.js")).toBe(false);
  });

  it("match() answers only GET requests for manifest URLs", async () => {
    const { network } = server();
    const scope = createWorkerScope({ network });
    const precache = createPrecache(scope, v1);
    await precache.install();
    expect(await body(precache, "/app.js")).toBe("/app.js v1");
    expect(await precache.match(new Request("https://app.test/app.js", { method: "POST" }))).toBeUndefined();
    await (await scope.caches.open(precache.cacheName)).put("/stray.js", new Response("stray"));
    expect(await body(precache, "/stray.js")).toBeUndefined();
  });

  it("the handler falls back to the network for a manifest URL that is not installed yet", async () => {
    const { network } = server();
    const scope = createWorkerScope({ network });
    await scope.install();
    await scope.activate();
    const precache = createPrecache(scope, v1);
    createFetchRouter(scope).route((url) => precache.has(url), precache.handler).listen();
    expect(await (await scope.dispatchFetch("/app.js")).text()).toBe("/app.js v1");
  });
});

// SHA-256 of each file body the `server()` above serves (`<path> <release>`), first 16 hex digits: the format the Vite plugin emits.
const hashesV1 = { "/": "9fe4d17d037e6eb2", "/app.js": "a7f1f6eb216f099b", "/app.css": "7abcb1cba66f3f52" };
const hashesV2 = { "/": "c3cc902f44ba21c1", "/app.js": "1117d0c4df8a8bc3", "/app.css": "5c2e0693d157484d", "/new.js": "312ca4dad571f730" };
const hashed = (manifest: PrecacheManifest, hashes: Record<string, string>): PrecacheManifest => ({ ...manifest, hashes });

/** Whether this engine can hash: the engine suites (AgniJS, QuickJS) have a `crypto` without `subtle`. */
const canHash = globalThis.crypto?.subtle !== undefined;

/** A network that swaps the server to release v2 once /app.js has been answered, as a deploy landing mid-install does. */
function swappingServer() {
  const { state, network } = server();
  const swapping: Network = (request) => {
    const response = network(request);
    if (new URL(request.url).pathname === "/app.js") state.release = "v2";
    return response;
  };
  return { state, network: swapping };
}

describe.skipIf(!canHash)("precache: verifying files against the manifest hashes", () => {
  it("installs when every file matches its hash, and serves the bytes it fetched", async () => {
    const { network } = server();
    const scope = createWorkerScope({ network });
    const precache = createPrecache(scope, hashed(v1, hashesV1));
    await precache.install();
    expect(await bodies(precache, v1.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1"]);
  });

  it("a file that does not match fails the install atomically: nothing of the version is left and the worker's install fails", async () => {
    const { network } = server();
    const scope = createWorkerScope({ network });
    const precache = worker(scope, hashed(v1, { ...hashesV1, "/app.css": "0000000000000000" }));
    await expect(scope.install()).rejects.toThrow(/app\.css.*0000000000000000.*7abcb1cba66f3f52/);
    expect(scope.state).toBe("redundant");
    expect(await scope.caches.has(precache.cacheName)).toBe(false);
    expect(await bodies(precache, v1.urls)).toEqual([undefined, undefined, undefined]);
  });

  it("a mismatch leaves the running version serving its own files", async () => {
    const { state, network } = server();
    const scope = createWorkerScope({ network });
    const old = worker(scope, hashed(v1, hashesV1));
    await scope.install();
    await scope.activate();
    state.release = "v2";
    const next = createPrecache(scope, hashed(v2, { ...hashesV2, "/new.js": "ffffffffffffffff" }));
    await expect(next.install()).rejects.toThrow(/new\.js/);
    expect(await scope.caches.keys()).toEqual(["gable-precache:v1"]);
    expect(await bodies(old, v1.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1"]);
  });

  it("a deploy landing mid-install, so the server answers some files from the next release, fails the install", async () => {
    const { network } = swappingServer();
    const scope = createWorkerScope({ network });
    const precache = createPrecache(scope, hashed(v1, hashesV1));
    await expect(precache.install()).rejects.toThrow(/does not match/);
    expect(await scope.caches.keys()).toEqual([]);
    expect(await bodies(precache, v1.urls)).toEqual([undefined, undefined, undefined]);
  });

  it("verifies only the files that have a hash, and ignores hashes of files not in the manifest", async () => {
    const { network } = server();
    const scope = createWorkerScope({ network });
    const precache = createPrecache(scope, hashed(v1, { "/app.js": hashesV1["/app.js"], "/other.js": "0000000000000000" }));
    await precache.install();
    expect(await body(precache, "/app.css")).toBe("/app.css v1");
  });

  it("matches hashes by the URL as the manifest lists it, absolute or relative, ignoring a fragment", async () => {
    const { network } = server();
    const manifest: PrecacheManifest = {
      version: "v1",
      urls: ["https://app.test/app.js#x", "/app.css"],
      hashes: { "/app.js": hashesV1["/app.js"], "https://app.test/app.css": "0000000000000000" },
    };
    await expect(createPrecache(createWorkerScope({ network }), manifest).install()).rejects.toThrow(/app\.css/);
  });

  it("compares the hash case-insensitively, and an empty hash never matches", async () => {
    const { network } = server();
    const upper = hashed({ version: "v1", urls: ["/app.js"] }, { "/app.js": hashesV1["/app.js"].toUpperCase() });
    await createPrecache(createWorkerScope({ network }), upper).install();
    const empty = hashed({ version: "v1", urls: ["/app.js"] }, { "/app.js": "" });
    await expect(createPrecache(createWorkerScope({ network }), empty).install()).rejects.toThrow(/does not match/);
  });
});

describe("precache: without hashes", () => {
  it("the same mid-install swap installs a mix of releases: nothing is verified", async () => {
    const { network } = swappingServer();
    const precache = createPrecache(createWorkerScope({ network }), v1);
    await precache.install();
    expect(await bodies(precache, v1.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v2"]);
  });

  it("an empty hashes object verifies nothing either", async () => {
    const { network } = swappingServer();
    const precache = createPrecache(createWorkerScope({ network }), hashed(v1, {}));
    await precache.install();
    expect(await body(precache, "/app.css")).toBe("/app.css v2");
  });
});

describe("precache: where crypto.subtle is unavailable", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("skips verification, so a release with hashes still installs (the engine suites run this way)", async () => {
    vi.stubGlobal("crypto", {});
    const { network } = server();
    const scope = createWorkerScope({ network });
    const wrong = { "/": "0000000000000000", "/app.js": "0000000000000000", "/app.css": "0000000000000000" };
    const precache = createPrecache(scope, hashed(v1, wrong));
    await precache.install();
    expect(await bodies(precache, v1.urls)).toEqual(["/ v1", "/app.js v1", "/app.css v1"]);
  });
});
