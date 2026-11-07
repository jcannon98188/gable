import { computed, signal } from "@gable/core";
import type { ComponentDetail, HmrEntry, InjectorDetail, InjectorNode, TreeNode } from "@gable/core/devtools";
import type { DesignNode } from "@gable/core/designer";
import { SCENARIO_PARAM, type CanvasDiagnostic, type SceneInfo } from "../../../src/protocol.js";
import type { ProjectInfo } from "../../../src/server/backend.js";
import type { ProjectDiagnostic } from "../../../src/server/analyze-worker.js";
import type { CompileError } from "../../../src/server/compile-check.js";
import type { SourceRange } from "../../../src/server/source.js";
import type { Interaction } from "../../../src/protocol.js";
import { FrameSet, type Frame } from "./frames.js";
import type { AgentEvent } from "./preview-client.js";
import { isStale, staleCanvas } from "./stale-canvas.js";

interface Config {
  backend: string;
  token: string;
}
declare global {
  // eslint-disable-next-line no-var
  var __GABLE_DESIGNER__: Config | undefined;
}

export type Target = { kind: "page" } | { kind: "component"; scenes: string };
export type { Connection } from "./frames.js";
import type { Connection } from "./frames.js";
export interface Analysis {
  diagnostics: ProjectDiagnostic[];
  configErrors: string[];
}
export interface Picked {
  node: DesignNode;
  chain: DesignNode[];
  component: ComponentDetail | null;
  source: SourceRange | { error: string } | null;
}

/** All Designer state. The panels read its signals; the toolbar and the canvas drive it. */
export class DesignerState {
  static scope = "root";

  config = globalThis.__GABLE_DESIGNER__;
  project = signal<ProjectInfo | null>(null);
  error = signal<string | null>(null);
  sceneFiles = signal<string[]>([]);

  target = signal<Target>({ kind: "page" });
  scene = signal<string | null>(null);
  /** Page mode: the Scenario (scenes file and scene) applied to the real app, or none. Changing it reloads the frame. */
  pageScenario = signal<{ scenes: string; name: string } | null>(null);
  /** Counts router events from the agent (navigations), so page-mode panels know to refresh. */
  routerTick = signal(0);
  /** Counts `ready` from the selected frame's agent: each (re)load of its page, and each reconnect. */
  loads = signal(0);
  mode = signal<"select" | "interact">("select");
  connection = signal<Connection>("connecting");
  incompatible = signal<string | null>(null);
  sceneInfo = signal<SceneInfo | null>(null);

  tree = signal<TreeNode[]>([]);
  injectors = signal<InjectorNode[]>([]);
  injectorDetails = signal<Record<string, InjectorDetail>>({});
  hmr = signal<HmrEntry[]>([]);
  picked = signal<Picked | null>(null);
  /** The component shown in the inspector: the owner of the picked node, or one chosen in the tree. */
  component = signal<ComponentDetail | null>(null);
  analysis = signal<Analysis | null>(null);
  placement = signal<{ placed: number; unplaced: number }>({ placed: 0, unplaced: 0 });
  flushes = signal(0);
  /** Templates that do not compile as saved (the backend checks every save; the full analysis follows in seconds). */
  compileErrors = signal<CompileError[]>([]);
  /** Why the canvas is not showing the source as saved, for the banner over it; null when it is (stale-canvas.ts). */
  stale = computed(() => staleCanvas(this.compileErrors(), this.hmr()));
  /** Whether the file at `path` (module URL or path) does not compile, or the page refused its last hot update. */
  staleFile(path: string | undefined): boolean {
    return !!path && isStale(this.compileErrors(), this.hmr(), path);
  }
  /**
   * The Problems list: the analysis, plus compile errors it has not caught up with yet (a save it has not finished reading).
   * Compile errors are always errors and are never placed on the canvas: the page does not run that template.
   */
  problems = computed<ProjectDiagnostic[]>(() => {
    const analysed = this.analysis()?.diagnostics ?? [];
    const known = new Set(analysed.map((d) => `${d.file}:${d.line}:${d.column}:${d.message}`));
    const fresh = this.compileErrors()
      .filter((e) => !known.has(`${e.file}:${e.line}:${e.column}:${e.message}`))
      .map((e, i): ProjectDiagnostic => ({ id: `compile${i}`, file: e.file, line: e.line, column: e.column, severity: "error", rule: e.rule, message: e.message }));
    return [...fresh, ...analysed];
  });

  /** Component tree rows with their depth. */
  rows = computed(() => {
    const nodes = this.tree();
    const children = new Map<string | null, TreeNode[]>();
    for (const n of nodes) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
    const out: Array<{ node: TreeNode; depth: number }> = [];
    const walk = (parent: string | null, depth: number) => {
      for (const node of children.get(parent) ?? []) {
        out.push({ node, depth });
        walk(node.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  frameUrl = computed(() => {
    const project = this.project();
    if (!project?.ready) return null;
    const t = this.target();
    if (t.kind === "page") {
      const s = this.pageScenario();
      if (!s) return project.previewUrl;
      const u = new URL(project.previewUrl);
      u.searchParams.set(SCENARIO_PARAM, `${s.scenes}|${s.name}`);
      return u.href;
    }
    // The scene is not part of the URL: switching scenes mounts in place, so the page (and the agent) keep running.
    const q = new URLSearchParams({ scenes: t.scenes });
    return `${project.previewUrl}__gable-designer/component?${q}`;
  });

  /** The frames on the canvas, each its own app instance and PreviewClient (see frames.ts). */
  frames = new FrameSet({ api: (path, body) => this.api(path, body), onEvent: (frame, m) => this.#onFrameEvent(frame, m) });

  /** The selected frame's client: what the panels and the inspector talk to. */
  get preview() {
    return this.frames.selected().client;
  }

  /** Starts talking to the backend as soon as the service exists (setup is field initialisers only). */
  booted = this.#boot();

  // --- backend -------------------------------------------------------------

  async api<T>(path: string, body?: unknown): Promise<T> {
    const c = this.config;
    if (!c) throw new Error("No backend: open the Designer through `gable-designer` or the desktop app.");
    const res = await fetch(`${c.backend}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${c.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return (await res.json()) as T;
  }

  async #boot(): Promise<void> {
    try {
      let project = await this.api<ProjectInfo>("/api/project");
      while (!project.ready && !project.error) {
        this.project.set(project);
        await new Promise((r) => setTimeout(r, 400));
        project = await this.api<ProjectInfo>("/api/project");
      }
      this.project.set(project);
      if (project.error) this.error.set(project.error);
      void this.frames.load();
      this.sceneFiles.set(await this.api<string[]>("/api/scenes"));
      void this.refreshDiagnostics();
      void this.api<CompileError[]>("/api/compile").then((c) => this.compileErrors.set(c), () => undefined);
      const events = new EventSource(`${this.config!.backend}/api/events?token=${this.config!.token}`);
      events.addEventListener("files", (e) => this.sceneFiles.set((JSON.parse((e as MessageEvent).data) as { scenes: string[] }).scenes));
      events.addEventListener("compile", (e) => this.compileErrors.set(JSON.parse((e as MessageEvent).data) as CompileError[]));
      events.addEventListener("diagnostics", (e) => {
        this.analysis.set(JSON.parse((e as MessageEvent).data) as Analysis);
        void this.#placeDiagnostics();
      });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  async refreshDiagnostics(): Promise<void> {
    this.analysis.set(await this.api<Analysis>("/api/diagnostics?refresh=1"));
    void this.#placeDiagnostics();
  }

  // --- target and mode ------------------------------------------------------

  showPage(): void {
    this.target.set({ kind: "page" });
    this.scene.set(null);
  }

  showComponent(scenes: string): void {
    this.target.set({ kind: "component", scenes });
    this.scene.set(null);
  }

  async chooseScene(name: string): Promise<void> {
    this.scene.set(name);
    // The page is already the component host: switch in place (no reload).
    await this.preview.call("mountScene", { name }).catch(() => undefined);
    await this.refreshAll();
  }

  async setMode(mode: "select" | "interact"): Promise<void> {
    this.mode.set(mode);
    await Promise.all(this.frames.frames().map((f) => f.client.call("setMode", { mode }).catch(() => undefined)));
  }

  /** A frame's canvas reports its iframe here so its client can load the frame URL into it. */
  attachFrame(frame: Frame, iframe: HTMLIFrameElement, url: string): void {
    frame.connection.set("connecting");
    if (frame === this.frames.selected()) this.#resetInspection();
    frame.client.load(iframe, url);
  }

  #resetInspection(): void {
    this.connection.set("connecting");
    this.incompatible.set(null);
    this.tree.set([]);
    this.picked.set(null);
    this.component.set(null);
    this.sceneInfo.set(null);
  }

  /** Makes a frame the one the panels inspect (and Tailwind mode edits for). */
  selectFrame(id: string): void {
    if (id === this.frames.selectedId()) return;
    this.frames.select(id);
    this.#resetInspection();
    const frame = this.frames.selected();
    this.connection.set(frame.connection());
    if (frame.connection() !== "ready") return;
    this.connection.set("ready");
    void frame.client.call("scenes", undefined).then((scenes) => {
      this.sceneInfo.set(scenes);
      if (scenes) this.scene.set(scenes.current);
    }).catch(() => undefined);
    void this.refreshAll().catch(() => undefined);
  }

  // --- from the agents (one per frame) ----------------------------------------

  #onFrameEvent(frame: Frame, m: AgentEvent): void {
    const selected = frame === this.frames.selected();
    if (m.type === "interaction") return this.#sync(frame, m.interaction);
    if (m.type === "ready") {
      frame.connection.set("ready");
      void this.frames.applyEmulation(frame);
      void frame.client.call("setMode", { mode: this.mode() }).catch(() => undefined);
    } else if (m.type === "incompatible") frame.connection.set("incompatible");
    // Picking in another frame selects that frame first, so the inspector follows the click.
    if (!selected && m.type === "pick") this.selectFrame(frame.id);
    else if (!selected) return void (m.type === "ready" && this.#placeDiagnostics());
    this.#onAgent(m);
  }

  /** Repeats a real interaction in the other frames when sync is on (and the frames let the app run: interact mode). */
  #sync(from: Frame, interaction: Interaction): void {
    if (interaction.kind === "click") this.selectFrame(from.id);
    if (!this.frames.sync() || this.mode() !== "interact") return;
    for (const other of this.frames.frames()) {
      if (other !== from && other.connection() === "ready") void other.client.call("replay", interaction).catch(() => undefined);
    }
  }

  /** A path as the panels show it: relative to the project when it is inside it. */
  relative(file: string): string {
    const root = this.project()?.root.replaceAll("\\", "/").replace(/\/$/, "");
    const path = file.replaceAll("\\", "/");
    return root && path.startsWith(root + "/") ? path.slice(root.length + 1) : file;
  }

  #actionSeq = 0;
  /** A diagnostic badge on the canvas was clicked (the shell opens Problems). */
  badgeClicks = signal(0);
  /** The last button pressed on the selection's floating toolbar (the shell performs it). */
  canvasAction = signal<{ action: "parent" | "move-up" | "move-down" | "delete"; id: string; seq: number } | null>(null);

  #onAgent(m: AgentEvent): void {
    switch (m.type) {
      case "ready":
        this.connection.set("ready");
        this.loads.update((n) => n + 1);
        void this.preview.call("setMode", { mode: this.mode() }).then(() => this.refreshAll());
        void this.#placeDiagnostics();
        break;
      case "incompatible":
        this.connection.set("incompatible");
        this.incompatible.set(`The preview speaks protocol ${m.agent}; the Designer speaks ${m.shell}.`);
        break;
      case "scenes":
        this.sceneInfo.set(m.scenes);
        if (m.scenes) this.scene.set(m.scenes.current);
        break;
      case "pick":
        void this.#picked(m.node, m.chain, m.component);
        break;
      case "badge":
        this.badgeClicks.update((n) => n + 1);
        break;
      case "action":
        this.canvasAction.set({ action: m.action, id: m.id, seq: this.#actionSeq++ });
        break;
      case "event":
        this.#onEvent(m.event);
        break;
    }
  }

  #refreshTimer: ReturnType<typeof setTimeout> | undefined;
  #onEvent(event: Extract<AgentEvent, { type: "event" }>["event"]): void {
    if (event.type === "router") this.routerTick.update((n) => n + 1);
    else if (event.type === "tree") void this.preview.call("tree", undefined).then((t) => this.tree.set(t));
    else if (event.type === "injectors") void this.refreshInjectors();
    else if (event.type === "hmr") {
      void this.preview.call("hmrLog", undefined).then((l) => this.hmr.set(l));
      void this.#placeDiagnostics();
    } else if (event.type === "flush") {
      this.flushes.update((n) => n + 1);
      // Signal values may have changed: refetch the shown component, at most every 150ms.
      if (this.#refreshTimer) return;
      this.#refreshTimer = setTimeout(() => {
        this.#refreshTimer = undefined;
        const id = this.component()?.id;
        if (id) void this.preview.call("component", { id }).then((c) => c && this.component.set(c));
      }, 150);
    }
  }

  async refreshAll(): Promise<void> {
    const [tree, hmr] = await Promise.all([this.preview.call("tree", undefined), this.preview.call("hmrLog", undefined)]);
    this.tree.set(tree);
    this.hmr.set(hmr);
    await this.refreshInjectors();
  }

  async refreshInjectors(): Promise<void> {
    const nodes = await this.preview.call("injectors", undefined);
    this.injectors.set(nodes);
    const details = await Promise.all(nodes.map((n) => this.preview.call("injector", { id: n.id })));
    this.injectorDetails.set(Object.fromEntries(details.filter((d): d is InjectorDetail => !!d).map((d) => [d.id, d])));
  }

  // --- selection ------------------------------------------------------------

  async #picked(node: DesignNode | null, chain: DesignNode[], component: ComponentDetail | null): Promise<void> {
    if (!node) {
      this.picked.set(null);
      return;
    }
    this.component.set(component);
    if (!node.exact) {
      this.picked.set({ node, chain, component, source: { error: "This template contains escapes, so its positions cannot be mapped to the file." } });
      return;
    }
    this.picked.set({ node, chain, component, source: null });
    const source = await this.api<SourceRange | { error: string }>("/api/resolve", {
      modulePath: node.component?.source?.path,
      raw: node.raw,
      start: node.start,
      openEnd: node.openEnd,
      end: node.end,
    }).catch((e: unknown) => ({ error: String(e) }));
    if (this.picked()?.node.id === node.id) this.picked.set({ node, chain, component, source });
  }

  async selectComponent(id: string): Promise<void> {
    this.component.set(await this.preview.call("component", { id }));
    void this.preview.call("highlight", { id });
  }

  hover(id: string | null): void {
    void this.preview.call("hoverNode", { id }).catch(() => undefined);
  }

  // --- diagnostics on the canvas ---------------------------------------------

  async #placeDiagnostics(): Promise<void> {
    const a = this.analysis();
    if (!a) return;
    const items: CanvasDiagnostic[] = a.diagnostics
      .filter((d): d is ProjectDiagnostic & { raw: string; offset: number } => d.raw !== undefined && d.offset !== undefined)
      .map((d) => ({ id: d.id, severity: d.severity, rule: d.rule, message: d.message, raw: d.raw, offset: d.offset }));
    const selected = this.frames.selected();
    for (const frame of this.frames.frames()) {
      if (frame.connection() !== "ready") continue;
      const placement = await frame.client.call("setDiagnostics", { items }).catch(() => ({ placed: 0, unplaced: items.length }));
      if (frame === selected) this.placement.set(placement);
    }
  }
}
