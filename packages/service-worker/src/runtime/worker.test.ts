// The default worker, driven through defineWorker(...).start() on the in-memory worker scope: requests go in as
// fetch events and come out as responses, from the network or a cache.
import { describe, expect, it } from "vitest";
import { createWorkerScope, type InMemoryWorkerScope, type Network, offline } from "../testing/worker-scope.js";
import { type AssetManifest, defineWorker, type ServiceWorkerConfig, ServiceWorkerConfigError, validateManifest } from "./index.js";

/** A server whose responses say which release they belong to, and which records the paths it was asked for. */
function server(release = { name: "v1" }) {
  const requests: string[] = [];
  const network: Network = (request) => {
    const url = new URL(request.url);
    requests.push(url.origin === "https://app.test" ? url.pathname + url.search : url.href);
    return new Response(`${url.pathname} ${release.name}`);
  };
  return { release, requests, network };
}

const files = ["/index.html", "/assets/app.1a.js", "/assets/app.1a.css", "/images/logo.png", "/images/icons/star.svg", "/robots.txt"];
const v1: AssetManifest = { version: "v1", files };

const assets: ServiceWorkerConfig = {
  assetGroups: [
    { name: "app", installMode: "prefetch", files: ["/index.html", "/assets/**"] },
    { name: "images", installMode: "lazy", files: ["/images/**"] },
  ],
};

async function installed(config: ServiceWorkerConfig, manifest: AssetManifest = v1, network?: Network) {
  const scope = createWorkerScope({ network });
  defineWorker({ config }).start(scope, manifest);
  await scope.install();
  await scope.activate();
  return scope;
}

const text = async (scope: InMemoryWorkerScope, url: string, init?: Parameters<InMemoryWorkerScope["dispatchFetch"]>[1]) =>
  (await scope.dispatchFetch(url, init)).text();

describe("asset groups", () => {
  it("prefetch groups are fetched while the release installs and then served offline", async () => {
    const { network, requests } = server();
    const scope = await installed(assets, v1, network);
    expect(requests.sort()).toEqual(["/assets/app.1a.css", "/assets/app.1a.js", "/index.html"]);
    scope.network = offline;
    expect(await text(scope, "/assets/app.1a.js")).toBe("/assets/app.1a.js v1");
    expect(await text(scope, "/index.html")).toBe("/index.html v1");
  });

  it("lazy groups are fetched on first request, then served from the cache", async () => {
    const { network, requests } = server();
    const scope = await installed(assets, v1, network);
    requests.length = 0;
    expect(await text(scope, "/images/logo.png")).toBe("/images/logo.png v1");
    await scope.idle();
    scope.network = offline;
    expect(await text(scope, "/images/logo.png")).toBe("/images/logo.png v1");
    await expect(scope.dispatchFetch("/images/icons/star.svg")).rejects.toThrow(TypeError); // never requested, so not cached
    expect(requests).toEqual(["/images/logo.png"]);
  });

  it("files in no group, and URLs not in the manifest, go to the network uncached", async () => {
    const { network } = server();
    const scope = await installed(assets, v1, network);
    expect(await text(scope, "/robots.txt")).toBe("/robots.txt v1");
    expect(await text(scope, "/images/not-built.png")).toBe("/images/not-built.png v1");
    await scope.idle();
    scope.network = offline;
    await expect(scope.dispatchFetch("/robots.txt")).rejects.toThrow(TypeError);
    await expect(scope.dispatchFetch("/images/not-built.png")).rejects.toThrow(TypeError);
  });

  it("matches manifest files exactly: a query string or another path is not the file", async () => {
    const { network } = server();
    const scope = await installed(assets, v1, network);
    scope.network = offline;
    await expect(scope.dispatchFetch("/assets/app.1a.js?x=1")).rejects.toThrow(TypeError);
    await expect(scope.dispatchFetch("/")).rejects.toThrow(TypeError); // no navigation fallback configured
  });

  it("a file belongs to the first group that matches it", async () => {
    const { network, requests } = server();
    await installed(
      {
        assetGroups: [
          { name: "svg", installMode: "lazy", files: ["/**/*.svg"] },
          { name: "all", installMode: "prefetch", files: ["/**"] },
        ],
      },
      v1,
      network,
    );
    expect(requests).not.toContain("/images/icons/star.svg");
    expect(requests).toContain("/images/logo.png");
    expect(requests).toContain("/robots.txt");
  });

  it("a failed prefetch fails the install, as core's precache does", async () => {
    const network: Network = (request) => new Response("gone", { status: new URL(request.url).pathname === "/index.html" ? 404 : 200 });
    const scope = createWorkerScope({ network });
    defineWorker({ config: assets }).start(scope, v1);
    await expect(scope.install()).rejects.toThrow(/index\.html answered 404/);
  });
});

/** The next release's worker on the same origin: a new scope sharing `previous`'s Cache storage, as the browser does. */
function nextRelease(previous: InMemoryWorkerScope, config: ServiceWorkerConfig, manifest: AssetManifest, network: Network) {
  const scope = createWorkerScope({ network, caches: previous.caches });
  defineWorker({ config }).start(scope, manifest);
  return scope;
}

describe("releases", () => {
  const v2: AssetManifest = { version: "v2", files: ["/index.html", "/assets/app.2b.js", "/images/logo.png"] };

  it("a new release installs into its own caches while the running one keeps serving its own files", async () => {
    const { network, release } = server();
    const old = await installed(assets, v1, network);
    await text(old, "/images/logo.png");
    await old.idle();

    release.name = "v2";
    const next = nextRelease(old, assets, v2, network);
    await next.install();
    old.network = offline;
    expect(await text(old, "/index.html")).toBe("/index.html v1");
    expect(await text(old, "/images/logo.png")).toBe("/images/logo.png v1");
    expect((await old.caches.keys()).sort()).toEqual(["gable-lazy:v1", "gable-precache:v1", "gable-precache:v2"]);
  });

  it("activating the new release removes the old release's precache and lazy caches", async () => {
    const { network, release } = server();
    const old = await installed(assets, v1, network);
    await text(old, "/images/logo.png");
    await old.idle();
    release.name = "v2";
    const next = nextRelease(old, assets, v2, network);
    await next.install();
    await next.activate();

    expect(await next.caches.keys()).toEqual(["gable-precache:v2"]);
    expect(await text(next, "/images/logo.png")).toBe("/images/logo.png v2"); // lazy files are fetched again for the new release
    await next.idle();
    expect((await next.caches.keys()).sort()).toEqual(["gable-lazy:v2", "gable-precache:v2"]);
  });
});

describe("claiming clients on activation", () => {
  const v2: AssetManifest = { version: "v2", files: ["/index.html", "/assets/app.2b.js", "/images/logo.png"] };
  const page = "https://app.test/inbox";

  it("the first release claims the pages that registered it, so they are controlled without a reload", async () => {
    const scope = createWorkerScope({ network: server().network });
    defineWorker({ config: assets }).start(scope, v1);
    const registering = scope.connectClient(page);
    expect(registering.controlled).toBe(false);
    await scope.install();
    expect(registering.controlled).toBe(false); // installing does not claim: activation does
    await scope.activate();
    expect(registering.controlled).toBe(true);
    expect(await scope.clients.matchAll()).toEqual([registering]);
  });

  it("claims before the extension's activate hook runs, so the hook sees the claimed pages", async () => {
    const scope = createWorkerScope({ network: server().network });
    let seen = -1;
    defineWorker({
      config: assets,
      extend: ({ self }) => ({
        activate: async () => {
          seen = (await self.clients.matchAll()).length;
        },
      }),
    }).start(scope, v1);
    scope.connectClient(page);
    await scope.install();
    await scope.activate();
    expect(seen).toBe(1);
  });

  it("a release that replaces another never claims clients on activation", async () => {
    const { network } = server();
    const old = await installed(assets, v1, network);
    const next = nextRelease(old, assets, v2, network);
    const stray = next.connectClient(page, { controlled: false }); // a page the old release does not control
    await next.install();
    await next.activate();
    expect(stray.controlled).toBe(false);
    expect(await next.clients.matchAll()).toEqual([]);
  });

  it("a release whose predecessor never finished installing is a first release and claims", async () => {
    const { network } = server();
    const failing = createWorkerScope({ network: () => new Response("nope", { status: 500 }) });
    defineWorker({ config: assets }).start(failing, v1);
    await expect(failing.install()).rejects.toThrow();
    const next = nextRelease(failing, assets, v2, network);
    const client = next.connectClient(page);
    await next.install();
    await next.activate();
    expect(client.controlled).toBe(true);
  });
});

describe("navigation fallback", () => {
  const shell: ServiceWorkerConfig = { ...assets, navigationFallback: { url: "/index.html" } };
  const navigate = { mode: "navigate" } as const;

  it("answers navigations to app routes with the precached shell, offline", async () => {
    const { network } = server();
    const scope = await installed(shell, v1, network);
    scope.network = offline;
    expect(await text(scope, "/", navigate)).toBe("/index.html v1");
    expect(await text(scope, "/users/7?tab=posts", navigate)).toBe("/index.html v1");
  });

  it("leaves requests that are not navigations, and non-GET navigations, to the network", async () => {
    const { network } = server();
    const scope = await installed(shell, v1, network);
    expect(await text(scope, "/users/7")).toBe("/users/7 v1"); // a fetch() from the page, not a navigation
    expect(await text(scope, "/login", { ...navigate, method: "POST", body: "user=ada" })).toBe("/login v1");
  });

  it("by default leaves navigations to paths that look like files to the network", async () => {
    const { network } = server();
    const scope = await installed(shell, v1, network);
    expect(await text(scope, "/docs/manual.pdf", navigate)).toBe("/docs/manual.pdf v1");
    expect(await text(scope, "/users/ada", navigate)).toBe("/index.html v1");
  });

  it("exclude lists navigations to leave to the network, replacing the default", async () => {
    const { network } = server();
    const scope = await installed({ ...assets, navigationFallback: { url: "/index.html", exclude: ["/admin/**", "/api/**"] } }, v1, network);
    expect(await text(scope, "/admin", navigate)).toBe("/admin v1");
    expect(await text(scope, "/admin/users/1", navigate)).toBe("/admin/users/1 v1");
    expect(await text(scope, "/api/export", navigate)).toBe("/api/export v1");
    expect(await text(scope, "/reports/q3.pdf", navigate)).toBe("/index.html v1");
  });

  it("a navigation to a precached file gets that file", async () => {
    const { network } = server();
    const scope = await installed(shell, { version: "v1", files: [...files, "/about.html"] }, network);
    scope.network = offline;
    expect(await text(scope, "/assets/app.1a.css", navigate)).toBe("/assets/app.1a.css v1");
  });

  it("the shell must be prefetched: starting with a manifest where it is not fails with a clear error", () => {
    const lazyShell: ServiceWorkerConfig = {
      assetGroups: [{ name: "pages", installMode: "lazy", files: ["/*.html"] }],
      navigationFallback: { url: "/index.html" },
    };
    expect(() => defineWorker({ config: lazyShell }).start(createWorkerScope(), v1)).toThrow(
      `navigationFallback.url: "/index.html" must be a file of a prefetch asset group`,
    );
    expect(() => defineWorker({ config: shell }).start(createWorkerScope(), { version: "v1", files: ["/app.js"] })).toThrow(ServiceWorkerConfigError);
  });
});

describe("manifest hashes", () => {
  // SHA-256, first 16 hex digits, of what `server()` answers for each path in release v1 (`<path> v1`): the Vite plugin's format.
  const hashes = { "/index.html": "25cbaf47afc584ea", "/assets/app.1a.js": "93c9ce537640f45d", "/assets/app.1a.css": "ababf3beed416e7d" };
  const install = async (manifest: AssetManifest, network: Network) => {
    const scope = createWorkerScope({ network });
    defineWorker({ config: assets }).start(scope, manifest);
    await scope.install();
    return scope;
  };

  it.skipIf(globalThis.crypto?.subtle === undefined)("are verified when the release installs: a prefetch file that differs fails the install", async () => {
    const ok = await install({ ...v1, hashes }, server().network);
    expect(await ok.caches.keys()).toEqual(["gable-precache:v1"]);

    const stale = server({ name: "v1" });
    const swapped: Network = (request) => (new URL(request.url).pathname === "/assets/app.1a.css" ? new Response("body from release v2") : stale.network(request));
    const scope = createWorkerScope({ network: swapped });
    defineWorker({ config: assets }).start(scope, { ...v1, hashes });
    await expect(scope.install()).rejects.toThrow(/app\.1a\.css does not match its manifest hash/);
    expect(scope.state).toBe("redundant");
    expect(await scope.caches.keys()).toEqual([]);
  });

  it("do not matter for files that are lazy or left to the network", async () => {
    const lazyHashes = { ...hashes, "/images/logo.png": "0000000000000000", "/robots.txt": "0000000000000000" };
    const scope = await install({ ...v1, hashes: lazyHashes }, server().network);
    expect(await scope.caches.keys()).toEqual(["gable-precache:v1"]);
  });

  it("a manifest without hashes installs without verification", async () => {
    const swapped: Network = () => new Response("body from release v2");
    const scope = await install(v1, swapped);
    expect(await scope.caches.keys()).toEqual(["gable-precache:v1"]);
  });
});

describe("the asset manifest", () => {
  it("is checked when the worker starts", () => {
    const start = (manifest: unknown) => () => defineWorker({ config: assets }).start(createWorkerScope(), manifest as AssetManifest);
    expect(start({ version: "", files: ["/a.js", "b.js", 3] })).toThrow(
      [
        "the asset manifest is invalid:",
        `  - version: must be a non-empty string, got ""`,
        `  - files[1]: must be a path starting with "/", got "b.js"`,
        `  - files[2]: must be a path starting with "/", got 3`,
      ].join("\n"),
    );
    expect(start(undefined)).toThrow("the asset manifest is invalid");
    expect(start({ version: "v1" })).toThrow("files: must be an array of paths");
  });

  it("checks its hashes, when it has them, are non-empty strings", () => {
    const start = (hashes: unknown) => () => defineWorker({ config: assets }).start(createWorkerScope(), { ...v1, hashes } as AssetManifest);
    expect(start({ "/index.html": "", "/assets/app.1a.js": 3 })).toThrow(
      [
        "the asset manifest is invalid:",
        `  - hashes["/index.html"]: must be a non-empty hash string, got ""`,
        `  - hashes["/assets/app.1a.js"]: must be a non-empty hash string, got 3`,
      ].join("\n"),
    );
    expect(start([])).toThrow("hashes: must be an object of hashes by path");
    expect(start({})).not.toThrow();
  });

  it("validateManifest() checks a manifest against a config without starting a worker", () => {
    expect(validateManifest(assets, v1)).toBe(v1);
    expect(() => validateManifest({ ...assets, navigationFallback: { url: "/missing.html" } }, v1)).toThrow(ServiceWorkerConfigError);
  });
});

/** A data server: each answer counts up, so a cached answer is told apart from a fresh one. `delayMs` slows it down. */
function dataServer() {
  const state = { count: 0, delayMs: 0, online: true };
  const network: Network = async (request) => {
    if (!state.online) throw new TypeError(`Failed to fetch ${request.url}`);
    const answer = `${new URL(request.url).pathname}${new URL(request.url).search} #${++state.count}`;
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    return new Response(answer);
  };
  return { state, network };
}

describe("data groups", () => {
  const data: ServiceWorkerConfig = {
    dataGroups: [
      { name: "api", urls: ["/api/**"], strategy: "freshness" },
      { name: "slow", urls: ["/slow/**"], strategy: "freshness", timeoutMs: 20 },
      { name: "avatars", urls: ["https://cdn.example/avatars/*"], strategy: "performance" },
    ],
  };

  it("freshness answers from the network, and from the cache when the network fails", async () => {
    const { state, network } = dataServer();
    const scope = await installed(data, v1, network);
    expect(await text(scope, "/api/users")).toBe("/api/users #1");
    expect(await text(scope, "/api/users")).toBe("/api/users #2");
    await scope.idle();
    state.online = false;
    expect(await text(scope, "/api/users")).toBe("/api/users #2");
    await expect(scope.dispatchFetch("/api/never-fetched")).rejects.toThrow(TypeError);
  });

  it("freshness with timeoutMs answers from the cache when the network is slower than that", async () => {
    const { state, network } = dataServer();
    const scope = await installed(data, v1, network);
    expect(await text(scope, "/slow/report")).toBe("/slow/report #1");
    await scope.idle();
    state.delayMs = 200;
    expect(await text(scope, "/slow/report")).toBe("/slow/report #1");
    await scope.idle(); // the late answer is still stored
    state.delayMs = 0;
    state.online = false;
    expect(await text(scope, "/slow/report")).toBe("/slow/report #2");
  });

  it("performance answers from the cache at once and refreshes it in the background", async () => {
    const { network } = dataServer();
    const scope = await installed(data, v1, network);
    expect(await text(scope, "https://cdn.example/avatars/ada.png")).toBe("/avatars/ada.png #1");
    await scope.idle();
    expect(await text(scope, "https://cdn.example/avatars/ada.png")).toBe("/avatars/ada.png #1");
    await scope.idle();
    expect(await text(scope, "https://cdn.example/avatars/ada.png")).toBe("/avatars/ada.png #2");
  });

  it("patterns ignore the query string, but each query is cached on its own", async () => {
    const { state, network } = dataServer();
    const scope = await installed(data, v1, network);
    await text(scope, "/api/search?q=a");
    await text(scope, "/api/search?q=b");
    await scope.idle();
    state.online = false;
    expect(await text(scope, "/api/search?q=a")).toBe("/api/search?q=a #1");
    expect(await text(scope, "/api/search?q=b")).toBe("/api/search?q=b #2");
  });

  it("* matches within one path segment, and path patterns match only the worker's own origin", async () => {
    const { state, network } = dataServer();
    const scope = await installed({ dataGroups: [{ name: "users", urls: ["/users/*"], strategy: "freshness" }] }, v1, network);
    await text(scope, "/users/7");
    await text(scope, "/users/7/posts");
    await text(scope, "https://other.example/users/7");
    await scope.idle();
    state.online = false;
    expect(await text(scope, "/users/7")).toBe("/users/7 #1");
    await expect(scope.dispatchFetch("/users/7/posts")).rejects.toThrow(TypeError);
    await expect(scope.dispatchFetch("https://other.example/users/7")).rejects.toThrow(TypeError);
  });

  it("only GET requests are cached; others go straight to the network", async () => {
    const { state, network } = dataServer();
    const scope = await installed(data, v1, network);
    expect(await text(scope, "/api/users", { method: "POST", body: "{}" })).toBe("/api/users #1");
    await scope.idle();
    state.online = false;
    await expect(scope.dispatchFetch("/api/users")).rejects.toThrow(TypeError);
  });

  it("the first matching group answers, and URLs no group matches go to the network uncached", async () => {
    const { state, network } = dataServer();
    const scope = await installed(
      { dataGroups: [{ name: "first", urls: ["/api/**"], strategy: "performance" }, { name: "second", urls: ["/api/**"], strategy: "freshness" }] },
      v1,
      network,
    );
    await text(scope, "/api/users");
    await text(scope, "/other");
    await scope.idle();
    expect(await scope.caches.keys()).toContain("gable-data:first");
    expect(await scope.caches.keys()).not.toContain("gable-data:second");
    state.online = false;
    await expect(scope.dispatchFetch("/other")).rejects.toThrow(TypeError);
  });

  it("data caches outlive releases; the caches of groups the new config drops are removed", async () => {
    const { state, network } = dataServer();
    const old = await installed(data, v1, network);
    await text(old, "/api/users");
    await text(old, "https://cdn.example/avatars/ada.png");
    await old.idle();
    const next = nextRelease(old, { dataGroups: [data.dataGroups![0]!] }, { version: "v2", files: [] }, network);
    await next.install();
    await next.activate();
    expect((await next.caches.keys()).filter((key) => key.startsWith("gable-data:"))).toEqual(["gable-data:api"]);
    state.online = false;
    expect(await text(next, "/api/users")).toBe("/api/users #1");
  });
});
