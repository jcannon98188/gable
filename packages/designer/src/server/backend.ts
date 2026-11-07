// The Designer's backend: a Node sidecar the Tauri shell spawns (Rust stays thin: window, process lifetime). It
// owns what needs the TypeScript tooling: running the project's own Vite, mapping nodes to source ranges, finding scenes
// files, and running the Template language service. The shell talks to it over HTTP with a per-session token.
// Everything that belongs to one project lives in a Session; opening another project closes it and starts a new one behind
// the same server, token and preview port, so the shell only has to reload.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, watch } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisOutput } from "./analyze-worker.js";
import { EditService } from "./edit/service.js";
import type { EditOp, TargetRef } from "./edit/types.js";
import { CdpEmulator } from "./cdp.js";
import { handleDeviceApi } from "./device-api.js";
import { resolveNode, type NodeReport } from "./source.js";
import { sceneIndex } from "./scene-index.js";
import { editRouteConfig, listComponents, locateRouteConfig, type RouteEdit } from "./route-config.js";
import { TailwindService, handleTailwindApi } from "./tailwind/api.js";
import { DevServer, ProjectLog, type DevServerStatus } from "./dev-server.js";
import { checkProject, projectName, rememberProject, runInstall, type ProjectCheck } from "./projects.js";
import { handleProjectApi } from "./project-api.js";
import { dataDir } from "./settings.js";
import { createControlPlane } from "./mcp/plane.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface BackendOptions {
  root: string;
  /** Directory of the built shell, served at `/` (browser mode; Tauri bundles it). */
  shellDir?: string;
  port?: number;
  previewPort?: number;
  /** The webview's Chrome DevTools Protocol port (Windows WebView2 in the desktop app): enables device emulation. */
  cdpPort?: number;
  /** Where recent projects are kept (tests); the platform's data directory by default. */
  dataDir?: string;
  /** Where the MCP session file is written (the user data directory by default); `false` writes none. */
  mcpSessionDir?: string | false;
}

export interface ProjectInfo {
  root: string;
  name: string;
  previewUrl: string;
  ready: boolean;
  /** Set when the project's Vite could not start, or stopped. */
  error: string | null;
  server: DevServerStatus;
  /** The package manager is installing the project's dependencies (see projects.ts). */
  installing: boolean;
  check: ProjectCheck;
}

export interface Backend {
  readonly url: string;
  readonly token: string;
  readonly previewUrl: string;
  /** The MCP control plane for agents (streamable HTTP; `Authorization: Bearer <token>`). */
  readonly mcp: { url: string; token: string };
  close(): Promise<void>;
}

const freePort = () =>
  new Promise<number>((ok, fail) => {
    const s = createNetServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });

const SKIP = new Set(["node_modules", "dist", ".git", ".vite", "target", "coverage"]);

/** `*.scenes.ts` files under the project, as root-relative URLs (`/src/x.scenes.ts`). */
export function findScenes(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name) && !entry.name.startsWith(".")) walk(join(dir, entry.name));
      } else if (entry.name.endsWith(".scenes.ts")) out.push("/" + relative(root, join(dir, entry.name)).split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" };

/** Everything that belongs to the open project. */
interface Session {
  readonly root: string;
  readonly server: DevServer;
  readonly log: ProjectLog;
  readonly edits: EditService;
  readonly tailwind: TailwindService;
  check: ProjectCheck;
  installing: boolean;
  diagnostics: (AnalysisOutput & { at: number; running?: boolean }) | null;
  runAnalysis(): Promise<void>;
  info(): ProjectInfo;
  close(): Promise<void>;
}

export async function startBackend(options: BackendOptions): Promise<Backend> {
  const token = randomBytes(24).toString("hex");
  const previewPort = options.previewPort ?? (await freePort());
  const previewUrl = `http://localhost:${previewPort}/`;
  const data = options.dataDir ?? dataDir();
  const cdp = options.cdpPort ? new CdpEmulator(options.cdpPort) : null;

  const clients = new Set<ServerResponse>();
  const broadcast = (event: string, data: unknown) => {
    for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // --- the project session ------------------------------------------------------
  function openSession(root: string): Session {
    const current = () => session === s;
    const log = new ProjectLog(200_000, (chunk) => current() && broadcast("log", { chunk }));
    const announce = () => current() && broadcast("server", s.info());
    // The project's own Vite (dev-server.ts); the preview port stays the same across restarts and projects.
    const server = new DevServer({ root, port: previewPort, configFile: join(here, "project-vite-config.js"), log, onChange: () => announce() });

    // --- diagnostics -------------------------------------------------------------
    let analyzing: Promise<void> | null = null;
    const runAnalysis = () =>
      (analyzing ??= new Promise<void>((done) => {
        if (!existsSync(join(root, "tsconfig.json"))) {
          s.diagnostics = { diagnostics: [], configErrors: ["The project has no tsconfig.json."], at: Date.now() };
          analyzing = null;
          return done();
        }
        const child = spawn(process.execPath, [join(here, "analyze-main.js"), root], { stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        child.on("close", () => {
          try {
            s.diagnostics = { ...(JSON.parse(out) as AnalysisOutput), at: Date.now() };
          } catch {
            s.diagnostics = { diagnostics: [], configErrors: [err.trim().split("\n").pop() || "The analyzer failed."], at: Date.now() };
          }
          analyzing = null;
          if (current()) broadcast("diagnostics", s.diagnostics);
          done();
        });
      }));

    // --- file watching ---------------------------------------------------------------
    const edits = new EditService(root);
    const tailwind = new TailwindService(root);
    let debounce: NodeJS.Timeout | undefined;
    const watcher = watch(root, { recursive: true }, (_, file) => {
      if (!file || !/\.(ts|tsx|css|html)$/.test(file)) return;
      if (file.split(/[\\/]/).some((p) => SKIP.has(p))) return;
      // A stylesheet changed: the Tailwind design system (theme, plugins) is rebuilt on next use.
      if (file.endsWith(".css")) (tailwind.invalidate(), broadcast("tailwind", { revision: tailwind.revision }));
      clearTimeout(debounce);
      // An edit made outside the Designer: undo history for that file is marked, and the shell is told.
      if (edits.noteFileChanged(resolve(root, file))) broadcast("history", edits.history());
      debounce = setTimeout(() => {
        broadcast("files", { file: file.split(sep).join("/"), scenes: findScenes(root) });
        if (file.endsWith(".ts")) void runAnalysis();
      }, 250);
    });
    watcher.on("error", () => undefined);

    const s: Session = {
      root,
      server,
      log,
      edits,
      tailwind,
      check: checkProject(root),
      installing: false,
      diagnostics: null,
      runAnalysis,
      info() {
        const state = server.state();
        return { root, name: projectName(root), previewUrl, ready: state.status === "running", error: state.error, server: state.status, installing: s.installing, check: s.check };
      },
      async close() {
        clearTimeout(debounce);
        watcher.close();
        await server.stop();
      },
    };
    return s;
  }

  let session = openSession(resolve(options.root));
  session.server.start();

  // The MCP control plane follows the open project: its context reads whichever session is current.
  const control = createControlPlane({
    get root() {
      return session.root;
    },
    get info() {
      return session.info();
    },
    get edits() {
      return session.edits;
    },
    get tailwind() {
      return session.tailwind;
    },
    cdpPort: options.cdpPort ?? null,
    sessionDir: options.mcpSessionDir,
    diagnostics: async (refresh) => {
      const s = session;
      if (!s.diagnostics || refresh) await s.runAnalysis();
      return s.diagnostics!;
    },
    historyChanged: () => broadcast("history", session.edits.history()),
  });

  /** Closes the open project and opens `root` behind the same server; every shell is told to reload. */
  async function switchProject(root: string): Promise<ProjectInfo> {
    const previous = session;
    session = openSession(root);
    await previous.close();
    session.server.start();
    rememberProject(root, data);
    broadcast("project", { root });
    return session.info();
  }

  /** Runs the project's package manager, then re-checks and restarts the dev server. */
  async function install(): Promise<string | null> {
    const s = session;
    if (s.installing) return "An install is already running.";
    s.check = checkProject(s.root);
    const command = s.check.install;
    if (!command) return s.check.problem ?? "Nothing to install: the Preview agent and Vite are found.";
    s.installing = true;
    broadcast("server", s.info());
    void runInstall(s.root, command, s.log).then(async (code) => {
      s.installing = false;
      s.check = checkProject(s.root);
      if (session !== s) return;
      if (code === 0) await s.server.restart();
      broadcast("server", s.info());
    });
    return null;
  }

  // --- HTTP ---------------------------------------------------------------------
  const shellDir = options.shellDir ? resolve(options.shellDir) : null;
  const port = options.port ?? 0;
  const server: Server = createServer((req, res) => void handle(req, res).catch((e) => json(res, 500, { error: String(e) })));
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((ok) => {
      let body = "";
      req.on("data", (c) => (body += c)).on("end", () => ok(body));
    });
  let origin = "";

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // DNS rebinding: only our own loopback names are accepted as the Host.
    const host = req.headers.host ?? "";
    if (host !== `localhost:${actualPort}` && host !== `127.0.0.1:${actualPort}`) return json(res, 403, { error: "bad host" });
    const url = new URL(req.url ?? "/", origin);
    const fromOrigin = req.headers.origin;
    // The Tauri window loads the bundled shell from its own origin; the browser mode loads it from here.
    if (fromOrigin && (fromOrigin === origin || /^(https?:\/\/tauri\.localhost|tauri:\/\/localhost)$/.test(fromOrigin))) {
      res.setHeader("access-control-allow-origin", fromOrigin);
      res.setHeader("access-control-allow-headers", "authorization, content-type");
    }
    if (req.method === "OPTIONS") return void ((res.statusCode = 204), res.end());
    if (await control.handleMcp(req, res, url)) return;

    if (url.pathname.startsWith("/api/")) {
      const bearer = req.headers.authorization === `Bearer ${token}` || url.searchParams.get("token") === token;
      if (!bearer) return json(res, 401, { error: "missing or wrong token" });
      // The project this request is about; a switch while it runs does not change it halfway.
      const s = session;
      const { root, edits, tailwind } = s;
      switch (url.pathname) {
        case "/api/project":
          return json(res, 200, s.info());
        case "/api/scenes":
          return json(res, 200, findScenes(root));
        case "/api/diagnostics": {
          if (!s.diagnostics) await s.runAnalysis();
          else if (url.searchParams.has("refresh")) await s.runAnalysis();
          return json(res, 200, s.diagnostics);
        }
        case "/api/resolve": {
          const report = JSON.parse(await readBody(req)) as NodeReport;
          return json(res, 200, resolveNode(root, report));
        }
        case "/api/edit/describe":
          return json(res, 200, edits.describe(JSON.parse(await readBody(req)) as TargetRef));
        case "/api/edit/apply": {
          const result = edits.apply(JSON.parse(await readBody(req)) as EditOp);
          if (result.ok) broadcast("history", edits.history());
          return json(res, 200, result);
        }
        case "/api/edit/undo":
        case "/api/edit/redo": {
          const result = url.pathname.endsWith("undo") ? edits.undo() : edits.redo();
          broadcast("history", edits.history());
          return json(res, 200, result);
        }
        case "/api/edit/history":
          return json(res, 200, edits.history());
        case "/api/edit/palette":
          return json(res, 200, edits.palette());
        case "/api/scene-index":
          return json(res, 200, sceneIndex(root));
        case "/api/routes":
          return json(res, 200, { config: locateRouteConfig(root), components: listComponents(root) });
        case "/api/routes/edit": {
          // The file is the one the server finds, never one the client names.
          const config = locateRouteConfig(root);
          if (!config) return json(res, 404, { error: "This project has no route config." });
          try {
            const result = editRouteConfig(root, config.file, JSON.parse(await readBody(req)) as RouteEdit);
            return json(res, 200, { file: result.file, routes: result.routes });
          } catch (e) {
            return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
          }
        }
        case "/api/events":
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
          res.write(": ok\n\n");
          clients.add(res);
          req.on("close", () => clients.delete(res));
          return;
      }
      if (await control.handleShell(req, res, url, readBody, json)) return;
      if (await handleTailwindApi({ service: tailwind, cdp, json, readBody }, req, res, url)) return;
      if (await handleDeviceApi({ root, previewUrl, cdp, json, readBody }, req, res, url)) return;
      const projectApi = { root: () => root, dataDir: data, log: () => s.log.text(), open: switchProject, install, restart: async () => (await s.server.restart(), s.info()), json, readBody };
      if (await handleProjectApi(projectApi, req, res, url)) return;
      return json(res, 404, { error: "no such endpoint" });
    }

    if (!shellDir) return json(res, 404, { error: "this backend serves no shell" });
    const file = normalize(join(shellDir, url.pathname === "/" ? "index.html" : url.pathname));
    if (!file.startsWith(shellDir) || !existsSync(file) || !statSync(file).isFile()) return json(res, 404, { error: "not found" });
    res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
    if (file.endsWith("index.html")) {
      // The token reaches the shell through the page it is served in; a foreign page cannot read this response.
      res.end(readFileSync(file, "utf8").replace("</head>", `<script>globalThis.__GABLE_DESIGNER__=${JSON.stringify({ backend: origin, token })};</script></head>`));
    } else res.end(readFileSync(file));
  }

  let actualPort = 0;
  await new Promise<void>((ok) => server.listen(port, "127.0.0.1", ok));
  actualPort = (server.address() as { port: number }).port;
  origin = `http://127.0.0.1:${actualPort}`;
  control.listening(origin);

  return {
    url: origin,
    token,
    previewUrl,
    mcp: { url: control.url, token: control.mcp.token },
    async close() {
      await control.close();
      for (const c of clients) c.end();
      cdp?.close();
      await session.close();
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}
