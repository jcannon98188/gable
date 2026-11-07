// The project and its dev server, as the backend runs them (src/server/project-api.ts): opening another project, recent
// projects and the folder lister, installing what the Preview agent needs, and the dev server's log and restart.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import type { ProjectInfo } from "../../../src/server/backend.js";
import type { FolderListing, RecentProject } from "../../../src/server/projects.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";

const LOG_LIMIT = 200_000;

export class ProjectState {
  static scope = "root";
  state = inject(DesignerState);
  chrome = inject(ChromeState);

  recent = signal<RecentProject[]>([]);
  folders = signal<FolderListing | null>(null);
  /** The Open project dialog's path field. */
  path = signal("");
  opening = signal(false);
  openError = signal<string | null>(null);
  /** The dev server's output and the package manager's, as the backend keeps it. */
  log = signal("");
  restarting = signal(false);
  actionError = signal<string | null>(null);

  info = computed(() => this.state.project());
  check = computed(() => this.info()?.check ?? null);
  installing = computed(() => !!this.info()?.installing);
  /** The dev server cannot serve the preview (failed, or stopped by the Designer). */
  failed = computed(() => {
    const p = this.info();
    return !!p && (p.server === "failed" || !!p.error);
  });
  /** What the project is missing for the Preview agent and can be fixed from here. */
  canInstall = computed(() => !!this.check()?.install);
  /** The last lines of the log: as many as a message card shows without scrolling, so the newest line is in view. */
  logTail = computed(() => this.log().split(/\r?\n/).filter((l) => l.trim()).slice(-7).join("\n"));

  #events = (() => {
    const c = this.state.config;
    if (!c || typeof EventSource === "undefined") return null;
    const events = new EventSource(`${c.backend}/api/events?token=${c.token}`);
    events.addEventListener("server", (e) => this.#onServer(JSON.parse((e as MessageEvent).data) as ProjectInfo));
    events.addEventListener("log", (e) => {
      const { chunk } = JSON.parse((e as MessageEvent).data) as { chunk: string };
      this.log.update((t) => (t + chunk).slice(-LOG_LIMIT));
    });
    // Another window (or this one) opened a different project: everything in the shell belongs to the old one.
    events.addEventListener("project", () => location.reload());
    return events;
  })();

  /** A first run that is missing the Preview agent or Vite opens the connect flow once. */
  #prompted = false;
  firstRun = effect(() => {
    const check = this.check();
    if (!check || this.#prompted) return;
    this.#prompted = true;
    if (check.install || check.problem) untracked(() => this.chrome.dialog.set("connect"));
  });

  /** The log is fetched whenever a surface that shows it appears. */
  loadLog = effect(() => {
    const wanted = this.chrome.dialog() === "server-log" || this.chrome.dialog() === "connect" || this.failed();
    if (wanted) untracked(() => void this.refreshLog());
  });

  #onServer(info: ProjectInfo): void {
    if (info.root !== this.state.project()?.root) return;
    this.state.project.set(info);
    // The boot copies a start failure into `error`; a server that is starting again clears it.
    if (info.server !== "failed") this.state.error.set(null);
  }

  async #request<T>(path: string, body?: unknown): Promise<T> {
    const c = this.state.config;
    if (!c) throw new Error("No backend: open the Designer through `gable-designer` or the desktop app.");
    const res = await fetch(`${c.backend}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${c.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `${path}: ${res.status}`);
    return data;
  }

  async refreshLog(): Promise<void> {
    const { text } = await this.#request<{ text: string }>("/api/server/log").catch(() => ({ text: this.log() }));
    this.log.set(text);
  }

  // --- opening a project -------------------------------------------------------------------------------------------------

  /** Fills the Open project dialog: recent projects and the folder next to the current project. */
  async prepareOpen(): Promise<void> {
    this.openError.set(null);
    this.path.set(this.state.project()?.root ?? "");
    const [recent] = await Promise.all([this.#request<RecentProject[]>("/api/project/recent").catch(() => []), this.browse()]);
    this.recent.set(recent);
  }

  async browse(dir?: string): Promise<void> {
    const q = dir ? `?${new URLSearchParams({ dir })}` : "";
    try {
      this.folders.set(await this.#request<FolderListing>(`/api/project/folders${q}`));
    } catch (e) {
      this.openError.set(e instanceof Error ? e.message : String(e));
    }
  }

  /** Opens `root` in the backend (its Vite starts there) and reloads the shell onto it. */
  async open(root: string = this.path()): Promise<boolean> {
    const target = root.trim();
    if (!target || this.opening()) return false;
    this.opening.set(true);
    this.openError.set(null);
    try {
      await this.#request<ProjectInfo>("/api/project/open", { root: target });
      location.reload();
      return true;
    } catch (e) {
      this.openError.set(e instanceof Error ? e.message : String(e));
      this.opening.set(false);
      return false;
    }
  }

  // --- the dev server ----------------------------------------------------------------------------------------------------

  async restart(): Promise<void> {
    if (this.restarting()) return;
    this.restarting.set(true);
    this.actionError.set(null);
    try {
      this.#onServer(await this.#request<ProjectInfo>("/api/server/restart", {}));
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.restarting.set(false);
    }
  }

  /** Runs the project's package manager; the backend restarts the dev server when it succeeds. */
  async install(): Promise<void> {
    this.actionError.set(null);
    try {
      await this.#request("/api/project/install", {});
    } catch (e) {
      this.actionError.set(e instanceof Error ? e.message : String(e));
    }
  }

  close(): void {
    this.#events?.close();
  }
}
