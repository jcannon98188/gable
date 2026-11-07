// The shell's end of the MCP command channel (TASK-56.13, see `src/control-protocol.ts`). An agent changes UI state only
// through here, by calling the same methods the toolbar, the device bar, the Routes tab and a click on the canvas call,
// so the human sees every change and this window stays the one source of UI state. The backend sends commands on
// `/api/shell/channel` (SSE); each is answered with a POST to `/api/shell/reply`.
import { inject } from "@gable/core";
import type { TravelResult } from "@gable/core/devtools";
import type { ControlCommands, ControlName, ControlRequest, FrameRect, SelectionSnapshot, ShellSnapshot } from "../../../src/control-protocol.js";
import { DesignerState } from "./designer-state.js";
import { NetworkState } from "./network-state.js";
import { StorageState } from "./storage-state.js";
import { MatrixState } from "./matrix-state.js";
import { A11yState } from "./a11y-state.js";
import { FocusState } from "./focus-state.js";
import { PageState } from "./page-state.js";
import { DEV_NOTE, PerfState } from "./perf-state.js";
import { SignalEdits } from "./signal-edits.js";
import { SignalTimeline } from "./signal-timeline-state.js";
import { WhyState } from "./why-state.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Handlers = { [N in ControlName]: (params: ControlCommands[N]["params"]) => Promise<ControlCommands[N]["result"]> | ControlCommands[N]["result"] };

export class ControlChannel {
  static scope = "root";
  state = inject(DesignerState);
  page = inject(PageState);
  perf = inject(PerfState);
  signals = inject(SignalEdits);
  timeline = inject(SignalTimeline);
  why = inject(WhyState);
  network = inject(NetworkState);
  storage = inject(StorageState);
  matrix = inject(MatrixState);
  a11y = inject(A11yState);
  focus = inject(FocusState);

  booted = this.#boot();

  async #boot(): Promise<void> {
    await this.state.booted;
    const c = this.state.config;
    if (!c) return;
    const events = new EventSource(`${c.backend}/api/shell/channel?token=${c.token}`);
    events.addEventListener("command", (e) => void this.#run(JSON.parse((e as MessageEvent).data) as ControlRequest));
  }

  async #run(request: ControlRequest): Promise<void> {
    const c = this.state.config!;
    let reply: unknown;
    try {
      const handler = this.#handlers[request.name] as ((p: unknown) => unknown) | undefined;
      if (!handler) throw new Error(`The Designer window does not know the command "${request.name}".`);
      reply = { id: request.id, ok: true, result: (await handler(request.params)) ?? null };
    } catch (e) {
      reply = { id: request.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    await fetch(`${c.backend}/api/shell/reply`, {
      method: "POST",
      headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
      body: JSON.stringify(reply),
    }).catch(() => undefined);
  }

  // --- reading the state ---------------------------------------------------------------------------------------------

  snapshot(): ShellSnapshot {
    const s = this.state;
    const fs = s.frames;
    const selected = fs.selected();
    return {
      connection: s.connection(),
      mode: s.mode(),
      target: s.target(),
      scene: s.scene(),
      pageScenario: s.pageScenario(),
      url: this.page.router()?.url ?? null,
      frames: fs.frames().map((f) => {
        const c = f.config();
        const size = f.size();
        return { id: f.id, name: c.name, width: size.width, height: size.height, dpr: c.dpr, landscape: c.landscape, presetId: c.presetId, emulation: { ...c.emulation }, connection: f.connection(), selected: f === selected, nonce: f.client.nonce };
      }),
      selectedFrame: selected.id,
      breakpoint: fs.selectedBreakpoint(),
      selection: this.selection(),
      presets: fs.presets().map((p) => ({ id: p.id, name: p.name, width: p.width, height: p.height })),
    };
  }

  selection(): SelectionSnapshot | null {
    const p = this.state.picked();
    if (!p) return null;
    return {
      node: p.node,
      chain: p.chain.map((n) => ({ id: n.id, tag: n.tag })),
      component: p.component ? { id: p.component.id, name: p.component.name } : null,
      source: p.source,
    };
  }

  // --- waiting for what a change sets off --------------------------------------------------------------------------------

  #ready(): void {
    const c = this.state.connection();
    if (c !== "ready") throw new Error(`The preview is not connected (${c}).`);
  }

  /** A change that reloads the frame: wait for it to drop the connection and come back. */
  async #reloaded(): Promise<void> {
    const t0 = Date.now();
    while (Date.now() - t0 < 1500 && this.state.connection() === "ready") await sleep(50);
    while (Date.now() - t0 < 25000 && this.state.connection() !== "ready") await sleep(100);
  }

  /** The agent's `pick` arrives after `selectNode` answers, and the source range after that. */
  async #picked(id: string | null): Promise<SelectionSnapshot | null> {
    for (let i = 0; i < 40; i++) {
      const p = this.state.picked();
      if (id === null ? !p : p?.node.id === id && (p.source !== null || !p.node.exact)) break;
      await sleep(50);
    }
    return this.selection();
  }

  #frameOf(id: string | undefined) {
    const fs = this.state.frames;
    const frame = id ? fs.frames().find((f) => f.id === id) : fs.selected();
    if (!frame) throw new Error(`No frame ${id}; the frames are ${fs.frames().map((f) => f.id).join(", ")}.`);
    return frame;
  }

  // --- commands --------------------------------------------------------------------------------------------------------

  #handlers: Handlers = {
    snapshot: () => this.snapshot(),

    setMode: async ({ mode }) => {
      await this.state.setMode(mode);
      return this.snapshot();
    },

    setTarget: async (target) => {
      const before = this.state.frameUrl();
      if (target.kind === "page") this.state.showPage();
      else {
        if (!this.state.sceneFiles().includes(target.scenes)) throw new Error(`${target.scenes} is not a scenes file of this project (${this.state.sceneFiles().join(", ") || "none"}).`);
        this.state.showComponent(target.scenes);
      }
      if (this.state.frameUrl() !== before) await this.#reloaded();
      if (target.kind === "component" && target.scene) {
        this.#ready();
        await this.state.chooseScene(target.scene);
      }
      return this.snapshot();
    },

    setScene: async ({ name }) => {
      if (this.state.target().kind !== "component") throw new Error("Scenes are mounted in component mode; use show_component first (or set_scenario in page mode).");
      this.#ready();
      const known = this.state.sceneInfo()?.scenes.map((s) => s.name) ?? [];
      if (known.length && !known.includes(name)) throw new Error(`No scene "${name}"; this file has ${known.join(", ")}.`);
      await this.state.chooseScene(name);
      return this.snapshot();
    },

    setScenario: async (scenario) => {
      if (this.state.target().kind !== "page") throw new Error("Scenarios apply to page mode; use show_page first (component mode uses set_scene).");
      const before = this.state.frameUrl();
      this.page.chooseScenario(scenario ? `${scenario.scenes}|${scenario.name}` : "none");
      if (this.state.frameUrl() !== before) await this.#reloaded();
      return this.snapshot();
    },

    navigate: async ({ url }) => {
      this.#ready();
      if (!this.page.router()) await this.page.refreshRouter();
      if (!this.page.router()) throw new Error("This page has no router to navigate (page mode with a router only).");
      await this.page.navigate(url);
      return this.snapshot();
    },

    frames: (a) => {
      const fs = this.state.frames;
      if (a.action === "add") {
        if (a.preset && !fs.presets().some((p) => p.id === a.preset)) throw new Error(`No preset ${a.preset}; see get_status for the presets.`);
        if (!fs.add(a.preset)) throw new Error("The canvas already has the most frames it can show.");
      } else {
        const frame = this.#frameOf(a.id);
        if (a.action === "remove") {
          if (fs.frames().length <= 1) throw new Error("The last frame cannot be removed.");
          fs.remove(frame.id);
        } else if (a.action === "select") this.state.selectFrame(frame.id);
        else if (a.action === "preset") {
          if (!fs.presets().some((p) => p.id === a.preset)) throw new Error(`No preset ${a.preset}; see get_status for the presets.`);
          fs.applyPreset(frame.id, a.preset);
        } else {
          const { emulation, ...rest } = a.patch;
          fs.update(frame.id, { ...rest, ...(emulation ? { emulation: { ...frame.config().emulation, ...emulation } } : {}) });
        }
      }
      return this.snapshot();
    },

    select: async (by) => {
      this.#ready();
      const preview = this.state.preview;
      if (by === null) {
        await preview.call("selectNode", { id: null });
        return this.#picked(null);
      }
      const node = "selector" in by ? await preview.call("nodeBySelector", { selector: by.selector }) : await preview.call("nodeAt", { raw: by.raw, offset: by.offset });
      if (!node) return null;
      await preview.call("selectNode", { id: node.id });
      return this.#picked(node.id);
    },

    inspect: async (q) => {
      this.#ready();
      const preview = this.state.preview;
      switch (q.what) {
        case "tree":
          return preview.call("tree", undefined);
        case "component": {
          const id = q.id ?? this.state.component()?.id;
          return id ? preview.call("component", { id }) : null;
        }
        case "hmr":
          return preview.call("hmrLog", undefined);
        case "routers":
          return preview.call("routers", undefined);
        case "http": {
          const [scenario, log] = await Promise.all([preview.call("pageScenario", undefined).catch(() => null), preview.call("httpLog", undefined).catch(() => [])]);
          return { scenario, log };
        }
        case "scenes":
          return (await preview.call("scenes", undefined))!;
      }
    },

    performance: async ({ reload }) => {
      this.#ready();
      const report = reload ? await this.perf.rerunAndWait() : await this.perf.measure("MCP");
      const c = this.perf.context();
      return {
        report,
        error: report ? null : (this.perf.error() ?? (reload ? "The frame did not come back after the reload." : "The page could not be measured (a measurement may already be running; try again).")),
        after: report ? this.perf.reason() : "",
        frame: { name: c.frame, width: c.width, height: c.height, dpr: c.dpr, throttling: c.throttling },
        note: DEV_NOTE,
      };
    },

    a11y: async (a) => {
      this.#ready();
      const frame = this.state.frames.selected();
      const c = frame.config();
      const size = frame.size();
      const at = { name: c.name, width: size.width, height: size.height };
      const view = () => ({ focusOrder: this.focus.overlay(), keyboardOnly: this.focus.keyboardOnly() });
      if (a.action === "view") {
        this.focus.setView(a);
        // The agent applies it through the view effect; wait for that call so the answer is what the page now does.
        await this.state.preview.call("a11yView", view());
        return { frame: at, view: view() };
      }
      if (a.action === "focusOrder") return { frame: at, view: view(), focus: await this.focus.readOrder() };
      if (a.action === "tree") return { frame: at, view: view(), tree: await this.focus.readTree(a.id) };
      if (a.action === "step") return { frame: at, view: view(), step: await this.focus.step(a.to, a.steps) };
      if (a.rerun || !this.a11y.report()) await this.a11y.run();
      return { frame: at, view: view(), report: this.a11y.report(), error: this.a11y.error() };
    },

    signals: async (a) => {
      this.#ready();
      const write = a.action === "set" ? await this.signals.set(a.id, a.text, a.force) : a.action === "pin" ? await this.signals.pin(a.id, a.text, a.force) : undefined;
      if (!write) await this.signals.refresh();
      return { ...(write ? { write } : {}), pins: this.signals.pins(), scene: this.signals.scene() };
    },

    history: async (a) => {
      this.#ready();
      const t = this.timeline;
      t.stopReplay();
      let travel: TravelResult | undefined;
      if (a.action === "clear") await t.clear();
      else if (a.action === "record") await t.record(a.on);
      else if (a.action === "travel") {
        const steps = (await t.refresh())?.steps ?? [];
        const to = a.to === "live" ? steps.at(-1)?.seq : a.to === "start" ? (steps[0] ? steps[0].seq - 1 : undefined) : a.to;
        travel = to === undefined ? { ok: false, error: "No state history is recorded." } : await t.travel(to);
      }
      const info = await t.refresh();
      if (!info) throw new Error("The selected frame has no state history: its app is not running with the Gable devtools hook.");
      return { info, ...(travel ? { travel } : {}) };
    },
    why: async (a) => {
      this.#ready();
      if (a.id) {
        const shown = await this.why.explain(a.id).catch(() => null);
        return { shown, empty: shown ? "" : `Nothing with id ${a.id} is rendered in the selected frame.` };
      }
      const shown = await this.why.refresh(a.scope ?? "element");
      return { shown, empty: shown ? "" : this.why.empty() };
    },
    highlightUpdates: async ({ on }) => {
      this.#ready();
      this.why.setHighlight(on);
      await this.state.preview.call("flashUpdates", { on }).then(() => this.why.highlightError.set(""), (e: Error) => this.why.highlightError.set(e.message));
      return { on: this.why.highlight(), error: this.why.highlightError() };
    },
    network: (command) => this.network.command(command),
    storage: (command) => this.storage.command(command),
    matrix: (command) => this.matrix.command(command),

    frameRect: ({ frame: id }): FrameRect => {
      const frame = this.#frameOf(id);
      const iframe = [...document.querySelectorAll("iframe")].find((f) => f.src.includes(frame.client.nonce));
      if (!iframe) throw new Error(`Frame ${frame.id} is not on the canvas yet.`);
      iframe.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = iframe.getBoundingClientRect();
      const size = frame.size();
      const c = frame.config();
      // The URL a fresh render loads: the frame's page (route and Scenario included) on the first slot's origin.
      const url = new URL(this.state.frameUrl() ?? this.state.project()?.previewUrl ?? location.href);
      const route = frame === this.state.frames.selected() ? this.page.router()?.url : null;
      if (route && this.state.target().kind === "page") {
        const r2 = new URL(route, url);
        url.pathname = r2.pathname;
        url.hash = r2.hash;
        r2.searchParams.forEach((v, k) => url.searchParams.set(k, v));
      }
      return {
        frame: frame.id,
        nonce: frame.client.nonce,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        width: size.width,
        height: size.height,
        scale: size.width ? r.width / size.width : 1,
        url: url.href,
        dpr: c.dpr,
        emulation: { ...c.emulation },
      };
    },

    reselect: async ({ raw, offset }) => {
      for (let i = 0; i < 24; i++) {
        await sleep(250);
        const node = await this.state.preview.call("nodeAt", { raw, offset }).catch(() => null);
        if (node) {
          await this.state.preview.call("selectNode", { id: node.id }).catch(() => undefined);
          return true;
        }
      }
      return false;
    },
  };
}
