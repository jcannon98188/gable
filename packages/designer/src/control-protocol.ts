// The command channel between the backend and the shell (TASK-56.13). The shell is the single source of UI state (mode,
// target, frames, selection, route, scenario): an agent driving the Designer over MCP does not keep a copy of it, it asks
// the shell, and the shell does what a click would do. The backend sends commands down a dedicated SSE stream
// (`/api/shell/channel`) and the shell answers each with a POST to `/api/shell/reply`, both token-checked like the rest of
// `/api/`. Types only: the shell imports this file without pulling in server code.
import type { ComponentDetail, HistoryInfo, HmrEntry, RouterInfo, TravelResult, TreeNode } from "@gable/core/devtools";
import type { DesignNode } from "@gable/core/designer";
import type { ColorScheme } from "./devices.js";
import type { A11yReport, A11yTreeReport, FocusOrderReport, FocusStepResult, HttpLogEntry, PageScenarioInfo, PerfReport, SceneInfo, SceneStateReport, SignalPin, SignalWriteResult } from "./protocol.js";
import type { NetworkCommand, NetworkCommandResult } from "./network.js";
import type { StorageCommand, StorageCommandResult } from "./storage.js";
import type { SourceRange } from "./server/source.js";

export interface FrameSnapshot {
  id: string;
  name: string;
  /** Rendered size in CSS pixels (rotation applied). */
  width: number;
  height: number;
  dpr: number;
  landscape: boolean;
  presetId: string | null;
  emulation: { touch: boolean; colorScheme: ColorScheme; reducedMotion: boolean; userAgent: string | null };
  connection: string;
  selected: boolean;
  /** The frame's session nonce (CDP finds the frame by it). */
  nonce: string;
}

export interface SelectionSnapshot {
  node: DesignNode;
  /** The picked node's ancestors, nearest first (the node itself is first). */
  chain: Array<Pick<DesignNode, "id" | "tag">>;
  component: { id: string; name: string } | null;
  source: SourceRange | { error: string } | null;
}

export interface ShellSnapshot {
  connection: string;
  mode: "select" | "interact";
  target: { kind: "page" } | { kind: "component"; scenes: string };
  /** Component mode: the mounted scene. */
  scene: string | null;
  /** Page mode: the Scenario applied to the app. */
  pageScenario: { scenes: string; name: string } | null;
  /** The router's URL in the selected frame, when the page has a router. */
  url: string | null;
  frames: FrameSnapshot[];
  selectedFrame: string;
  /** The Tailwind breakpoint the selected frame's width reaches (`base` below the first). */
  breakpoint: string;
  selection: SelectionSnapshot | null;
  presets: Array<{ id: string; name: string; width: number; height: number }>;
}

export interface FramePatch {
  name?: string;
  width?: number;
  height?: number;
  dpr?: number;
  landscape?: boolean;
  emulation?: Partial<FrameSnapshot["emulation"]>;
}

export type FrameAction =
  | { action: "add"; preset?: string }
  | { action: "remove"; id: string }
  | { action: "select"; id: string }
  | { action: "update"; id: string; patch: FramePatch }
  | { action: "preset"; id: string; preset: string };

/** What the backend can ask of the shell. Every write answers with the state after it. */
export interface ControlCommands {
  snapshot: { params: void; result: ShellSnapshot };
  setMode: { params: { mode: "select" | "interact" }; result: ShellSnapshot };
  setTarget: { params: { kind: "page" } | { kind: "component"; scenes: string; scene?: string }; result: ShellSnapshot };
  setScene: { params: { name: string }; result: ShellSnapshot };
  setScenario: { params: { scenes: string; name: string } | null; result: ShellSnapshot };
  navigate: { params: { url: string }; result: ShellSnapshot };
  frames: { params: FrameAction; result: ShellSnapshot };
  /** Selects the element at a template offset, the first element matching a CSS selector, or nothing (`null`). */
  select: { params: { raw: string; offset: number } | { selector: string } | null; result: SelectionSnapshot | null };
  inspect: { params: Inspect; result: InspectResult };
  /** Where the frame's iframe is in the shell's viewport, for a clipped screenshot. */
  frameRect: { params: { frame?: string }; result: FrameRect };
  /** Selects the element at a template offset once HMR has re-rendered it (after an edit). */
  reselect: { params: { raw: string; offset: number }; result: boolean };
  /** The selected frame's performance, as the Performance tab shows it; `reload` re-runs it on a fresh load first. */
  performance: { params: { reload?: boolean }; result: PerfResult };
  /** Signal state editing in the selected frame, through the Inspector's service so the window shows it. */
  signals: { params: SignalAction; result: SignalsResult };
  /** The selected frame's state history (the drawer's State timeline), and travel through it, through the tab's service. */
  history: { params: HistoryAction; result: HistoryResult };
  /** The Network panel: a frame's requests, its network condition, recording real responses. */
  network: { params: NetworkCommand; result: NetworkCommandResult };
  /** The Storage panel: a frame's localStorage, sessionStorage and cookies, read and edited. */
  storage: { params: StorageCommand; result: StorageCommandResult };
  /** Accessibility of the selected frame (TASK-56.26): the checker report, focus order, accessibility tree, stepping focus and the canvas view. */
  a11y: { params: A11yCommand; result: A11yCommandResult };
}

/** What the `a11y` command does. `view` sets the canvas overlay and keyboard-only mode (the Focus & tree panel shows them). */
export type A11yCommand =
  | { action: "report"; rerun?: boolean }
  | { action: "focusOrder" }
  | { action: "tree"; id?: string }
  | { action: "step"; to: "next" | "prev" | "first" | "last" | { id: string }; steps?: number }
  | { action: "view"; focusOrder?: boolean; keyboardOnly?: boolean };

export interface A11yCommandResult {
  frame: { name: string; width: number; height: number };
  /** The canvas view after the command. */
  view: { focusOrder: boolean; keyboardOnly: boolean };
  report?: A11yReport | null;
  /** Why the checker report is missing. */
  error?: string | null;
  focus?: FocusOrderReport;
  tree?: A11yTreeReport;
  step?: FocusStepResult;
}

/** What the `history` command does: report, travel (to a step; `start`: before the first; `live`: the newest), clear, record. */
export type HistoryAction =
  | { action: "report" }
  | { action: "travel"; to: number | "start" | "live" }
  | { action: "clear" }
  | { action: "record"; on: boolean };

export interface HistoryResult {
  info: HistoryInfo;
  /** The travel's outcome (`travel`). */
  travel?: TravelResult;
}

/** What the `signals` command does: a checked write, a pin (`text: null` unpins), or just a report. */
export type SignalAction =
  | { action: "set"; id: string; text: string; force?: boolean }
  | { action: "pin"; id: string; text: string | null; force?: boolean }
  | { action: "report" };

export interface SignalsResult {
  /** The write's outcome (`set` and `pin`). */
  write?: SignalWriteResult;
  pins: SignalPin[];
  /** Component mode: the mounted Component's inputs and writable signals, as "Save as Scenario" would write them. */
  scene: SceneStateReport | null;
}

export interface PerfResult {
  /** Null when the frame could not be measured (`error` says why). */
  report: PerfReport | null;
  error: string | null;
  /** What the report followed: the page load, a hot update, a navigation, Re-run or this call. */
  after: string;
  frame: { name: string; width: number; height: number; dpr: number; throttling: string };
  note: string;
}

export type Inspect =
  | { what: "tree" }
  | { what: "component"; id?: string }
  | { what: "hmr" }
  | { what: "routers" }
  | { what: "http" }
  | { what: "scenes" };

export type InspectResult = TreeNode[] | ComponentDetail | null | HmrEntry[] | RouterInfo[] | { scenario: PageScenarioInfo | null; log: HttpLogEntry[] } | SceneInfo;

export interface FrameRect {
  frame: string;
  nonce: string;
  /** The iframe's box in the shell's CSS pixels (scaled with the board). */
  rect: { x: number; y: number; width: number; height: number };
  /** The frame's own CSS size, and the board's scale (rect = size * scale). */
  width: number;
  height: number;
  scale: number;
  /** The URL the frame shows (for a fresh render when the window cannot be captured). */
  url: string;
  dpr: number;
  emulation: FrameSnapshot["emulation"];
}

export type ControlName = keyof ControlCommands;

export interface ControlRequest {
  id: number;
  name: ControlName;
  params: unknown;
}

export type ControlReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
