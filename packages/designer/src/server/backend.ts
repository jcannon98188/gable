// The Designer's backend: a Node sidecar the Tauri shell spawns (Rust stays thin: window, process lifetime). It
// owns what needs the TypeScript tooling: running the project's own Vite, mapping nodes to source ranges, finding scenes
// files, and running the Template language service. The shell talks to it over HTTP with a per-session token.
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, watch } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AnalysisOutput } from "./analyze-worker.js";
import { CdpEmulator } from "./cdp.js";
import { handleDeviceApi } from "./device-api.js";
import { resolveNode, type NodeReport } from "./source.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface BackendOptions {
  root: string;
  /** Directory of the built shell, served at `/` (browser mode; Tauri bundles it). */
  shellDir?: string;
  port?: number;
  previewPort?: number;
  /** The webview's Chrome DevTools Protocol port (Windows WebView2 in the desktop app): enables device emulation. */
  cdpPort?: number;
}

export interface ProjectInfo {
  root: string;
  name: string;
  previewUrl: string;
  ready: boolean;
  /** Set when the project's Vite could not start. */
  error: string | null;
}

export interface Backend {
  readonly url: string;
  readonly token: string;
  readonly previewUrl: string;
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

export async function startBackend(options: BackendOptions): Promise<Backend> {
  const root = resolve(options.root);
  const token = randomBytes(24).toString("hex");
  const previewPort = options.previewPort ?? (await freePort());
  const previewUrl = `http://localhost:${previewPort}/`;
  const info: ProjectInfo = { root, name: root.split(/[\\/]/).pop() ?? root, previewUrl, ready: false, error: null };

  // --- the project's own Vite -------------------------------------------------
  const require = createRequire(pathToFileURL(join(root, "package.json")));
  let vite: ChildProcess | null = null;
  try {
    const viteBin = join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
    vite = spawn(process.execPath, [viteBin, root, "--config", join(here, "project-vite-config.js")], {
      cwd: root,
      env: { ...process.env, GABLE_DESIGNER_ROOT: root, GABLE_DESIGNER_PORT: String(previewPort) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const log = (d: Buffer) => process.stderr.write(`[project vite] ${d}`);
    vite.stdout!.on("data", log);
    vite.stderr!.on("data", log);
    vite.on("exit", (code) => !info.ready && (info.error = `The project's Vite exited with code ${code}.`));
  } catch (error) {
    info.error = `Could not find Vite in the project: ${error instanceof Error ? error.message : error}`;
  }
  const probe = async () => {
    for (let i = 0; i < 300 && !info.error; i++) {
      try {
        if ((await fetch(previewUrl, { signal: AbortSignal.timeout(1000) })).ok) return void (info.ready = true);
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    info.error ??= "The project's Vite did not start in time.";
  };
  void probe();

  const cdp = options.cdpPort ? new CdpEmulator(options.cdpPort) : null;

  // --- diagnostics -------------------------------------------------------------
  let diagnostics: (AnalysisOutput & { at: number; running?: boolean }) | null = null;
  let analyzing: Promise<void> | null = null;
  const runAnalysis = () =>
    (analyzing ??= new Promise<void>((done) => {
      if (!existsSync(join(root, "tsconfig.json"))) {
        diagnostics = { diagnostics: [], configErrors: ["The project has no tsconfig.json."], at: Date.now() };
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
          diagnostics = { ...(JSON.parse(out) as AnalysisOutput), at: Date.now() };
        } catch {
          diagnostics = { diagnostics: [], configErrors: [err.trim().split("\n").pop() || "The analyzer failed."], at: Date.now() };
        }
        analyzing = null;
        broadcast("diagnostics", diagnostics);
        done();
      });
    }));

  // --- events (SSE) and file watching -----------------------------------------------
  const clients = new Set<ServerResponse>();
  const broadcast = (event: string, data: unknown) => {
    for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  let debounce: NodeJS.Timeout | undefined;
  const watcher = watch(root, { recursive: true }, (_, file) => {
    if (!file || !/\.(ts|tsx|css|html)$/.test(file)) return;
    if (file.split(/[\\/]/).some((p) => SKIP.has(p))) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      broadcast("files", { file: file.split(sep).join("/"), scenes: findScenes(root) });
      if (file.endsWith(".ts")) void runAnalysis();
    }, 250);
  });

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

    if (url.pathname.startsWith("/api/")) {
      const bearer = req.headers.authorization === `Bearer ${token}` || url.searchParams.get("token") === token;
      if (!bearer) return json(res, 401, { error: "missing or wrong token" });
      switch (url.pathname) {
        case "/api/project":
          return json(res, 200, info);
        case "/api/scenes":
          return json(res, 200, findScenes(root));
        case "/api/diagnostics": {
          if (!diagnostics) await runAnalysis();
          else if (url.searchParams.has("refresh")) await runAnalysis();
          return json(res, 200, diagnostics);
        }
        case "/api/resolve": {
          const report = JSON.parse(await readBody(req)) as NodeReport;
          return json(res, 200, resolveNode(root, report));
        }
        case "/api/events":
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
          res.write(": ok\n\n");
          clients.add(res);
          req.on("close", () => clients.delete(res));
          return;
      }
      if (await handleDeviceApi({ root, previewUrl, cdp, json, readBody }, req, res, url)) return;
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

  return {
    url: origin,
    token,
    previewUrl,
    async close() {
      clearTimeout(debounce);
      watcher.close();
      for (const c of clients) c.end();
      cdp?.close();
      vite?.kill();
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}
