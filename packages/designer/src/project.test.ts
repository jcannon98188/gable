// The project switcher, the Preview agent check and the dev server's lifecycle (src/server/projects.ts, dev-server.ts).
// The dev server tests use a fake `vite` package: a script that serves the preview port the way the real one does, so
// start, crash, restart and the log are exercised with real processes.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startBackend } from "./server/backend.js";
import { DevServer, ProjectLog, findPackage, stripAnsi, type DevServerState } from "./server/dev-server.js";
import { checkProject, detectPackageManager, listFolders, projectProblem, recentProjects, rememberProject } from "./server/projects.js";

const temp = (prefix = "designer-project-") => mkdtempSync(join(tmpdir(), prefix));
const write = (file: string, text: string) => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
};
const manifest = (dir: string, value: object) => write(join(dir, "package.json"), JSON.stringify(value));

/** A project with a fake `vite` whose server answers on the preview port; `/__die` makes it exit with code 3. */
function fakeProject(behaviour: "serve" | "fail" = "serve"): string {
  const dir = temp();
  manifest(dir, { name: "fake-app", dependencies: { "@gable/core": "*" }, devDependencies: { vite: "*" } });
  manifest(join(dir, "node_modules", "vite"), { name: "vite", version: "9.9.9", bin: { vite: "bin/vite.js" } });
  write(
    join(dir, "node_modules", "vite", "bin", "vite.js"),
    behaviour === "fail"
      ? `console.error("failed to load config: boom"); process.exit(1);\n`
      : `const http = require("node:http");
const port = Number(process.env.GABLE_DESIGNER_PORT);
http.createServer((req, res) => {
  if (req.url === "/__die") { res.end("bye"); setTimeout(() => process.exit(3), 20); return; }
  res.end("<!doctype html><title>fake</title>");
}).listen(port, "localhost", () => console.log("\\u001b[32mVITE ready\\u001b[39m on " + port + " root=" + process.argv[2]));
`,
  );
  manifest(join(dir, "node_modules", "@gable", "core"), { name: "@gable/core", version: "1.2.3", exports: { ".": "./index.js", "./designer": "./designer.js" } });
  return dir;
}

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });

async function until<T>(fn: () => T | Promise<T>, what: string, ms = 15000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("recent projects", () => {
  it("keeps the most recent first, once each, and marks folders that are gone", () => {
    const data = temp("designer-data-");
    const a = temp();
    const b = temp();
    manifest(a, { name: "app-a" });
    manifest(b, {});
    rememberProject(a, data, 1);
    rememberProject(b, data, 2);
    const list = rememberProject(a, data, 3);
    expect(list.map((p) => p.root)).toEqual([a, b]);
    expect(list[0]).toMatchObject({ name: "app-a", openedAt: 3, missing: false });
    expect(list[1]!.name).toBe(b.split(/[\\/]/).pop());
    rememberProject(join(a, "gone"), data, 4);
    expect(recentProjects(data)[0]).toMatchObject({ root: join(a, "gone"), missing: true });
  });

  it("holds ten at most and survives a broken file", () => {
    const data = temp("designer-data-");
    const root = temp();
    for (let i = 0; i < 14; i++) rememberProject(join(root, `p${i}`), data, i);
    const list = recentProjects(data);
    expect(list).toHaveLength(10);
    expect(list[0]!.root).toBe(join(root, "p13"));
    write(join(data, "recent.json"), "{not json");
    expect(recentProjects(data)).toEqual([]);
  });
});

describe("opening and browsing", () => {
  it("says why a folder cannot be opened", () => {
    const dir = temp();
    expect(projectProblem("relative/path")).toMatch(/full path/);
    expect(projectProblem(join(dir, "nope"))).toMatch(/no folder/);
    expect(projectProblem(dir)).toMatch(/no package\.json/);
    manifest(dir, {});
    expect(projectProblem(dir)).toBeNull();
  });

  it("lists sub-folders only, projects first, without hidden folders or node_modules", () => {
    const dir = temp();
    manifest(join(dir, "zeta-app"), {});
    mkdirSync(join(dir, "alpha"));
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "node_modules"));
    write(join(dir, "file.txt"), "x");
    const listing = listFolders(dir);
    expect(listing.dir).toBe(dir);
    expect(listing.parent).toBe(join(dir, ".."));
    expect(listing.folders.map((f) => [f.name, f.project])).toEqual([
      ["zeta-app", true],
      ["alpha", false],
    ]);
    expect(listFolders(join(dir, "missing")).error).toMatch(/Cannot read/);
  });
});

describe("the project check", () => {
  it("finds the package manager from the packageManager field or the nearest lockfile", () => {
    const dir = temp();
    manifest(dir, {});
    expect(detectPackageManager(dir)).toBe("npm");
    write(join(dir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(dir)).toBe("pnpm");
    manifest(join(dir, "app"), { packageManager: "yarn@4.1.0" });
    expect(detectPackageManager(join(dir, "app"))).toBe("yarn");
    manifest(join(dir, "other"), {});
    expect(detectPackageManager(join(dir, "other"))).toBe("pnpm");
  });

  it("offers the package manager's install when listed dependencies are not installed", () => {
    const dir = temp();
    manifest(dir, { dependencies: { "@gable/core": "^1" }, devDependencies: { vite: "^8" } });
    const check = checkProject(dir);
    expect(check.agent).toMatchObject({ found: false, listed: true });
    expect(check.agent.problem).toMatch(/Preview agent not installed/);
    expect(check.vite.found).toBe(false);
    expect(check.install).toEqual(["npm", "install"]);
    expect(check.problem).toBeNull();
  });

  it("is satisfied by a @gable/core with the designer entry and a vite", () => {
    const check = checkProject(fakeProject());
    expect(check).toMatchObject({ install: null, problem: null, vite: { found: true, version: "9.9.9" }, agent: { found: true, version: "1.2.3", problem: null } });
  });

  it("names what cannot be installed from here", () => {
    const notGable = temp();
    manifest(notGable, { devDependencies: { vite: "*" } });
    expect(checkProject(notGable)).toMatchObject({ install: null, problem: expect.stringMatching(/not a Gable app/) });

    const old = fakeProject();
    manifest(join(old, "node_modules", "@gable", "core"), { name: "@gable/core", version: "0.0.1", exports: { ".": "./index.js" } });
    const check = checkProject(old);
    expect(check.install).toBeNull();
    expect(check.agent.found).toBe(false);
    expect(check.problem).toMatch(/has no designer entry/);

    expect(checkProject(temp())).toMatchObject({ packageJson: false, problem: expect.stringMatching(/no package\.json/) });
  });

  it("finds packages the way Node does, up the tree", () => {
    const dir = fakeProject();
    mkdirSync(join(dir, "packages", "web"), { recursive: true });
    expect(findPackage(join(dir, "packages", "web"), "vite")?.json.version).toBe("9.9.9");
    expect(findPackage(join(dir, "packages", "web"), "nope")).toBeNull();
  });
});

describe("the dev server", () => {
  const servers: DevServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => s.stop()));
  });
  const make = async (root: string) => {
    const states: DevServerState[] = [];
    const log = new ProjectLog();
    const server = new DevServer({ root, port: await freePort(), configFile: "unused.js", log, onChange: (s) => states.push(s), startTimeout: 10000 });
    servers.push(server);
    return { server, log, states };
  };

  it("keeps a bounded log without colour codes", () => {
    const chunks: string[] = [];
    const log = new ProjectLog(30, (c) => chunks.push(c));
    log.append("\u001b[31mfirst line\u001b[0m\n");
    log.append("second line\nthird line\n");
    expect(chunks[0]).toBe("first line\n");
    expect(log.text().length).toBeLessThanOrEqual(30);
    expect(log.text()).toBe("second line\nthird line\n");
    expect(log.tail(1)).toEqual(["third line"]);
    expect(stripAnsi("\u001b[1m\u001b[32mok\u001b[39m\u001b[22m")).toBe("ok");
  });

  it("starts, notices a crash after it was running, and restarts on the same port", async () => {
    const { server, log, states } = await make(fakeProject());
    server.start();
    await until(() => server.state().status === "running", "running");
    expect(server.state().vite).toBe("9.9.9");
    expect(log.text()).toContain("VITE ready");
    expect(log.text()).not.toContain("\u001b[");

    await fetch(server.url + "__die").catch(() => undefined);
    await until(() => server.state().status === "failed", "failed after the crash");
    expect(server.state().error).toBe("The dev server stopped (exit code 3).");
    expect(log.text()).toContain("exited with code 3");

    await server.restart();
    await until(() => server.state().status === "running", "running again");
    expect(server.state().error).toBeNull();
    expect(states.map((s) => s.status)).toEqual(["starting", "running", "failed", "stopped", "starting", "running"]);
  }, 30000);

  it("reports a Vite that exits while starting, with its output in the log", async () => {
    const { server, log } = await make(fakeProject("fail"));
    server.start();
    await until(() => server.state().status === "failed", "failed");
    expect(server.state().error).toBe("The project's Vite exited with code 1.");
    expect(log.text()).toContain("failed to load config: boom");
  }, 20000);

  it("fails at once when the project has no Vite", async () => {
    const dir = temp();
    manifest(dir, {});
    const { server, log } = await make(dir);
    server.start();
    expect(server.state()).toMatchObject({ status: "failed", error: expect.stringMatching(/Could not find Vite/) });
    expect(log.text()).toContain("Could not find Vite");
  });
});

describe("switching projects in the backend", () => {
  it("opens another project behind the same server and token, remembers it, and refuses folders that are not projects", async () => {
    const data = temp("designer-data-");
    const first = fakeProject();
    const second = fakeProject();
    manifest(second, { name: "second-app", dependencies: { "@gable/core": "*" }, devDependencies: { vite: "*" } });
    const backend = await startBackend({ root: first, dataDir: data });
    const api = async (path: string, body?: unknown) => {
      const res = await fetch(backend.url + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { authorization: `Bearer ${backend.token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> & Array<Record<string, unknown>> };
    };
    try {
      await until(async () => (await api("/api/project")).body.ready, "the first project is running");
      const before = (await api("/api/project")).body;
      expect(before).toMatchObject({ root: first, server: "running", installing: false, check: { install: null } });

      expect((await api("/api/project/open", { root: join(first, "missing") })).status).toBe(400);
      expect((await api("/api/project/open", { root: "relative" })).body.error).toMatch(/full path/);

      const opened = await api("/api/project/open", { root: second });
      expect(opened.status).toBe(200);
      expect(opened.body).toMatchObject({ root: second, name: "second-app", previewUrl: before.previewUrl });
      await until(async () => (await api("/api/project")).body.ready, "the second project is running");
      expect((await api("/api/project/recent")).body.map((p) => p.root)).toEqual([second]);

      const log = await api("/api/server/log");
      expect(log.body.text).toContain(`root=${second}`);
      expect((await api("/api/project/install", {})).status).toBe(409);

      const restarted = await api("/api/server/restart", {});
      expect(restarted.body.root).toBe(second);
      await until(async () => (await api("/api/project")).body.ready, "running after the restart");

      const folders = await api(`/api/project/folders?${new URLSearchParams({ dir: join(second, "..") })}`);
      expect((folders.body.folders as unknown as Array<{ path: string; project: boolean }>).some((f) => f.path === second && f.project)).toBe(true);
    } finally {
      await backend.close();
    }
  }, 40000);
});
