// The wire protocol between the Designer shell (the parent window) and the Preview agent (inside the previewed app's
// iframe). Plain JSON over postMessage, versioned, and bound to one session by a nonce: both sides check `origin`,
// `source` and the nonce on every message, so a page that happens to be framed (or a script in the preview) cannot
// drive the shell, and the agent never answers anyone but the window that opened it.
import type { ComponentDetail, DevtoolsEvent, DevtoolsMethods, HmrEntry } from "@gable/core/devtools";
import type { DesignNode } from "@gable/core/designer";

/** Bumped on any incompatible change. The agent refuses a shell that speaks another version, and says so. */
export const PROTOCOL_VERSION = 1;

/** Marks a message as ours. */
export const CHANNEL = "gable-designer";

/**
 * The shell sets the preview iframe's `name` to `PREFIX nonce SEPARATOR shellOrigin`: the agent reads it (as
 * `window.name`) before any app code runs, and only then talks, to exactly that origin. A page opened outside the
 * Designer has no such name, so its agent stays dormant.
 */
export const NAME_PREFIX = "gable-designer:";
export const nameFor = (nonce: string, shellOrigin: string) => `${NAME_PREFIX}${nonce}|${shellOrigin}`;
export function parseName(name: string): { nonce: string; shellOrigin: string } | null {
  if (!name.startsWith(NAME_PREFIX)) return null;
  const rest = name.slice(NAME_PREFIX.length);
  const bar = rest.indexOf("|");
  return bar > 0 ? { nonce: rest.slice(0, bar), shellOrigin: rest.slice(bar + 1) } : null;
}

interface Envelope {
  channel: typeof CHANNEL;
  v: number;
  nonce: string;
}

// --- shell to agent --------------------------------------------------------

/** Everything the shell can ask of the agent: the devtools methods plus the design ones. */
export interface AgentMethods extends DevtoolsMethods {
  /** `select`: clicks pick elements and the app does not see them. `interact`: the app behaves normally. */
  setMode: { params: { mode: "select" | "interact" }; result: true };
  /** Selects a template node (as clicking its element would), or clears with `null`. */
  selectNode: { params: { id: string | null }; result: true };
  /** Outlines a template node's elements without selecting it (hover from a list); `null` clears. */
  hoverNode: { params: { id: string | null }; result: true };
  /** The template node of a source offset in a template literal whose text is `raw`, if it is rendered. */
  nodeAt: { params: { raw: string; offset: number }; result: DesignNode | null };
  /** The diagnostics to show on the canvas; each is located by the template literal text and an offset into it. */
  setDiagnostics: { params: { items: CanvasDiagnostic[] }; result: { placed: number; unplaced: number } };
  /** Component mode: what the page mounts. */
  scenes: { params: void; result: SceneInfo | null };
  mountScene: { params: { name: string }; result: true };
}

export interface CanvasDiagnostic {
  id: string;
  severity: "warn" | "error";
  rule: string;
  message: string;
  /** The template literal's text as written, and the offset of the diagnostic inside it. */
  raw: string;
  offset: number;
}

export interface SceneInfo {
  /** The scenes module as served, for example `/src/components/todo-item.scenes.ts`. */
  module: string;
  component: string;
  current: string;
  scenes: Array<{ name: string; description?: string }>;
}

export type Request = Envelope & {
  type: "call";
  /** Matches the response. */
  id: number;
  method: keyof AgentMethods;
  params: unknown;
};

/** The shell opens the conversation once the iframe loads: it tells the agent which protocol it speaks. */
export type Hello = Envelope & { type: "hello" };

export type ShellMessage = Request | Hello;

// --- agent to shell --------------------------------------------------------

export interface Ready {
  protocol: number;
  /** The project root as the dev server reports it. */
  root: string | null;
  location: string;
  /** `component` when the page is the component-mode host. */
  mode: "page" | "component";
}

export type AgentMessage =
  | (Envelope & { type: "ready" } & Ready)
  | (Envelope & { type: "response"; id: number; ok: true; result: unknown })
  | (Envelope & { type: "response"; id: number; ok: false; error: string })
  /** Devtools events (tree, injectors, flush, hmr, router) as they happen. */
  | (Envelope & { type: "event"; event: DevtoolsEvent })
  /** The user clicked an element in select mode (or selection was cleared with `node: null`). */
  | (Envelope & { type: "pick"; node: DesignNode | null; chain: DesignNode[]; component: ComponentDetail | null })
  /** A diagnostic badge on the canvas was clicked. */
  | (Envelope & { type: "badge"; id: string })
  | (Envelope & { type: "scenes"; scenes: SceneInfo | null })
  /** The shell speaks a protocol the agent does not. */
  | (Envelope & { type: "incompatible"; agent: number; shell: number });

export function envelope(nonce: string): Envelope {
  return { channel: CHANNEL, v: PROTOCOL_VERSION, nonce };
}

/** True when `data` is one of our messages for this session, whatever its version (a version mismatch is reported, not ignored). */
export function isOurs(data: unknown, nonce: string): data is Envelope & { type: string } {
  const d = data as Partial<Envelope> & { type?: unknown } | null;
  return !!d && typeof d === "object" && d.channel === CHANNEL && d.nonce === nonce && typeof d.type === "string";
}

export type { HmrEntry };
