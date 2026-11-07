// The command channel between the backend and the shell (TASK-56.13). The shell is the single source of UI state (mode,
// target, frames, selection, route, scenario): an agent driving the Designer over MCP does not keep a copy of it, it asks
// the shell, and the shell does what a click would do. The backend sends commands down a dedicated SSE stream
// (`/api/shell/channel`) and the shell answers each with a POST to `/api/shell/reply`, both token-checked like the rest of
// `/api/`. Types only: the shell imports this file without pulling in server code.
import type { ComponentDetail, HmrEntry, RouterInfo, TreeNode } from "@gable/core/devtools";
import type { DesignNode } from "@gable/core/designer";
import type { ColorScheme } from "./devices.js";
import type { NetworkCommand, NetworkCommandResult } from "./network.js";
import type { StorageCommand, StorageCommandResult } from "./storage.js";
import type { HttpLogEntry, PageScenarioInfo, PerfReport, SceneInfo } from "./protocol.js";
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
  /** The Network panel: a frame's requests, its network condition, recording real responses. */
  network: { params: NetworkCommand; result: NetworkCommandResult };
  /** The Storage panel: a frame's localStorage, sessionStorage and cookies, read and edited. */
  storage: { params: StorageCommand; result: StorageCommandResult };
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
