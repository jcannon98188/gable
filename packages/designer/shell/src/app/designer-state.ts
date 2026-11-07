import { computed, signal } from "@gable/core";
import type { ComponentDetail, HmrEntry, InjectorDetail, InjectorNode, TreeNode } from "@gable/core/devtools";
import type { DesignNode } from "@gable/core/designer";
import { SCENARIO_PARAM, type CanvasDiagnostic, type SceneInfo } from "../../../src/protocol.js";
import type { ProjectInfo } from "../../../src/server/backend.js";
import type { ProjectDiagnostic } from "../../../src/server/analyze-worker.js";
import type { SourceRange } from "../../../src/server/source.js";
import { PreviewClient, type AgentEvent } from "./preview-client.js";

interface Config {
  backend: string;
  token: string;
}
declare global {
  // eslint-disable-next-line no-var
  var __GABLE_DESIGNER__: Config | undefined;
}

export type Target = { kind: "page" } | { kind: "component"; scenes: string };
export type Connection = "connecting" | "ready" | "incompatible" | "failed";
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

  /** Component tree rows with their depth (flat; see the TODO in the tree panel). */
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

  preview = new PreviewClient((m) => this.#onAgent(m));

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
      this.sceneFiles.set(await this.api<string[]>("/api/scenes"));
      void this.refreshDiagnostics();
      const events = new EventSource(`${this.config!.backend}/api/events?token=${this.config!.token}`);
      events.addEventListener("files", (e) => this.sceneFiles.set((JSON.parse((e as MessageEvent).data) as { scenes: string[] }).scenes));
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
    await this.preview.call("setMode", { mode }).catch(() => undefined);
  }

  /** The canvas reports its iframe here so the client can load the frame URL into it. */
  attachFrame(frame: HTMLIFrameElement, url: string): void {
    this.connection.set("connecting");
    this.incompatible.set(null);
    this.tree.set([]);
    this.picked.set(null);
    this.component.set(null);
    this.sceneInfo.set(null);
    this.preview.load(frame, url);
  }

  // --- from the agent --------------------------------------------------------

  #onAgent(m: AgentEvent): void {
    switch (m.type) {
      case "ready":
        this.connection.set("ready");
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
    if (!a || this.connection() !== "ready") return;
    const items: CanvasDiagnostic[] = a.diagnostics
      .filter((d): d is ProjectDiagnostic & { raw: string; offset: number } => d.raw !== undefined && d.offset !== undefined)
      .map((d) => ({ id: d.id, severity: d.severity, rule: d.rule, message: d.message, raw: d.raw, offset: d.offset }));
    this.placement.set(await this.preview.call("setDiagnostics", { items }).catch(() => ({ placed: 0, unplaced: items.length })));
  }
}
