// The Designer's MCP control plane (TASK-56.13): the tools an agent drives the Designer with. It is a thin layer over what
// the UI already uses. Project facts (components, scenes, routes, problems, history, Tailwind) come from backend state.
// UI state (mode, target, frames, selection, route, scenario) and the running app (tree, signals, HMR) belong to the shell,
// so those tools send a command over the shell bridge and the shell does what a click would: the human sees the same
// change, and the shell stays the one source of UI state. Every source edit goes through the `EditService`, so it is a
// minimal patch with undo (ADR 0001), and each answers with the unified diff of what it wrote.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AnalysisOutput } from "../analyze-worker.js";
import type { ProjectInfo } from "../backend.js";
import type { EditService } from "../edit/service.js";
import type { ComponentRef, EditOp, EditResult, NodeModel, TargetRef } from "../edit/types.js";
import { listComponents, locateRouteConfig } from "../route-config.js";
import { sceneIndex } from "../scene-index.js";
import type { TailwindService } from "../tailwind/api.js";
import type { ControlCommands, FramePatch, FrameRect, SelectionSnapshot, ShellSnapshot } from "../../control-protocol.js";
import type { ShellBridge } from "./bridge.js";
import { registerSignalTools } from "./signal-tools.js";
import { registerHistoryTools } from "./history-tools.js";
import { registerWhyTools } from "./why-tools.js";
import type { CompileError } from "../compile-check.js";
import { captureHeadless, captureLive, findBrowser, type Shot } from "./screenshot.js";
import { registerTokenTools } from "./token-tools.js";
import { fileOfTarget, positionOf, projectFile, targetAt, unifiedDiff, type SourcePos } from "./targets.js";
import { registerNetworkTools } from "./network-tools.js";
import { registerStorageTools } from "./storage-tools.js";

export interface ControlContext {
  root: string;
  info: ProjectInfo;
  edits: EditService;
  tailwind: TailwindService;
  bridge: ShellBridge;
  /** The project's language-service problems (the backend's cached run; `refresh` runs it again). */
  diagnostics(refresh: boolean): Promise<AnalysisOutput & { at: number }>;
  /** Templates that do not compile right now (checked on every save; the canvas keeps their last good version). */
  compileErrors?(): CompileError[];
  /** Tells the shell the undo history changed (the backend's `history` SSE event). */
  historyChanged(): void;
  /** The webview's CDP port, when the backend has one. */
  cdpPort: number | null;
  /** Origins the shell's page is served from (to find it among CDP targets). */
  shellOrigins(): string[];
  /** Where a browser to render screenshots without CDP is; `findBrowser()` by default (tests turn it off with null). */
  browser?: string | null;
}

export const SERVER_INFO = { name: "gable-designer", version: "0.1.0" } as const;

const INSTRUCTIONS = `Drives the Gable Designer, a visual editor over a Gable app's own source files.
- Start with get_status. UI tools (mode, frames, selection, route, scenario, tree, signals, screenshot) need a Designer window to be open; get_status says whether one is and where to open it.
- Elements are named by a source position: { file, line, column } (1-based, project-relative path), anywhere inside the element. Omit the target to use the element selected in the Designer.
- Every edit tool writes a minimal patch to the project's source and returns the unified diff; undo and redo step through the same history as the UI.
- Positions shift after an edit: use the element position an edit returns, or describe_element again.`;

type Json = Record<string, unknown> | unknown[];

const text = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const failure = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

class ToolError extends Error {}

/** Runs a tool body; a thrown error becomes an MCP tool error (the agent reads it), never a protocol error. */
const guard =
  <A>(body: (args: A) => Promise<unknown>) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      const out = await body(args);
      return typeof out === "object" && out !== null && "content" in out && Array.isArray((out as CallToolResult).content) ? (out as CallToolResult) : text(out);
    } catch (e) {
      return failure(e instanceof Error ? e.message : String(e));
    }
  };

// --- schemas -----------------------------------------------------------------------------------------------------------

const position = z
  .object({
    file: z.string().describe("Project-relative path, e.g. src/app.ts (a dev-server URL like /src/app.ts also works)."),
    line: z.number().int().min(1).describe("1-based line."),
    column: z.number().int().min(1).default(1).describe("1-based column; any position inside the element (its tag, attributes or content)."),
  })
  .describe("A source position inside an html`` template; the innermost element containing it is meant.");
const target = position.optional().describe("The element. Omit to use the element currently selected in the Designer.");
const breakpoint = z.string().optional().describe("Tailwind breakpoint prefix to edit at (e.g. md); omit for the base (mobile-first) value.");
const states = z.array(z.string()).optional().describe("State variants to edit at, e.g. [\"hover\"] or [\"dark\", \"focus\"].");
const frameId = z.string().describe("Frame id from get_status.");

// --- the server --------------------------------------------------------------------------------------------------------

export function createControlServer(ctx: ControlContext): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  const { bridge } = ctx;
  // The project can change under a running MCP session (the Designer opens another project): read it each time.
  const live = { get root() { return ctx.root; }, get edits() { return ctx.edits; } };
  const read = (name: string, description: string) => ({ title: name, description, annotations: { readOnlyHint: true, openWorldHint: false } });
  const write = (name: string, description: string, idempotent = false) => ({ title: name, description, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: idempotent, openWorldHint: false } });

  const shell = <N extends keyof ControlCommands>(name: N, params: ControlCommands[N]["params"], timeoutMs?: number) => bridge.call(name, params, timeoutMs);

  /** The snapshot, or null when no window is connected (reads that can do without it). */
  const snapshotOrNull = async (): Promise<ShellSnapshot | null> => (bridge.connected ? shell("snapshot", undefined).catch(() => null) : null);

  const selectionTarget = (sel: SelectionSnapshot | null): TargetRef => {
    if (!sel) throw new ToolError("Nothing is selected in the Designer. Pass a target ({ file, line, column }) or select an element first (select_element).");
    if (!sel.node.exact) throw new ToolError("The selected element's template contains escapes, so its positions cannot be mapped to the file; it cannot be edited visually.");
    return { raw: sel.node.raw, start: sel.node.start, tag: sel.node.tag, modulePath: sel.node.component?.source?.path };
  };

  const resolveTarget = async (pos: SourcePos | undefined): Promise<TargetRef> => {
    if (pos) {
      const hit = targetAt(live.root, pos);
      if ("error" in hit) throw new ToolError(hit.error);
      return hit.target;
    }
    return selectionTarget((await shell("snapshot", undefined)).selection);
  };

  const where = (t: TargetRef): SourcePos | null => {
    const file = fileOfTarget(live.root, t);
    return file ? positionOf(live.root, file, t.raw, t.start) : null;
  };

  /** The element model with source positions for it and its neighbours, so the agent can address them next. */
  const describe = (t: TargetRef) => {
    const m = live.edits.describe(t);
    if (!m.ok) throw new ToolError(`${m.code}: ${m.error}`);
    const file = fileOfTarget(live.root, t) ?? m.file;
    const at = (start: number) => positionOf(live.root, file, t.raw, start);
    const sib = (s: NodeModel["prev"]) => (s ? { tag: s.tag, at: at(s.start) } : null);
    return {
      tag: m.tag,
      at: at(t.start),
      attrs: m.attrs,
      text: m.text,
      canAddText: m.canAddText,
      contentWhy: m.contentWhy,
      canHaveChildren: m.canHaveChildren,
      parent: sib(m.parent),
      prev: sib(m.prev),
      next: sib(m.next),
      children: m.children.map((c) => ({ kind: c.kind, label: c.label, ...(c.kind === "element" ? { at: at(c.start) } : {}) })),
    };
  };

  const fileText = (rel: string): string => {
    try {
      return readFileSync(join(live.root, rel), "utf8");
    } catch {
      return "";
    }
  };

  /** Applies an edit through the edit service and reports the patch it wrote. */
  const commit = async (result: () => EditResult, file: string | null): Promise<Json> => {
    const before = file ? fileText(file) : "";
    const r = result();
    if (!r.ok) throw new ToolError(`${r.code}: ${r.error}`);
    if (r.noop) return { ok: true, label: r.label, file: r.file, noop: true, diff: "" };
    const diff = unifiedDiff(r.file, file === r.file ? before : "", fileText(r.file));
    ctx.historyChanged();
    let element: SourcePos | null = null;
    if (r.select) {
      element = positionOf(live.root, r.file, r.select.raw, r.select.offset);
      // The shell selects the edited element again once HMR has re-rendered it, as it does after a UI edit.
      if (bridge.connected) void shell("reselect", r.select, 8000).catch(() => undefined);
    }
    return { ok: true, label: r.label, file: r.file, ...(r.relocated ? { relocated: true } : {}), ...(element ? { element } : {}), diff };
  };

  const applyOp = async (pos: SourcePos | undefined, build: (t: TargetRef) => EditOp): Promise<Json> => {
    const t = await resolveTarget(pos);
    return commit(() => live.edits.apply(build(t)), fileOfTarget(live.root, t));
  };

  // --- reads: the project ----------------------------------------------------------------------------------------------

  server.registerTool(
    "get_status",
    read("Designer status", "Project, dev server, whether a Designer window is connected (and where to open one), the window's mode, target, route, frames and selection, undo history, Tailwind mode and screenshot support. Call this first."),
    guard(async () => {
      const snap = await snapshotOrNull();
      const { info: tw } = await ctx.tailwind.load();
      const history = live.edits.history();
      return {
        project: ctx.info,
        window: snap
          ? {
              connected: true,
              connection: snap.connection,
              mode: snap.mode,
              target: snap.target,
              scene: snap.scene,
              scenario: snap.pageScenario,
              url: snap.url,
              breakpoint: snap.breakpoint,
              selectedFrame: snap.selectedFrame,
              frames: snap.frames.map(({ nonce: _n, ...f }) => f),
              presets: snap.presets,
              selection: snap.selection ? summary(snap.selection, live.root) : null,
            }
          : { connected: false, open: bridge.shellUrl },
        history: { undo: history.undo.length, redo: history.redo.length, lastEdit: history.undo.at(-1)?.label ?? null, externallyChanged: history.external },
        tailwind: tw.enabled ? { enabled: true, version: tw.version, breakpoints: tw.breakpoints, states: tw.states } : { enabled: false, why: tw.message },
        screenshot: ctx.cdpPort ? "live frame over CDP" : browser() ? `fresh render in ${browser()}` : "unavailable (no CDP port and no Chromium/Edge found; set GABLE_CHROME)",
      };
    }),
  );

  server.registerTool(
    "list_components",
    read("List components", "The project's components (exported classes with static meta) and the palette of elements insert_element can add (HTML, gable-ui and project components)."),
    guard(async () => ({
      components: listComponents(live.root),
      palette: live.edits.palette().map((p) => ({ group: p.group, name: p.name, ...(p.selector ? { selector: p.selector } : {}) })),
    })),
  );

  server.registerTool(
    "list_scenes",
    read("List scenes", "Every *.scenes.ts file with its scenes (name, description, how many HTTP mocks, start URL). Use with show_component / set_scene (component mode) or set_scenario (page mode)."),
    guard(async () => sceneIndex(live.root)),
  );

  server.registerTool(
    "list_routes",
    read("List routes", "The route config as written in the source (file, routes with their index paths and lines) and, when a window is connected, the running router's URL and active routes."),
    guard(async () => {
      const config = locateRouteConfig(live.root);
      const snap = await snapshotOrNull();
      const routers = snap ? ((await shell("inspect", { what: "routers" }).catch(() => [])) as Array<{ id: string; url: string; routes: unknown }>) : [];
      return { config, runtime: routers.map((r) => ({ id: r.id, url: r.url, routes: r.routes })) };
    }),
  );

  server.registerTool(
    "get_problems",
    {
      ...read("Get problems", "Template language-service problems in the project (file, line, column, severity, rule, message). `refresh` re-runs the analysis first (a few seconds). `notCompiling` lists templates that do not compile as saved now (checked on every save, before the analysis): the canvas shows their last good version."),
      inputSchema: { refresh: z.boolean().default(false).describe("Run the analysis again before answering.") },
    },
    guard(async ({ refresh }) => {
      const d = await ctx.diagnostics(refresh);
      return {
        at: new Date(d.at).toISOString(),
        configErrors: d.configErrors,
        problems: d.diagnostics.map(({ raw: _r, offset: _o, id: _i, ...p }) => p),
        notCompiling: (ctx.compileErrors?.() ?? []).map(({ raw: _r, offset: _o, ...p }) => p),
      };
    }),
  );

  server.registerTool(
    "get_history",
    read("Get undo history", "The Designer's undo and redo stacks (labels and files), shared with the UI. `external` lists files changed outside the Designer since its last edit."),
    guard(async () => live.edits.history()),
  );

  // --- reads: an element -------------------------------------------------------------------------------------------------

  server.registerTool(
    "describe_element",
    {
      ...read("Describe element", "An element's editable model: attributes (static ones are editable; bindings, events and refs are read-only, with why), text runs, and the source positions of its parent, siblings and child elements."),
      inputSchema: { target },
    },
    guard(async ({ target: pos }) => describe(await resolveTarget(pos))),
  );

  server.registerTool(
    "get_selection",
    read("Get selection", "The element selected in the Designer window: its tag, owning component, source range, and its editable model (as describe_element). Null when nothing is selected."),
    guard(async () => {
      const sel = (await shell("snapshot", undefined)).selection;
      if (!sel) return { selection: null };
      const s = summary(sel, live.root);
      let model: unknown = null;
      try {
        model = describe(selectionTarget(sel));
      } catch (e) {
        model = { error: e instanceof Error ? e.message : String(e) };
      }
      return { selection: s, element: model };
    }),
  );

  server.registerTool(
    "get_styles",
    {
      ...read("Get Tailwind styles", "How the element's static Tailwind classes resolve at a breakpoint and state: the value of each style control (spacing, color, type, layout...), which class sets it and whether it is inherited from a smaller breakpoint. Needs Tailwind mode."),
      inputSchema: { target, breakpoint, states },
    },
    guard(async ({ target: pos, breakpoint: bp, states: st }) => {
      const t = await resolveTarget(pos);
      const { model, info } = await ctx.tailwind.load();
      if (!model) throw new ToolError(info.enabled ? "Tailwind mode is off." : `Tailwind mode is off: ${info.message}`);
      const classes = classOf(describe(t).attrs);
      const a = model.analyze(classes, bp ?? null, st ?? []);
      return {
        classes,
        values: Object.fromEntries(Object.entries(a.values).filter(([, v]) => v)),
        unknownClasses: a.tokens.filter((x) => !x.known).map((x) => x.token),
      };
    }),
  );

  // --- reads: the running app (through the window) -----------------------------------------------------------------------

  server.registerTool(
    "get_tree",
    read("Get component tree", "The running app's component tree in the selected frame: one line per component instance, indented by depth, with its id (for get_signals), selector and a distinguishing label."),
    guard(async () => {
      const nodes = (await shell("inspect", { what: "tree" })) as Array<{ id: string; parent: string | null; name: string; selector: string; label: string }>;
      const kids = new Map<string | null, typeof nodes>();
      for (const n of nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
      const lines: string[] = [];
      const walk = (parent: string | null, depth: number) => {
        for (const n of kids.get(parent) ?? []) {
          lines.push(`${"  ".repeat(depth)}${n.name} <${n.selector}> id=${n.id}${n.label ? ` "${n.label}"` : ""}`);
          walk(n.id, depth + 1);
        }
      };
      walk(null, 0);
      return lines.join("\n") || "(no components rendered)";
    }),
  );

  server.registerTool(
    "get_signals",
    {
      ...read("Get component signals", "A component instance's inputs, signals (name, kind, current value, writable) and effects in the running app. Defaults to the component that owns the selected element."),
      inputSchema: { component: z.string().optional().describe("Component instance id from get_tree; omit for the selection's owner.") },
    },
    guard(async ({ component }) => {
      const detail = (await shell("inspect", { what: "component", id: component })) as { id: string; name: string; source: unknown; inputs: SignalLike[]; signals: SignalLike[]; outputs: string[]; effects: unknown[] } | null;
      if (!detail) throw new ToolError(component ? `No component instance ${component} is rendered.` : "No component is selected; pass a component id from get_tree.");
      const sig = (s: SignalLike) => ({ id: s.id, name: s.name, kind: s.kind, writable: s.writable, value: s.value?.s ?? s.value });
      return { id: detail.id, name: detail.name, source: detail.source, inputs: detail.inputs.map(sig), signals: detail.signals.map(sig), outputs: detail.outputs, effects: detail.effects.length };
    }),
  );

  server.registerTool(
    "get_hmr_timeline",
    read("Get HMR timeline", "Hot updates the selected frame received, newest last: modules, what each changed class got (patch, view or resetup) and errors. Use after an edit to confirm it applied."),
    guard(async () => shell("inspect", { what: "hmr" })),
  );

  server.registerTool(
    "get_performance",
    {
      ...read("Get performance", "The selected frame's performance as the Performance tab shows it: web-vitals (TTFB, FCP, LCP, CLS, INP, TBT) and DOM size with their ratings, the elements behind LCP and each layout shift (a CSS-style label such as `img#hero.cover`, which select_element accepts as a selector, and the rendering component when a template renders it), long tasks, interactions, requests, and Gable's own counts. A metric the browser did not report is null with the reason, never zero. Numbers are from the dev server: indicative, not a production measurement. `reload` reloads the frame first and measures the fresh load."),
      inputSchema: { reload: z.boolean().default(false).describe("Reload the frame and measure the fresh load (as Re-run does).") },
    },
    guard(async ({ reload }) => shell("performance", { reload })),
  );

  server.registerTool(
    "get_http_log",
    read("Get mocked HTTP", "The active Scenario's HTTP mocks and the requests they answered in the selected frame (method, URL, which mock, outcome)."),
    guard(async () => shell("inspect", { what: "http" })),
  );

  // --- writes: the window (UI state) --------------------------------------------------------------------------------------

  server.registerTool(
    "set_mode",
    { ...write("Set canvas mode", "`select`: clicks on the canvas pick elements and the app does not see them. `interact`: the app behaves normally.", true), inputSchema: { mode: z.enum(["select", "interact"]) } },
    guard(async ({ mode }) => brief(await shell("setMode", { mode }))),
  );

  server.registerTool(
    "show_page",
    write("Show page mode", "Shows the whole app with its router (page mode). Use navigate and set_scenario next.", true),
    guard(async () => brief(await shell("setTarget", { kind: "page" }, 30000))),
  );

  server.registerTool(
    "show_component",
    {
      ...write("Show component mode", "Mounts one component in isolation from a scenes file (component mode), optionally at a named scene.", true),
      inputSchema: { scenes: z.string().describe("Scenes module as served, e.g. /src/components/todo-item.scenes.ts (see list_scenes)."), scene: z.string().optional().describe("Scene name; omit for the file's first scene.") },
    },
    guard(async ({ scenes, scene }) => brief(await shell("setTarget", { kind: "component", scenes: scenes.startsWith("/") ? scenes : "/" + scenes, ...(scene ? { scene } : {}) }, 30000))),
  );

  server.registerTool(
    "set_scene",
    { ...write("Set scene", "Component mode: mounts another scene of the current scenes file, in place.", true), inputSchema: { name: z.string() } },
    guard(async ({ name }) => brief(await shell("setScene", { name }))),
  );

  server.registerTool(
    "set_scenario",
    {
      ...write("Set page Scenario", "Page mode: reloads the app with a scene's HTTP mocks and providers applied (or none). The scene's start URL, if it names one, is opened.", true),
      inputSchema: { scenes: z.string().optional().describe("Scenes module, e.g. /src/users.scenes.ts. Omit both to clear the Scenario."), name: z.string().optional().describe("Scene name.") },
    },
    guard(async ({ scenes, name }) => {
      if (!!scenes !== !!name) throw new ToolError("Pass both scenes and name, or neither to clear the Scenario.");
      return brief(await shell("setScenario", scenes && name ? { scenes: scenes.startsWith("/") ? scenes : "/" + scenes, name } : null, 30000));
    }),
  );

  server.registerTool(
    "navigate",
    { ...write("Navigate", "Page mode: navigates the app's router in the selected frame, as the URL bar does.", true), inputSchema: { url: z.string().describe("App URL path, e.g. /users/42?tab=posts") } },
    guard(async ({ url }) => brief(await shell("navigate", { url }))),
  );

  server.registerTool(
    "add_frame",
    { ...write("Add frame", "Adds a frame (another app instance) to the canvas, up to six. Presets are listed by get_status."), inputSchema: { preset: z.string().optional().describe("Preset id, e.g. iphone-15, pixel-8, ipad, laptop, desktop.") } },
    guard(async ({ preset }) => brief(await shell("frames", { action: "add", ...(preset ? { preset } : {}) }))),
  );

  server.registerTool(
    "update_frame",
    {
      ...write("Update frame", "Resizes a frame or changes its device emulation (color scheme, touch, reduced motion, user agent); `preset` applies a device preset first.", true),
      inputSchema: {
        frame: frameId,
        preset: z.string().optional(),
        width: z.number().int().min(200).max(4000).optional().describe("CSS pixels (portrait)."),
        height: z.number().int().min(200).max(4000).optional(),
        dpr: z.number().min(1).max(5).optional().describe("Device pixel ratio reported to scripts."),
        landscape: z.boolean().optional(),
        colorScheme: z.enum(["auto", "light", "dark"]).optional(),
        touch: z.boolean().optional(),
        reducedMotion: z.boolean().optional(),
        userAgent: z.string().nullable().optional(),
      },
    },
    guard(async ({ frame, preset, width, height, dpr, landscape, colorScheme, touch, reducedMotion, userAgent }) => {
      if (preset) await shell("frames", { action: "preset", id: frame, preset });
      const emulation = Object.fromEntries(Object.entries({ colorScheme, touch, reducedMotion, userAgent }).filter(([, v]) => v !== undefined));
      const patch: Record<string, unknown> = Object.fromEntries(Object.entries({ width, height, dpr, landscape }).filter(([, v]) => v !== undefined));
      if (Object.keys(emulation).length) patch.emulation = emulation;
      return brief(Object.keys(patch).length || !preset ? await shell("frames", { action: "update", id: frame, patch: patch as FramePatch }) : await shell("snapshot", undefined));
    }),
  );

  server.registerTool(
    "remove_frame",
    { ...write("Remove frame", "Removes a frame from the canvas (the last one stays)."), inputSchema: { frame: frameId } },
    guard(async ({ frame }) => brief(await shell("frames", { action: "remove", id: frame }))),
  );

  server.registerTool(
    "select_frame",
    { ...write("Select frame", "Makes a frame the one the panels inspect, selections happen in and Tailwind's breakpoint follows.", true), inputSchema: { frame: frameId } },
    guard(async ({ frame }) => brief(await shell("frames", { action: "select", id: frame }))),
  );

  server.registerTool(
    "select_element",
    {
      ...write("Select element", "Selects an element in the selected frame, as clicking it in select mode would: by source position, or by a CSS selector in the rendered page. `clear` deselects.", true),
      inputSchema: {
        target: position.optional(),
        selector: z.string().optional().describe("CSS selector; the first match that comes from a template is selected."),
        clear: z.boolean().optional(),
      },
    },
    guard(async ({ target: pos, selector, clear }) => {
      let sel: SelectionSnapshot | null;
      if (clear) sel = await shell("select", null);
      else if (selector) sel = await shell("select", { selector });
      else if (pos) {
        const hit = targetAt(live.root, pos);
        if ("error" in hit) throw new ToolError(hit.error);
        sel = await shell("select", { raw: hit.target.raw, offset: hit.target.start });
      } else throw new ToolError("Pass a target, a selector, or clear: true.");
      if (!sel && !clear) throw new ToolError("No rendered element matches (it may be under a false @if, or on another route or scene).");
      return { selection: sel ? summary(sel, live.root) : null };
    }),
  );

  // --- writes: source edits ------------------------------------------------------------------------------------------------

  server.registerTool(
    "edit_text",
    {
      ...write("Edit text", "Replaces a text run of the element (or adds text to an element that has none). `{{ }}` interpolations in the run must stay as they are, in order."),
      inputSchema: { target, text: z.string(), run: z.number().int().min(0).default(0).describe("Which text run (see describe_element `text`); 0 is the first.") },
    },
    guard(async ({ target: pos, text: value, run }) => {
      const t = await resolveTarget(pos);
      const m = live.edits.describe(t);
      const op: EditOp = m.ok && m.text.length === 0 && m.canAddText ? { op: "addText", target: t, text: value } : { op: "setText", target: t, run, text: value };
      return commit(() => live.edits.apply(op), fileOfTarget(live.root, t));
    }),
  );

  server.registerTool(
    "set_attribute",
    {
      ...write("Set attribute", "Sets a static attribute (adds it when missing), or removes one with value null. Removing also works for a binding that is a plain signal read, named as written ([title])."),
      inputSchema: { target, name: z.string().describe("Attribute name as written, e.g. class, href, [title]."), value: z.string().nullable() },
    },
    guard(async ({ target: pos, name, value }) => applyOp(pos, (t) => (value === null ? { op: "removeAttr", target: t, name } : { op: "setAttr", target: t, name, value }))),
  );

  server.registerTool(
    "bind",
    {
      ...write("Bind to a signal", "Binds a property, attribute, class, style or two-way model of the element to a signal of its component (`expr` is a plain read like count()), or with kind text appends {{ expr }} to its content."),
      inputSchema: { target, kind: z.enum(["prop", "attr", "class", "style", "model", "text"]), name: z.string().optional().describe("What to bind (e.g. disabled, aria-label, active, width.px, value); not used for text."), expr: z.string() },
    },
    guard(async ({ target: pos, kind, name, expr }) =>
      applyOp(pos, (t) => {
        if (kind === "text") return { op: "addTextBinding", target: t, expr };
        if (!name) throw new ToolError("name is required for this kind of binding.");
        return { op: "setBinding", target: t, kind, name, expr };
      }),
    ),
  );

  server.registerTool(
    "insert_element",
    {
      ...write("Insert element", "Inserts markup before or after the element, or as its first or last child. Give a snippet, or the name of a palette entry (list_components): a component also gets imported and listed in the owning component's imports."),
      inputSchema: {
        target,
        where: z.enum(["before", "after", "first", "last"]),
        snippet: z.string().optional().describe("Template markup, e.g. <p>Hello</p>."),
        paletteItem: z.string().optional().describe("Palette entry name, e.g. button, UiButton."),
      },
    },
    guard(async ({ target: pos, where: w, snippet, paletteItem }) => {
      let component: ComponentRef | undefined;
      let markup = snippet;
      if (paletteItem) {
        const entry = live.edits.palette().find((p) => p.name === paletteItem) ?? live.edits.palette().find((p) => p.name.toLowerCase() === paletteItem.toLowerCase());
        if (!entry) throw new ToolError(`No palette entry is called ${paletteItem}; see list_components.`);
        markup ??= entry.snippet;
        component = entry.component;
      }
      if (!markup) throw new ToolError("Pass a snippet or a paletteItem.");
      const snippetText = markup;
      return applyOp(pos, (t) => ({ op: "insert", target: t, where: w, snippet: snippetText, ...(component ? { component } : {}) }));
    }),
  );

  server.registerTool(
    "delete_element",
    { ...write("Delete element", "Deletes the element (and its content) from its template."), inputSchema: { target } },
    guard(async ({ target: pos }) => applyOp(pos, (t) => ({ op: "delete", target: t }))),
  );

  server.registerTool(
    "move_element",
    {
      ...write("Move element", "Moves the element next to or into another element of the same template."),
      inputSchema: { target, to: position.describe("An element of the same template to move relative to."), where: z.enum(["before", "after", "first", "last"]) },
    },
    guard(async ({ target: pos, to, where: w }) => {
      const dest = targetAt(live.root, to);
      if ("error" in dest) throw new ToolError(dest.error);
      return applyOp(pos, (t) => {
        if (dest.target.raw !== t.raw) throw new ToolError("An element can only move within its own template.");
        return { op: "move", target: t, to: { ...t, start: dest.target.start, tag: dest.target.tag }, where: w };
      });
    }),
  );

  server.registerTool(
    "wrap_element",
    {
      ...write("Wrap element", "Wraps the element in an @if block (with `if`) or an @for block (with `for`)."),
      inputSchema: {
        target,
        if: z.string().optional().describe("Condition, e.g. open()."),
        for: z.object({ item: z.string(), source: z.string().describe("e.g. items()"), track: z.string().describe("e.g. item.id") }).optional(),
      },
    },
    guard(async ({ target: pos, if: cond, for: loop }) => {
      if (!!cond === !!loop) throw new ToolError("Pass exactly one of if or for.");
      return applyOp(pos, (t) => ({ op: "wrap", target: t, with: cond ? { kind: "if", cond } : { kind: "for", ...loop! } }));
    }),
  );

  server.registerTool(
    "set_component_meta",
    {
      ...write("Set component meta", "Sets a string property of the static meta of the component whose template holds the element."),
      inputSchema: { target, key: z.enum(["selector", "id", "encapsulation"]), value: z.string() },
    },
    guard(async ({ target: pos, key, value }) => applyOp(pos, (t) => ({ op: "setMeta", target: t, key, value }))),
  );

  server.registerTool(
    "set_css",
    {
      ...write("Set CSS declaration", "Sets (or with value null removes) one declaration of a rule in a project .css file; the rule is appended when the file has none."),
      inputSchema: { file: z.string().describe("Project-relative .css path."), selector: z.string(), property: z.string(), value: z.string().nullable() },
    },
    guard(async ({ file, selector, property, value }) => {
      const f = projectFile(live.root, file);
      if ("error" in f) throw new ToolError(f.error);
      return commit(() => live.edits.apply({ op: "setCss", file: f.rel, selector, property, value }), f.rel);
    }),
  );

  // Design tokens (CSS custom properties): list_tokens, get_token_usages, set_token.
  registerTokenTools(server, { root: () => live.root, edits: () => live.edits, tailwind: () => ctx.tailwind, commit, read, write, guard });

  server.registerTool(
    "edit_classes",
    {
      ...write("Edit Tailwind classes", "Adds Tailwind classes to the element at a breakpoint and state, replacing the classes they conflict with (same variants, same CSS properties: p-8 replaces p-4, md:p-8 leaves p-4), and/or removes classes. Only the static class attribute is written; unknown classes are refused. Needs Tailwind mode."),
      inputSchema: {
        target,
        add: z.array(z.string()).optional().describe("Utilities without variants (p-4, bg-brand), written with breakpoint and states; or full tokens with variants (md:hover:p-4), written as given."),
        remove: z.array(z.string()).optional().describe("Exact class tokens to remove."),
        breakpoint,
        states,
      },
    },
    guard(async ({ target: pos, add, remove, breakpoint: bp, states: st }) => {
      const { model, info } = await ctx.tailwind.load();
      if (!model) throw new ToolError(info.enabled ? "Tailwind mode is off." : `Tailwind mode is off: ${info.message}`);
      const t = await resolveTarget(pos);
      let classes = classOf(describe(t).attrs);
      const removed: string[] = [];
      const added: string[] = [];
      if (remove?.length) {
        const r = model.plan({ classes, remove, breakpoint: null, states: [] });
        if (!r.ok) throw new ToolError(r.error);
        (classes = r.classes), removed.push(...r.removed);
      }
      for (const token of add ?? []) {
        const r = model.plan(token.includes(":") ? { classes, token, breakpoint: null, states: [] } : { classes, utility: token, breakpoint: bp ?? null, states: st ?? [] });
        if (!r.ok) throw new ToolError(r.error);
        classes = r.classes;
        removed.push(...r.removed);
        if (r.added) added.push(r.token);
      }
      const result = await commit(() => live.edits.apply({ op: "setAttr", target: t, name: "class", value: classes }), fileOfTarget(live.root, t));
      return { ...(result as object), classes, added, removed };
    }),
  );

  server.registerTool(
    "undo",
    write("Undo", "Undoes the last Designer edit (made here or in the UI). Refuses with a conflict, writing nothing, when the file changed so the patch no longer finds its place."),
    guard(async () => commit(() => live.edits.undo(), live.edits.history().undo.at(-1)?.file ?? null)),
  );

  server.registerTool(
    "redo",
    write("Redo", "Redoes the last undone Designer edit."),
    guard(async () => commit(() => live.edits.redo(), live.edits.history().redo.at(-1)?.file ?? null)),
  );

  // --- screenshot ----------------------------------------------------------------------------------------------------------

  const browser = () => (ctx.browser === undefined ? findBrowser() : ctx.browser);

  server.registerTool(
    "screenshot",
    {
      ...read("Screenshot a frame", "A PNG of a frame at its own size (default: the selected frame). Live over CDP in the desktop app; otherwise a fresh headless render of the frame's URL, route and Scenario (state only the open window holds is not in it)."),
      inputSchema: { frame: z.string().optional().describe("Frame id from get_status; omit for the selected frame.") },
    },
    guard(async ({ frame }) => {
      const rect: FrameRect = await shell("frameRect", frame ? { frame } : {});
      let shot: Shot | null = null;
      const errors: string[] = [];
      if (ctx.cdpPort) {
        try {
          shot = await captureLive(ctx.cdpPort, rect, ctx.shellOrigins());
        } catch (e) {
          errors.push(`CDP: ${e instanceof Error ? e.message : e}`);
        }
      }
      const b = browser();
      if (!shot && b) {
        try {
          shot = await captureHeadless(b, rect);
        } catch (e) {
          errors.push(`headless: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (!shot) throw new ToolError(`No screenshot could be taken. ${errors.join(" ") || "There is no CDP port (desktop app) and no Chromium or Edge was found; set GABLE_CHROME to a Chromium-family browser."}`);
      return {
        content: [
          { type: "image", data: shot.data, mimeType: "image/png" },
          { type: "text", text: `${shot.note} Frame ${rect.frame}: ${rect.width}x${rect.height} CSS px.` },
        ],
      };
    }),
  );

  registerSignalTools(server, { shell, commit, live, guard, read, write, fail: (message) => { throw new ToolError(message); } });
  registerHistoryTools(server, { shell, guard, read, write, fail: (message) => { throw new ToolError(message); } });
  registerWhyTools(server, { shell, guard, read, write, fail: (message) => { throw new ToolError(message); } });
  const kit = { server, shell, commit, live, read, write, guard, fail: (message: string): never => { throw new ToolError(message); } };
  registerNetworkTools(kit);
  registerStorageTools(kit);

  return server;
}

interface SignalLike {
  id: string;
  name: string;
  kind: string;
  writable: boolean;
  value?: { s?: string };
}

/** The static class attribute's value ("" when there is none). */
function classOf(attrs: NodeModel["attrs"]): string {
  return attrs.find((a) => a.name === "class" && a.kind === "static")?.value ?? "";
}

/** A selection as an agent wants it: no template text, a source position instead of offsets. */
function summary(sel: SelectionSnapshot, root: string) {
  const n = sel.node;
  const file = n.component?.source?.path ?? null;
  const at = n.exact && file ? positionOf(root, file, n.raw, n.start) : null;
  return {
    tag: n.tag,
    at,
    component: sel.component ?? (n.component ? { id: n.component.id, name: n.component.name } : null),
    renderedElements: n.elements,
    chain: sel.chain.map((c) => c.tag),
    ...(n.exact ? {} : { readonly: "The template contains escapes; positions cannot be mapped to the file." }),
  };
}

/** The state after a UI command, short. */
function brief(s: ShellSnapshot) {
  return {
    connection: s.connection,
    mode: s.mode,
    target: s.target,
    scene: s.scene,
    scenario: s.pageScenario,
    url: s.url,
    selectedFrame: s.selectedFrame,
    breakpoint: s.breakpoint,
    frames: s.frames.map((f) => ({ id: f.id, name: f.name, width: f.width, height: f.height, dpr: f.dpr, emulation: f.emulation, connection: f.connection, selected: f.selected })),
  };
}
