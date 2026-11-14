import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { browserPath, openPage, sleep, type Page } from "../../vite/src/test-browser.js";
import { scaffold } from "./index.js";

const repo = fileURLToPath(new URL("../../..", import.meta.url));

// Everything @gable/* the starters install. Nothing is published, so the CI test packs these from the workspace
// and installs the starters from the tarballs (see docs/manual-setup.md, "Trying unpublished builds").
const PACKAGES = ["core", "renderer-dom", "testing", "vite", "language-service", "prettier-plugin", "template-format", "service-worker"];

const run = (cmd: string, cwd: string) => {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe", env: { ...process.env, npm_config_user_agent: undefined } });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    throw new Error(`${cmd} failed in ${cwd}
${e.stdout ?? ""}
${e.stderr ?? ""}`);
  }
};

let work: string;
let project: string;
let swProject: string;

/** Scaffolds a starter into `work/<name>` and installs it with every @gable/* package from the tarballs. */
function create(name: string, tarballs: Record<string, string>, serviceWorker: boolean): string {
  const dir = join(work, name);
  scaffold({ name, targetDir: dir, serviceWorker });
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  for (const key of ["dependencies", "devDependencies"]) {
    for (const dep of Object.keys(manifest[key] ?? {})) if (dep in tarballs) manifest[key][dep] = tarballs[dep];
  }
  manifest.overrides = tarballs; // @gable/* packages depend on each other at the lockstep version
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));
  run("npm install --no-audit --no-fund", dir);
  return dir;
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "create-gable-"));
  run("npm run build", repo);
  const tarballs: Record<string, string> = {};
  mkdirSync(join(work, "tarballs"));
  for (const name of PACKAGES) {
    const file = run(`npm pack ./packages/${name} --pack-destination "${join(work, "tarballs")}" --silent`, repo).trim().split("\n").pop()!;
    tarballs[`@gable/${name}`] = `file:${join(work, "tarballs", file).split(sep).join("/")}`;
  }
  project = create("my-app", tarballs, false);
  swProject = create("sw-app", tarballs, true);
}, 900_000);

afterAll(() => rmSync(work, { recursive: true, force: true, maxRetries: 5 }));

const bundle = (dir: string) => {
  const assets = join(dir, "dist/assets");
  return readdirSync(assets)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join(assets, f), "utf8"))
    .join("\n");
};

describe("the scaffolded starter", () => {
  it("passes check, test and build, and the production bundle has no HMR code", { timeout: 300_000 }, () => {
    run("npm run check", project);
    run("npx prettier --check src vite.config.ts", project); // the starter is already formatted, templates included
    expect(run("npm test", project)).toMatch(/passed/);
    run("npm run build", project);

    const code = bundle(project);
    expect(code.length).toBeGreaterThan(0);
    expect(code).toContain("Count"); // the sample app itself is bundled
    expect(code).not.toMatch(/import\.meta\.hot|__gableHmr|__gableSelf|applyUpdate|registerModule|dev-hooks|hooks\.current/);
    const assets = join(project, "dist/assets");
    const css = readdirSync(assets).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(assets, f), "utf8")).join("\n");
    expect(css).toMatch(/tailwindcss/i);
  });

  it("pays nothing for the service worker option when it is off", () => {
    expect(existsSync(join(project, "node_modules/@gable/service-worker"))).toBe(false);
    expect(existsSync(join(project, "dist/sw.js"))).toBe(false);
    expect(existsSync(join(project, "dist/sw-manifest.json"))).toBe(false);
    expect(bundle(project)).not.toMatch(/serviceWorker|gable-sw@1/);
  });
});

describe("the scaffolded starter with --service-worker", () => {
  it("passes check, test and build, and the build emits the worker and its manifest", { timeout: 300_000 }, () => {
    run("npm run check", swProject);
    run("npx prettier --check src vite.config.ts gable.sw.json", swProject);
    expect(run("npm test", swProject)).toMatch(/passed/);
    run("npm run build", swProject);

    const manifest = JSON.parse(readFileSync(join(swProject, "dist/sw-manifest.json"), "utf8"));
    expect(manifest.files).toContain("/index.html");
    expect(manifest.files.some((f: string) => /^\/assets\/.+\.js$/.test(f))).toBe(true);
    expect(readFileSync(join(swProject, "dist/sw.js"), "utf8")).toContain(manifest.version);
    expect(bundle(swProject)).toContain("gable-sw@1"); // the app side is bundled
  });

  // A production build in a real browser: install, go offline, serve the cached app, then apply a new release
  // through the starter's update banner, which calls activateUpdate(). Skipped when no Chromium is found.
  it.skipIf(!browserPath)("installs, works offline and applies an update through activateUpdate()", { timeout: 180_000 }, async () => {
    run("npm run build", swProject); // the first release
    const dist = join(swProject, "dist");
    const server = serve(dist);
    const origin = await listening(server.server);
    const version = () => JSON.parse(readFileSync(join(dist, "sw-manifest.json"), "utf8")).version as string;
    const v1 = version();
    let page: Page | undefined;
    try {
      page = await openPage();
      const p = page;
      /** Navigates and waits until the new document's app has rendered its heading. */
      const load = async (url: string) => {
        await p.eval("window.__previousPage = true");
        await p.goto(url);
        await until(p, `!window.__previousPage && document.querySelector("h1")?.textContent`);
      };
      const heading = () => p.eval<string>(`document.querySelector("h1").textContent`);
      const cacheNames = () => p.eval<string[]>("caches.keys()");

      // First visit: the worker installs the release and activates; the page itself is not controlled yet.
      await load(`${origin}/`);
      await until(p, `navigator.serviceWorker.getRegistration().then((r) => r?.active?.state === "activated")`);
      expect(await cacheNames()).toContain(`gable-precache:${v1}`);
      await load(`${origin}/`);
      expect(await p.eval("navigator.serviceWorker.controller !== null")).toBe(true);

      // Offline: the server drops every request, and the app still loads, client-side routes included.
      server.offline = true;
      expect(await p.eval(`fetch("/sw-manifest.json").then(() => "online", () => "offline")`)).toBe("offline");
      await load(`${origin}/`);
      expect(await heading()).toBe("Hello, Gable");
      await load(`${origin}/some/client/route`);
      expect(await heading()).toBe("Hello, Gable");

      // A new release, back online. The page has the browser look for a new worker script (browsers also do on
      // navigation, on their own schedule); the new release installs and waits, and the banner offers it.
      const root = join(swProject, "src/root.ts");
      writeFileSync(root, readFileSync(root, "utf8").replace("Hello, Gable</h1>", "Hello again, Gable</h1>"));
      run("npm run build", swProject);
      const v2 = version();
      expect(v2).not.toBe(v1);
      server.offline = false;
      await load(`${origin}/`);
      await p.eval("navigator.serviceWorker.getRegistration().then((r) => r.update())");
      await until(p, `document.querySelector("p.update button")`);
      expect(await heading()).toBe("Hello, Gable"); // the running release keeps serving until the app activates
      expect(await cacheNames()).toEqual(expect.arrayContaining([`gable-precache:${v1}`, `gable-precache:${v2}`]));

      // The banner's button calls activateUpdate() and reloads into the new release; the old release's cache is gone.
      await p.eval(`window.__previousPage = true; document.querySelector("p.update button").click()`);
      await until(p, `!window.__previousPage && document.querySelector("h1")?.textContent === "Hello again, Gable"`);
      const names = await cacheNames();
      expect(names).toContain(`gable-precache:${v2}`);
      expect(names).not.toContain(`gable-precache:${v1}`);
      expect(await p.eval(`document.querySelector("p.update")`)).toBe(null);

      // And the new release works offline too.
      server.offline = true;
      await load(`${origin}/`);
      expect(await heading()).toBe("Hello again, Gable");
    } finally {
      page?.close();
      server.server.closeAllConnections();
      server.server.close();
    }
  });
});

/** Polls an expression in the page (it may return a promise) until its value is truthy. */
async function until(page: Page, expression: string, timeout = 30_000): Promise<void> {
  const end = Date.now() + timeout;
  let last: unknown;
  for (;;) {
    try {
      if (await page.eval<unknown>(`(async () => ${expression})()`)) return;
    } catch (error) {
      last = error; // the page may be between documents
    }
    if (Date.now() > end) throw new Error(`timed out waiting for: ${expression}${last ? ` (${String(last)})` : ""}`);
    await sleep(100);
  }
}

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

/** A static file server for `dir`, like a production host. With `offline` set it drops every request unanswered. */
function serve(dir: string): { server: Server; offline: boolean } {
  const state = { offline: false, server: undefined as unknown as Server };
  state.server = createServer((req, res) => {
    if (state.offline) return void req.socket.destroy();
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    let file = normalize(join(dir, path === "/" ? "index.html" : path));
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) file = join(dir, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(readFileSync(file));
  });
  return state;
}

async function listening(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`; // a secure context, as service workers need
}
