// gableServiceWorker() through real Vite builds of the sample app: what a production build emits (the asset manifest
// with content hashes, and the worker file), the emitted worker running on the in-memory worker scope and browser
// from @gable/service-worker's tests, and nothing emitted in dev.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { build, createServer, type InlineConfig, type Rollup } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { createInjector } from "@gable/core";
import { provideServiceWorker, SERVICE_WORKER_CONTAINER, SwRegistration, SwUpdates } from "@gable/service-worker";
import { createBrowser, type WorkerScript } from "../../service-worker/src/testing/browser.js";
import { createWorkerScope, type Network } from "../../service-worker/src/testing/worker-scope.js";
import { gableServiceWorker, type GableServiceWorkerOptions } from "./index.js";
import { sampleApp } from "./test-server.js";

const apps: { remove(): void }[] = [];
afterEach(() => apps.splice(0).forEach((app) => app.remove()));

/** gable.sw.json for the sample app: the shell and bundles prefetched, the navigation fallback on the shell. */
const SW_CONFIG = {
  assetGroups: [{ name: "app", installMode: "prefetch", files: ["/index.html", "/assets/**"] }],
  navigationFallback: { url: "/index.html" },
};

/** A scratch sample app with `files` written into it (paths relative to its root). */
function app(files: Record<string, string> = {}) {
  const sample = sampleApp();
  apps.push(sample);
  const write = (name: string, text: string) => {
    mkdirSync(dirname(join(sample.root, name)), { recursive: true });
    writeFileSync(join(sample.root, name), text);
  };
  write("gable.sw.json", JSON.stringify(SW_CONFIG));
  for (const [name, text] of Object.entries(files)) write(name, text);
  return { ...sample, write, edit: (name: string, change: (text: string) => string) => write(name, change(readFileSync(join(sample.root, name), "utf8"))) };
}

/** A production build of `sample` with the service worker plugin, not written to disk: the emitted files by name. */
async function buildWith(sample: { config: InlineConfig }, options?: GableServiceWorkerOptions, extra: InlineConfig = {}) {
  const out = (await build({
    ...sample.config,
    plugins: [...(sample.config.plugins as never[]), gableServiceWorker(options)],
    ...extra,
    build: { write: false, minify: false, ...extra.build },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[];
  const files = new Map<string, string | Uint8Array>();
  for (const o of (Array.isArray(out) ? out[0]! : out).output) files.set(o.fileName, o.type === "chunk" ? o.code : o.source);
  return files;
}

const text = (files: Map<string, string | Uint8Array>, name: string) => {
  const file = files.get(name);
  if (file === undefined) throw new Error(`${name} was not emitted; emitted: ${[...files.keys()].join(", ")}`);
  return typeof file === "string" ? file : new TextDecoder().decode(file);
};
const sha256 = (content: string | Uint8Array) => createHash("sha256").update(content).digest("hex").slice(0, 16);

interface EmittedManifest {
  version: string;
  files: string[];
  hashes: Record<string, string>;
}

describe("a production build", () => {
  it("emits the asset manifest, listing every emitted file with its content hash, and the worker file", { timeout: 60_000 }, async () => {
    const files = await buildWith(app());
    const manifest = JSON.parse(text(files, "sw-manifest.json")) as EmittedManifest;
    const script = [...files.keys()].find((name) => /^assets\/.*\.js$/.test(name))!;

    expect(manifest.files.sort()).toEqual(["/index.html", `/${script}`].sort());
    expect(manifest.hashes).toEqual({ "/index.html": sha256(files.get("index.html")!), [`/${script}`]: sha256(files.get(script)!) });
    expect(manifest.version).toMatch(/^[0-9a-f]{16}$/);
    expect(text(files, "sw.js")).toContain(manifest.version); // the worker carries its manifest
  });

  it("makes a new release when a file, the config or the worker changes, and the same release otherwise", { timeout: 60_000 }, async () => {
    const sample = app({ "public/robots.txt": "User-agent: *\n" });
    const manifestOf = async () => JSON.parse(text(await buildWith(sample), "sw-manifest.json")) as EmittedManifest;
    const first = await manifestOf();
    expect(first.hashes["/robots.txt"]).toBe(sha256("User-agent: *\n")); // the public directory is part of the build
    expect((await manifestOf()).version).toBe(first.version);

    sample.write("public/robots.txt", "User-agent: *\nDisallow: /admin\n");
    const second = await manifestOf();
    expect(second.version).not.toBe(first.version);
    expect(second.hashes["/robots.txt"]).not.toBe(first.hashes["/robots.txt"]);
    expect(second.hashes["/index.html"]).toBe(first.hashes["/index.html"]); // unchanged files keep their hash

    sample.write("gable.sw.json", JSON.stringify({ ...SW_CONFIG, dataGroups: [{ name: "api", urls: ["/api/**"], strategy: "freshness" }] }));
    const third = await manifestOf();
    expect(third.version).not.toBe(second.version);
    expect(third.hashes).toEqual(second.hashes);
  });

  it("leaves source maps out of the manifest", { timeout: 60_000 }, async () => {
    const files = await buildWith(app(), {}, { build: { sourcemap: true } });
    expect([...files.keys()].some((name) => name.endsWith(".js.map"))).toBe(true);
    const manifest = JSON.parse(text(files, "sw-manifest.json")) as EmittedManifest;
    expect(manifest.files.filter((file) => file.endsWith(".map"))).toEqual([]);
  });

  it("lists paths from the origin's root, under the configured base", { timeout: 60_000 }, async () => {
    const config = {
      assetGroups: [{ name: "app", files: ["/inbox/index.html", "/inbox/assets/**"] }],
      navigationFallback: { url: "/inbox/index.html" },
    };
    const files = await buildWith(app({ "gable.sw.json": JSON.stringify(config) }), {}, { base: "/inbox/" });
    const manifest = JSON.parse(text(files, "sw-manifest.json")) as EmittedManifest;
    expect(manifest.files).toContain("/inbox/index.html");
    expect(manifest.files.every((file) => file.startsWith("/inbox/assets/") || file === "/inbox/index.html")).toBe(true);
  });

  it("fails the build when gable.sw.json does not fit the build", { timeout: 60_000 }, async () => {
    const sample = app({ "gable.sw.json": JSON.stringify({ ...SW_CONFIG, navigationFallback: { url: "/shell.html" } }) });
    await expect(buildWith(sample)).rejects.toThrow(/navigationFallback\.url.*\/shell\.html.*not in the manifest/s);
    await expect(buildWith(app({ "gable.sw.json": `{ "assetGroups": [{ "files": [] }] }` }))).rejects.toThrow(/assetGroups\[0\]\.name/);
  });

  it("names the missing config and the file names a build already uses", { timeout: 60_000 }, async () => {
    const sample = app();
    await expect(buildWith(sample, { config: "config/sw.json" })).rejects.toThrow(/gableServiceWorker\(\).*config[\\/]sw\.json not found/);
    sample.write("public/sw.js", "// a hand-placed worker");
    await expect(buildWith(sample)).rejects.toThrow(/already emits sw\.js/);
  });
});

/** A module reading the flag the app side checks before registering, as registration.ts does. */
const FLAG = `declare const __GABLE_DEV__: boolean | undefined;
export const production = typeof __GABLE_DEV__ === "undefined" ? false : __GABLE_DEV__ === false;
`;

describe("the dev server", () => {
  it("emits no worker file and no manifest, and leaves the app side unregistered", { timeout: 60_000 }, async () => {
    const sample = app({ "src/sw.ts": CUSTOM_WORKER, "src/flag.ts": FLAG });
    const server = await createServer({ ...sample.config, plugins: [...(sample.config.plugins as never[]), gableServiceWorker({ entry: "src/sw.ts" })] });
    try {
      await server.listen();
      const origin = server.resolvedUrls!.local[0]!;
      const index = await (await fetch(origin)).text();
      for (const file of ["sw.js", "sw-manifest.json"]) {
        // Vite answers a path it has no file for with the app's index.html; a browser refuses that as a worker script.
        const response = await fetch(new URL(file, origin));
        expect(response.headers.get("content-type"), file).toMatch(/^text\/html/);
        expect(await response.text(), file).toBe(index);
      }
      // The app side (SwRegistration) registers only when __GABLE_DEV__ is false; in dev nothing defines it.
      const flag = (await server.transformRequest("/src/flag.ts"))!.code;
      expect(flag).toMatch(/typeof __GABLE_DEV__ === "undefined"/);
    } finally {
      await server.close();
    }
  });
});

type Files = Map<string, string | Uint8Array>;

/** The origin's server for one build's output; `online` false takes the network down. */
function serve(build: { files: Files }, state = { online: true }): Network {
  return (request) => {
    if (!state.online) throw new TypeError(`Failed to fetch ${request.url}`);
    const file = build.files.get(new URL(request.url).pathname.slice(1));
    return file === undefined ? new Response("not found", { status: 404 }) : new Response(file as BodyInit);
  };
}

/** The emitted worker file as a script the in-memory worker scope and browser run: a classic script over `self`. */
const workerScript = (files: Files): WorkerScript => (self) => new Function("self", text(files, "sw.js"))(self);

/** A custom worker on core alone: the build's manifest precached atomically per release, updates app-controlled. */
const CUSTOM_WORKER = `
import { createFetchRouter, createPrecache, lifecycle, type WorkerScope } from "@gable/service-worker/core";
import type { AssetManifest } from "@gable/service-worker/runtime";

export default function worker(self: WorkerScope, manifest: AssetManifest): void {
  const precache = createPrecache(self, { version: manifest.version, urls: manifest.files, hashes: manifest.hashes });
  lifecycle(self, { version: manifest.version, install: () => precache.install(), activate: () => precache.activate() });
  createFetchRouter(self).route((url) => precache.has(url), precache.handler).listen();
}
`;

describe("a custom worker built on core", () => {
  it("receives the manifest and keeps atomic versioned updates across releases", { timeout: 90_000 }, async () => {
    const sample = app({ "src/sw.ts": CUSTOM_WORKER });
    const deployed = { files: await buildWith(sample, { entry: "src/sw.ts" }) };
    const v1 = { files: deployed.files, manifest: JSON.parse(text(deployed.files, "sw-manifest.json")) as EmittedManifest };
    const state = { online: true };
    const browser = createBrowser({ network: serve(deployed, state) });
    browser.deploy("/sw.js", workerScript(v1.files));

    const openApp = () => {
      const page = browser.openPage("/");
      const injector = createInjector([
        ...provideServiceWorker({ url: "/sw.js", enabled: true }),
        { provide: SERVICE_WORKER_CONTAINER, useValue: page.container },
      ]);
      return { page, injector, ready: injector.get(SwRegistration)!.ready };
    };
    // The first visit installs v1; the app loaded next runs under it.
    const first = openApp();
    await first.ready;
    await browser.settled();
    first.injector.destroy();
    first.page.close();
    const { injector, ready } = openApp();
    try {
      const updates = injector.get(SwUpdates)!;
      await ready;
      const scope = () => browser.activeScope("/sw.js")!;
      expect(await scope().caches.keys()).toEqual([`gable-precache:${v1.manifest.version}`]);

      // The next release: a changed component, so a new bundle name, a new manifest version and a new worker file.
      sample.edit("src/app.ts", (source) => source.replace("Count:", "Total:"));
      deployed.files = await buildWith(sample, { entry: "src/sw.ts" });
      const v2 = { files: deployed.files, manifest: JSON.parse(text(deployed.files, "sw-manifest.json")) as EmittedManifest };
      expect(v2.manifest.version).not.toBe(v1.manifest.version);
      expect(text(v2.files, "sw.js")).not.toBe(text(v1.files, "sw.js")); // the browser sees new bytes at /sw.js
      browser.deploy("/sw.js", workerScript(v2.files));
      expect(await updates.checkForUpdate()).toBe(true);
      await browser.settled();

      // v2 installed and waits; offline, v1 keeps serving its own release.
      state.online = false;
      const bundle = (release: typeof v1) => release.manifest.files.find((file) => file.endsWith(".js"))!;
      expect(bundle(v2)).not.toBe(bundle(v1));
      expect(await (await scope().dispatchFetch(bundle(v1))).text()).toBe(text(v1.files, bundle(v1).slice(1)));
      await expect(scope().dispatchFetch(bundle(v2))).rejects.toThrow(/Failed to fetch/); // not v1's file: left to the offline network

      expect(await updates.activateUpdate()).toBe(true);
      await browser.settled();
      expect(await (await scope().dispatchFetch(bundle(v2))).text()).toBe(text(v2.files, bundle(v2).slice(1)));
      expect(await scope().caches.keys()).toEqual([`gable-precache:${v2.manifest.version}`]); // v1's release is gone
    } finally {
      injector.destroy();
    }
  });
});

describe("a custom worker entry", () => {
  it("may default-export a defineWorker() result, which is started with the manifest", { timeout: 60_000 }, async () => {
    const entry = `
import { defineWorker } from "@gable/service-worker/runtime";
import config from "../gable.sw.json";
export default defineWorker({ config, extend: ({ manifest }) => { (globalThis as Record<string, unknown>).__started = manifest.version; } });
`;
    const files = await buildWith(app({ "src/sw.ts": entry }), { entry: "src/sw.ts" });
    const manifest = JSON.parse(text(files, "sw-manifest.json")) as EmittedManifest;
    try {
      workerScript(files)(createWorkerScope({ network: serve({ files }) }));
      expect((globalThis as Record<string, unknown>).__started).toBe(manifest.version);
    } finally {
      delete (globalThis as Record<string, unknown>).__started;
    }
  });

  it("fails when the worker module exports neither, and when the entry is missing", { timeout: 60_000 }, async () => {
    const sample = app({ "src/sw.ts": `export const worker = 1;\nexport default 1;\n` });
    const files = await buildWith(sample, { entry: "src/sw.ts" });
    expect(() => workerScript(files)(createWorkerScope())).toThrow(/default export must be a function \(self, manifest\) or a defineWorker\(\) result/);
    await expect(buildWith(sample, { entry: "src/missing.ts" })).rejects.toThrow(/worker entry src\/missing\.ts does not exist/);
  });
});

describe("the emitted default worker", () => {
  it("is minified with the build and still carries its manifest", { timeout: 60_000 }, async () => {
    const files = await buildWith(app(), {}, { build: { minify: true } });
    const manifest = JSON.parse(text(files, "sw-manifest.json")) as EmittedManifest;
    expect(text(files, "sw.js").split("\n").length).toBeLessThan(10);
    const scope = createWorkerScope({ network: serve({ files }) });
    workerScript(files)(scope);
    await scope.install();
    expect(await scope.caches.keys()).toEqual([`gable-precache:${manifest.version}`]);
  });

  it("verifies the files it precaches against the emitted hashes: a file from another build fails the install", { timeout: 90_000 }, async () => {
    const sample = app();
    const files = await buildWith(sample);
    const script = [...files.keys()].find((name) => /^assets\/.*\.js$/.test(name))!;

    // The hashes the plugin emits are the format the worker verifies: the build served as built installs.
    const scope = createWorkerScope({ network: serve({ files }) });
    workerScript(files)(scope);
    await scope.install();

    // A deploy lands mid-install: the server already answers the bundle from the next build, so it differs from the hash.
    const next = new Map(files).set(script, `${text(files, script)}\n/* the next release */`);
    const mixed = createWorkerScope({ network: serve({ files: next }) });
    workerScript(files)(mixed);
    await expect(mixed.install()).rejects.toThrow(new RegExp(`${script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} does not match its manifest hash`));
    expect(await mixed.caches.keys()).toEqual([]);
  });

  it("precaches the build's files on install and serves the app offline from them", { timeout: 60_000 }, async () => {
    const files = await buildWith(app());
    const state = { online: true };
    const scope = createWorkerScope({ network: serve({ files }, state) });
    workerScript(files)(scope);
    await scope.install();
    await scope.activate();

    state.online = false;
    const script = [...files.keys()].find((name) => /^assets\/.*\.js$/.test(name))!;
    expect(await (await scope.dispatchFetch(`/${script}`)).text()).toBe(text(files, script));
    expect(await (await scope.dispatchFetch("/inbox/42", { mode: "navigate" })).text()).toBe(text(files, "index.html"));
  });
});
