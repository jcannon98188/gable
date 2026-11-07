// The panel's state and logic, with no DOM and no `chrome.*`: it talks to a Client and a Host, and the views render
// its state. Everything the panel does (select, hover, edit, open source, refresh on events) is a method here.
import type {
  ComponentDetail,
  EditResult,
  FlushRecord,
  HmrEntry,
  InjectorDetail,
  InjectorNode,
  InspectorInfo,
  RouterInfo,
  SignalInfo,
  TreeNode,
} from "../protocol.js";
import type { Client } from "./client.js";

export type TabId = "components" | "injectors" | "router" | "effects" | "hmr" | "inspectors";
export const TABS: Array<{ id: TabId; label: string }> = [
  { id: "components", label: "Components" },
  { id: "injectors", label: "Injectors" },
  { id: "router", label: "Router" },
  { id: "effects", label: "Effects" },
  { id: "hmr", label: "HMR" },
  { id: "inspectors", label: "Stores" },
];

/** What only the devtools page can do. */
export interface Host {
  /** Evaluates an expression in the inspected page (`$0` is the element selected in the Elements panel). */
  evalInPage(expression: string): Promise<unknown>;
}

export interface PanelState {
  connected: boolean;
  tab: TabId;
  tree: TreeNode[];
  collapsed: Set<string>;
  selected: string | null;
  detail: ComponentDetail | null;
  /** The signal whose dependencies are shown. */
  focus: SignalInfo | null;
  injectors: InjectorNode[];
  selectedInjector: string | null;
  injectorDetail: InjectorDetail | null;
  routers: RouterInfo[];
  effects: FlushRecord[];
  hmr: HmrEntry[];
  inspectors: InspectorInfo[];
  /** The signal being edited and its draft text. */
  editing: { id: string; text: string } | null;
  /** The last action's outcome, shown until the next. */
  message: { kind: "error" | "info"; text: string } | null;
}

export interface Panel {
  readonly state: PanelState;
  subscribe(listener: () => void): () => void;
  setTab(tab: TabId): Promise<void>;
  /** Fetches whatever the active tab shows. */
  refresh(): Promise<void>;
  select(id: string | null): Promise<void>;
  toggle(id: string): void;
  focusSignal(id: string): Promise<void>;
  /** Mouse over a component row: outlines its element in the page. */
  hover(id: string | null): Promise<void>;
  startEdit(id: string, text: string): void;
  /** Keeps the draft without re-rendering. */
  draft(text: string): void;
  cancelEdit(): void;
  commitEdit(): Promise<void>;
  openSource(): Promise<void>;
  /** Selects the component of the element selected in the Elements panel (`$0`). */
  pickFromElements(): Promise<void>;
  /** Reveals the selected component's element in the Elements panel. */
  revealElement(): Promise<void>;
  selectInjector(id: string): Promise<void>;
  navigate(routerId: string, url: string): Promise<void>;
  clearEffects(): Promise<void>;
  /** Called on a timer by the page glue; refreshes values that change without an event. */
  tick(): Promise<void>;
  /** The panel was hidden: drop the page highlight. */
  hidden(): Promise<void>;
}

const MAX_LOG = 200;

export function createPanel(client: Client, host: Host): Panel {
  const state: PanelState = {
    connected: client.status.detected,
    tab: "components",
    tree: [],
    collapsed: new Set(),
    selected: null,
    detail: null,
    focus: null,
    injectors: [],
    selectedInjector: null,
    injectorDetail: null,
    routers: [],
    effects: [],
    hmr: [],
    inspectors: [],
    editing: null,
    message: null,
  };
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of [...listeners]) l();
  };
  const fail = (error: unknown) => {
    state.message = { kind: "error", text: error instanceof Error ? error.message : String(error) };
  };
  /** A refresh that fails (page navigating, connection reset) leaves the old data and reports once. */
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      fail(error);
    }
    notify();
  };

  async function loadTree() {
    state.tree = await client.request("tree", undefined);
    if (state.selected && !state.tree.some((n) => n.id === state.selected)) {
      state.selected = null;
      state.detail = null;
      state.focus = null;
    }
    if (!state.selected && state.tree.length > 0) {
      state.selected = state.tree[0]!.id;
    }
  }

  async function loadDetail() {
    if (!state.selected) return;
    const detail = await client.request("component", { id: state.selected });
    state.detail = detail;
    if (state.focus) state.focus = (await client.request("signal", { id: state.focus.id })) ?? null;
  }

  async function load(tab: TabId) {
    switch (tab) {
      case "components":
        await loadTree();
        // Skip while a value is being typed: a refresh would not lose the draft (it lives here) but needless work.
        await loadDetail();
        break;
      case "injectors":
        state.injectors = await client.request("injectors", undefined);
        if (state.selectedInjector && !state.injectors.some((i) => i.id === state.selectedInjector)) state.selectedInjector = null;
        state.selectedInjector ??= state.injectors.find((i) => i.component)?.id ?? state.injectors[0]?.id ?? null;
        state.injectorDetail = state.selectedInjector ? await client.request("injector", { id: state.selectedInjector }) : null;
        break;
      case "router":
        state.routers = await client.request("routers", undefined);
        break;
      case "effects":
        state.effects = await client.request("effectLog", undefined);
        break;
      case "hmr":
        state.hmr = await client.request("hmrLog", undefined);
        break;
      case "inspectors":
        state.inspectors = await client.request("inspectors", undefined);
        break;
    }
  }

  const refresh = () => (state.connected ? guard(() => load(state.tab)) : Promise.resolve(notify()));

  client.onStatus((status) => {
    state.connected = status.detected;
    if (!status.detected) state.message = null;
    void refresh();
  });

  client.onEvent((event) => {
    switch (event.type) {
      case "tree":
        if (state.tab === "components") void refresh();
        return;
      case "injectors":
        if (state.tab === "injectors") void refresh();
        return;
      case "flush":
        state.effects = [...state.effects, event.flush].slice(-MAX_LOG);
        if (state.tab === "effects") notify();
        else if (state.tab === "components" && !state.editing) void guard(loadDetail);
        return;
      case "hmr":
        state.hmr = [...state.hmr, event.entry].slice(-MAX_LOG);
        if (state.tab === "hmr") notify();
        // An edit changed the tree and the sources.
        else if (state.tab === "components") void refresh();
        return;
      case "router":
        if (state.tab === "router") void refresh();
        return;
      case "inspector":
        if (state.tab === "inspectors") void refresh();
        return;
    }
  });

  const panel: Panel = {
    state,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async setTab(tab) {
      state.tab = tab;
      state.message = null;
      await refresh();
    },
    refresh,
    async select(id) {
      state.selected = id;
      state.detail = null;
      state.focus = null;
      state.editing = null;
      notify();
      if (id) await guard(loadDetail);
    },
    toggle(id) {
      if (!state.collapsed.delete(id)) state.collapsed.add(id);
      notify();
    },
    async focusSignal(id) {
      await guard(async () => {
        state.focus = (await client.request("signal", { id })) ?? null;
      });
    },
    async hover(id) {
      try {
        await client.request("highlight", { id });
      } catch {
        // highlighting is a nicety
      }
    },
    startEdit(id, text) {
      state.editing = { id, text };
      notify();
    },
    draft(text) {
      if (state.editing) state.editing.text = text;
    },
    cancelEdit() {
      state.editing = null;
      notify();
    },
    async commitEdit() {
      const editing = state.editing;
      if (!editing) return;
      let result: EditResult;
      try {
        result = await client.request("setSignal", { id: editing.id, text: editing.text });
      } catch (error) {
        fail(error);
        notify();
        return;
      }
      if (result.ok) {
        state.editing = null;
        state.message = null;
        await guard(async () => {
          await client.request("highlight", { id: null });
          await loadDetail();
        });
      } else {
        state.message = { kind: "error", text: result.error };
        notify();
      }
    },
    async openSource() {
      if (!state.selected) return;
      try {
        const result = await client.request("openInEditor", { id: state.selected });
        state.message = result.ok ? { kind: "info", text: "Opened in your editor." } : { kind: "error", text: result.error };
      } catch (error) {
        fail(error);
      }
      notify();
    },
    async pickFromElements() {
      try {
        const id = await host.evalInPage("(globalThis.__GABLE_DEVTOOLS_HOOK__ && globalThis.__GABLE_DEVTOOLS_HOOK__.componentFor($0)) || null");
        if (typeof id === "string") {
          if (state.tab !== "components") state.tab = "components";
          await loadTree();
          await panel.select(id);
          return;
        }
        state.message = { kind: "info", text: "The element selected in the Elements panel is not inside a Gable component." };
      } catch (error) {
        fail(error);
      }
      notify();
    },
    async revealElement() {
      if (!state.selected) return;
      try {
        await host.evalInPage(`inspect(globalThis.__GABLE_DEVTOOLS_HOOK__.element(${JSON.stringify(state.selected)}))`);
      } catch (error) {
        fail(error);
        notify();
      }
    },
    async selectInjector(id) {
      state.selectedInjector = id;
      await guard(async () => {
        state.injectorDetail = await client.request("injector", { id });
      });
    },
    async navigate(routerId, url) {
      try {
        const result = await client.request("navigate", { id: routerId, url });
        if (!result.ok) state.message = { kind: "error", text: result.error };
      } catch (error) {
        fail(error);
      }
      await refresh();
    },
    async clearEffects() {
      await guard(async () => {
        await client.request("clearEffectLog", undefined);
        state.effects = [];
      });
    },
    async tick() {
      if (!state.connected || state.editing) return;
      if (state.tab === "components") await guard(loadDetail);
      else if (state.tab !== "effects" && state.tab !== "hmr") await refresh();
    },
    async hidden() {
      await panel.hover(null);
    },
  };

  if (state.connected) void refresh();
  return panel;
}
