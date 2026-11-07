// Page mode: the real app with its router. This service holds what the page-mode UI shows (the router's URL and route tree,
// joined with the route config as written in the source, the scenario list, the mocked HTTP traffic) and does what it asks
// (navigate, add and edit routes through the backend, pick a scenario). It sits beside `DesignerState`, which owns the
// preview connection, and only reads from it.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import type { RouteNode, RouterInfo } from "@gable/core/devtools";
import type { HttpLogEntry, PageScenarioInfo } from "../../../src/protocol.js";
import type { ComponentInfo, RouteConfigInfo, RouteEdit, RouteSourceNode } from "../../../src/server/route-config.js";
import type { SceneFileEntry } from "../../../src/server/scene-index.js";
import { DesignerState } from "./designer-state.js";

export interface RouteRow {
  /** Index path as written in the source (`0.2`); empty when the row only exists at runtime. */
  key: string;
  at: number[] | null;
  depth: number;
  path: string;
  component: string;
  title: string;
  redirectTo: string;
  active: boolean;
  /** The URL clicking the row goes to (`:param` segments left in for the URL bar). */
  url: string;
  lazy: boolean;
}

/** What the route form edits: a new route under `parent`, or the route at `at`. */
export type RouteForm = { mode: "add"; parent: number[] } | { mode: "edit"; at: number[] };

/** Joins the paths of a route and its ancestors into a URL. `**` is the catch-all: it goes nowhere in particular. */
export function routeUrl(paths: readonly string[]): string {
  const segments = paths.flatMap((p) => p.split("/").filter((s) => s && s !== "**"));
  return "/" + segments.join("/");
}

type Shown = { path: string; component: string; title: string; redirectTo: string; children: Shown[] | "lazy" | null; active: boolean; at: number[] | null };

const fromRuntime = (nodes: readonly RouteNode[], at: number[] = []): Shown[] =>
  nodes.map((n, i) => ({
    path: n.path,
    component: n.component ?? "",
    title: n.title ?? "",
    redirectTo: n.redirectTo ?? "",
    active: n.active,
    at: [...at, i],
    children: n.children === "lazy" ? "lazy" : n.children ? fromRuntime(n.children, [...at, i]) : null,
  }));

/** The source tree, with the runtime's `active` flags copied over by position (the two have the same shape). */
const fromSource = (nodes: readonly RouteSourceNode[], runtime: readonly RouteNode[] | undefined): Shown[] =>
  nodes.map((n, i) => {
    const live = runtime?.[i];
    return {
      path: n.path ?? "(dynamic)",
      component: n.component ?? "",
      title: n.title ?? "",
      redirectTo: n.redirectTo ?? "",
      active: live?.active ?? false,
      at: n.at,
      children: n.children === "lazy" ? "lazy" : n.children ? fromSource(n.children, Array.isArray(live?.children) ? (live!.children as RouteNode[]) : undefined) : null,
    };
  });

function flatten(nodes: readonly Shown[], parents: readonly string[] = [], depth = 0): RouteRow[] {
  return nodes.flatMap((n) => {
    const paths = [...parents, n.path === "(dynamic)" ? "" : n.path];
    const row: RouteRow = {
      key: n.at ? n.at.join(".") : "",
      at: n.at,
      depth,
      path: n.path === "" ? "(index)" : n.path,
      component: n.component,
      title: n.title,
      redirectTo: n.redirectTo,
      active: n.active,
      url: routeUrl(paths),
      lazy: n.children === "lazy",
    };
    return [row, ...(Array.isArray(n.children) ? flatten(n.children, paths, depth + 1) : [])];
  });
}

export class PageState {
  static scope = "root";
  state = inject(DesignerState);

  routers = signal<RouterInfo[]>([]);
  config = signal<RouteConfigInfo | null>(null);
  components = signal<ComponentInfo[]>([]);
  sceneIndex = signal<SceneFileEntry[]>([]);
  scenario = signal<PageScenarioInfo | null>(null);
  httpLog = signal<HttpLogEntry[]>([]);
  /** The URL bar's text. It follows the router until the user types. */
  urlText = signal("/");
  editing = signal(false);
  form = signal<RouteForm | null>(null);
  formError = signal<string | null>(null);
  saved = signal<string | null>(null);

  router = computed(() => this.routers()[0] ?? null);
  /** Page mode has a router, or it would show nothing to navigate. */
  hasRouter = computed(() => this.router() !== null);
  url = computed(() => this.router()?.url ?? "");

  rows = computed<RouteRow[]>(() => {
    const router = this.router();
    const source = this.config();
    if (source) return flatten(fromSource(source.routes, router?.routes));
    return flatten(fromRuntime(router?.routes ?? []));
  });

  /** One entry per scene of every scenes file, for the scenario picker. */
  scenarioItems = computed(() => [
    { value: "none", label: "No scenario" },
    ...this.sceneIndex().flatMap((f) => f.scenes.map((s) => ({ value: `${f.file}|${s.name}`, label: `${f.file.split("/").pop()} / ${s.name}${s.mocks ? ` · ${s.mocks} mock${s.mocks === 1 ? "" : "s"}` : ""}` }))),
  ]);
  scenarioValue = computed(() => {
    const s = this.state.pageScenario();
    return s ? `${s.scenes}|${s.name}` : "none";
  });

  // --- refreshing ---------------------------------------------------------

  /** The router, whenever the preview (re)connects or navigates, or the route config changes under HMR. */
  watchRouter = effect(() => {
    this.state.routerTick();
    this.state.hmr();
    if (this.state.connection() !== "ready") return;
    untracked(() => void this.refreshRouter());
  });
  /** The mocked traffic, on every flush (a request answered ends in a signal change). */
  watchHttp = effect(() => {
    this.state.flushes();
    if (this.state.connection() !== "ready") return;
    untracked(() => void this.refreshHttp());
  });
  /** What the page's scenario is, once per connection, so the URL bar can open where the scenario says. */
  watchScenario = effect(() => {
    if (this.state.connection() !== "ready") return;
    untracked(() => void this.#scenarioReady());
  });
  /** Scenes and the route config come from the backend, which also tells when files change. */
  watchProject = effect(() => {
    if (!this.state.project()?.ready) return;
    this.state.sceneFiles();
    untracked(() => void this.refreshSource());
  });
  followUrl = effect(() => {
    const url = this.url();
    if (url && !untracked(() => this.editing())) this.urlText.set(url);
  });

  async refreshRouter(): Promise<void> {
    this.routers.set(await this.state.preview.call("routers", undefined).catch(() => []));
  }

  async refreshHttp(): Promise<void> {
    this.httpLog.set(await this.state.preview.call("httpLog", undefined).catch(() => []));
  }

  async refreshSource(): Promise<void> {
    const [routes, scenes] = await Promise.all([
      this.state.api<{ config: RouteConfigInfo | null; components: ComponentInfo[] }>("/api/routes").catch(() => null),
      this.state.api<SceneFileEntry[]>("/api/scene-index").catch(() => []),
    ]);
    if (routes) {
      this.config.set(routes.config);
      this.components.set(routes.components);
    }
    this.sceneIndex.set(scenes);
  }

  #opened: string | null = null;
  async #scenarioReady(): Promise<void> {
    const info = await this.state.preview.call("pageScenario", undefined).catch(() => null);
    this.scenario.set(info);
    this.httpLog.set([]);
    // A scenario can say where the app opens; do it once per scenario, not on every reconnect of the same frame.
    const key = info ? `${info.module}|${info.name}` : null;
    if (info?.url && key !== this.#opened) await this.navigate(info.url);
    this.#opened = key;
  }

  // --- acting -------------------------------------------------------------

  async navigate(url: string): Promise<void> {
    const router = this.router();
    if (!router) return;
    this.editing.set(false);
    const clean = url.trim().startsWith("/") ? url.trim() : "/" + url.trim();
    await this.state.preview.call("navigate", { id: router.id, url: clean }).catch(() => undefined);
    await this.refreshRouter();
  }

  go(): Promise<void> {
    return this.navigate(this.urlText());
  }

  chooseScenario(value: string): void {
    const bar = value === "none" ? -1 : value.lastIndexOf("|");
    this.state.pageScenario.set(bar > 0 ? { scenes: value.slice(0, bar), name: value.slice(bar + 1) } : null);
    this.#opened = null;
  }

  openForm(form: RouteForm | null): void {
    this.formError.set(null);
    this.saved.set(null);
    this.form.set(form);
  }

  /** Writes a route edit to the config file; HMR then applies it to the running router. */
  async save(edit: RouteEdit): Promise<boolean> {
    this.formError.set(null);
    const c = this.state.config;
    if (!c) return false;
    const res = await fetch(`${c.backend}/api/routes/edit`, { method: "POST", headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" }, body: JSON.stringify(edit) });
    const body = (await res.json()) as { file?: string; routes?: RouteSourceNode[]; error?: string };
    if (!res.ok || !body.routes) {
      this.formError.set(body.error ?? `The edit failed (${res.status}).`);
      return false;
    }
    this.saved.set(`Saved to ${body.file}`);
    this.form.set(null);
    await this.refreshSource();
    // the router picks the new config up through HMR; ask again shortly in case the event is missed
    setTimeout(() => void this.refreshRouter(), 400);
    return true;
  }
}
