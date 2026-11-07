// The project's own Vite (ADR 0002): started with the Designer's wrapper config on a fixed preview port, watched for the
// whole session, and restartable. Its output is kept (with the package manager's, when the Designer installs dependencies)
// in a bounded log the shell shows when the server fails. Nothing here is written to the project.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type DevServerStatus = "starting" | "running" | "failed" | "stopped";

export interface DevServerState {
  status: DevServerStatus;
  /** What failed, in a sentence, while `status` is "failed". */
  error: string | null;
  /** The project's Vite version, when it was found. */
  vite: string | null;
}

/** A bounded text log: the tail is what matters when a server fails. */
export class ProjectLog {
  #text = "";
  constructor(
    readonly limit = 200_000,
    private readonly onAppend: (chunk: string) => void = () => undefined,
  ) {}

  append(chunk: string): void {
    const clean = stripAnsi(chunk);
    if (!clean) return;
    this.#text += clean;
    if (this.#text.length > this.limit) {
      const cut = this.#text.indexOf("\n", this.#text.length - this.limit);
      this.#text = this.#text.slice(cut < 0 ? this.#text.length - this.limit : cut + 1);
    }
    this.onAppend(clean);
  }

  text(): string {
    return this.#text;
  }

  /** The last `n` non-empty lines. */
  tail(n: number): string[] {
    return this.#text.split(/\r?\n/).filter((l) => l.trim()).slice(-n);
  }
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
export const stripAnsi = (s: string) => s.replace(ANSI, "");

/** Finds a package the way Node does from `root` (each `node_modules` up the tree), without going through its exports. */
export function findPackage(root: string, name: string): { dir: string; json: Record<string, unknown> } | null {
  for (let dir = root; ; dir = dirname(dir)) {
    const file = join(dir, "node_modules", ...name.split("/"), "package.json");
    if (existsSync(file)) {
      try {
        return { dir: dirname(file), json: JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown> };
      } catch {
        return null;
      }
    }
    if (dirname(dir) === dir) return null;
  }
}

export interface DevServerOptions {
  root: string;
  port: number;
  /** The wrapper config handed to the project's Vite (`project-vite-config.js`). */
  configFile: string;
  log: ProjectLog;
  onChange(state: DevServerState): void;
  /** How long to wait for the first response, in ms. */
  startTimeout?: number;
}

export class DevServer {
  #state: DevServerState = { status: "stopped", error: null, vite: null };
  #child: ChildProcess | null = null;
  /** Bumped on every start and stop, so events from an older process are ignored. */
  #generation = 0;
  #exited: Promise<void> = Promise.resolve();

  constructor(private readonly options: DevServerOptions) {}

  get url(): string {
    return `http://localhost:${this.options.port}/`;
  }

  state(): DevServerState {
    return { ...this.#state };
  }

  #set(next: Partial<DevServerState>): void {
    this.#state = { ...this.#state, ...next };
    this.options.onChange(this.state());
  }

  start(): void {
    if (this.#child) return;
    const { root, port, configFile, log } = this.options;
    const generation = ++this.#generation;
    const vite = findPackage(root, "vite");
    const bin = vite && typeof vite.json.bin === "object" ? (vite.json.bin as Record<string, string>).vite : typeof vite?.json.bin === "string" ? vite.json.bin : undefined;
    if (!vite || !bin) {
      const error = "Could not find Vite in the project. Install the project's dependencies, then restart.";
      log.append(`[designer] ${error}\n`);
      return this.#set({ status: "failed", error, vite: null });
    }
    this.#set({ status: "starting", error: null, vite: typeof vite.json.version === "string" ? vite.json.version : null });
    log.append(`[designer] starting the project's Vite ${this.#state.vite ?? ""} on port ${port}\n`);
    const child = spawn(process.execPath, [join(vite.dir, bin), root, "--config", configFile], {
      cwd: root,
      env: { ...process.env, GABLE_DESIGNER_ROOT: root, GABLE_DESIGNER_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child = child;
    const write = (d: Buffer) => {
      process.stderr.write(`[project vite] ${d}`);
      log.append(d.toString());
    };
    child.stdout!.on("data", write);
    child.stderr!.on("data", write);
    this.#exited = new Promise<void>((done) => {
      child.on("error", (e) => {
        log.append(`[designer] could not start Vite: ${e.message}\n`);
        if (generation === this.#generation) this.#set({ status: "failed", error: `Could not start the project's Vite: ${e.message}` });
        done();
      });
      child.on("exit", (code, signal) => {
        if (this.#child === child) this.#child = null;
        done();
        if (generation !== this.#generation) return;
        const how = code !== null ? `code ${code}` : `signal ${signal}`;
        log.append(`[designer] the project's Vite exited with ${how}\n`);
        const error = this.#state.status === "running" ? `The dev server stopped (exit ${how}).` : `The project's Vite exited with ${how}.`;
        this.#set({ status: "failed", error });
      });
    });
    void this.#probe(generation);
  }

  async #probe(generation: number): Promise<void> {
    const deadline = Date.now() + (this.options.startTimeout ?? 60_000);
    while (generation === this.#generation && this.#state.status === "starting") {
      try {
        if ((await fetch(this.url, { signal: AbortSignal.timeout(1000) })).ok) {
          if (generation === this.#generation && this.#state.status === "starting") this.#set({ status: "running" });
          return;
        }
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) {
        if (generation !== this.#generation || this.#state.status !== "starting") return;
        this.options.log.append("[designer] the project's Vite did not answer in time\n");
        this.#set({ status: "failed", error: "The project's Vite did not start in time." });
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /** Stops the server and waits until its process has exited, so the port is free again. */
  async stop(): Promise<void> {
    this.#generation++;
    const child = this.#child;
    if (child) {
      child.kill();
      await this.#exited;
      this.#child = null;
    }
    if (this.#state.status !== "stopped") this.#set({ status: "stopped", error: null });
  }

  async restart(): Promise<void> {
    await this.stop();
    this.options.log.append("[designer] restarting the dev server\n");
    this.start();
  }
}
