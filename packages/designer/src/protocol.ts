// The wire protocol between the Designer shell (the parent window) and the Preview agent (inside the previewed app's
// iframe). Plain JSON over postMessage, versioned, and bound to one session by a nonce: both sides check `origin`,
// `source` and the nonce on every message, so a page that happens to be framed (or a script in the preview) cannot
// drive the shell, and the agent never answers anyone but the window that opened it.
import type { ComponentDetail, DevtoolsEvent, DevtoolsMethods, HmrEntry } from "@gable/core/devtools";
import type { DesignNode } from "@gable/core/designer";

/** Bumped on any incompatible change. The agent refuses a shell that speaks another version, and says so. */
export const PROTOCOL_VERSION = 1;

/** The page URL parameter that names the page-mode Scenario: `<scenes module>|<scene name>`. It stays in the URL so a reload of the frame keeps it. */
export const SCENARIO_PARAM = "__gable_scenario";

/** Marks a message as ours. */
export const CHANNEL = "gable-designer";

/**
 * The shell loads the preview with `?__gable_designer=<nonce>|<shellOrigin>`: the agent reads it before any app code runs,
 * keeps it in the frame's own `window.name` (so a reload of the frame stays bound; sessionStorage would be shared by every frame
 * of the same origin, and several frames of one app are exactly what the multi-frame canvas shows), strips it from the URL, and only then talks, to exactly
 * that origin. A page opened outside the Designer has no such parameter, so its agent stays dormant. (The iframe's
 * `window.name` was the first idea; browsers clear it on a cross-site navigation, which the preview always is.)
 */
export const SESSION_PARAM = "__gable_designer";
const STORE_KEY = "gable-designer-session";
/**
 * Where a frame keeps its session: `window.name` belongs to one browsing context (so two frames of one app do not
 * overwrite each other) and survives reloads of that frame (it is only cleared on a cross-site navigation, and the preview
 * stays on its own site). The backend reads it over CDP to tell frames apart (see `SESSION_NAME_PREFIX`).
 */
export const SESSION_NAME_PREFIX = "gable-designer-session:";
export const windowNameStorage = (win: { name: string }): Pick<Storage, "getItem" | "setItem"> => ({
  getItem: () => (win.name.startsWith(SESSION_NAME_PREFIX) ? win.name.slice(SESSION_NAME_PREFIX.length) : null),
  setItem: (_key, value) => void (win.name = SESSION_NAME_PREFIX + value),
});
export const withSession = (url: string, nonce: string, shellOrigin: string): string => {
  const u = new URL(url);
  u.searchParams.set(SESSION_PARAM, `${nonce}|${shellOrigin}`);
  return u.href;
};
export function parseSession(value: string | null): { nonce: string; shellOrigin: string } | null {
  const bar = value ? value.indexOf("|") : -1;
  return value && bar > 0 ? { nonce: value.slice(0, bar), shellOrigin: value.slice(bar + 1) } : null;
}
/** The agent's side: the session from the URL (removing it there) or, after a reload, from the storage given (the frame's window.name). */
export function takeSession(loc: Location, history: History, storage: Pick<Storage, "getItem" | "setItem"> | null): { nonce: string; shellOrigin: string } | null {
  const url = new URL(loc.href);
  const fromUrl = url.searchParams.get(SESSION_PARAM);
  if (fromUrl !== null) {
    url.searchParams.delete(SESSION_PARAM);
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    try {
      storage?.setItem(STORE_KEY, fromUrl);
    } catch {
      // storage blocked: the session lasts until the next reload
    }
    return parseSession(fromUrl);
  }
  try {
    return parseSession(storage?.getItem(STORE_KEY) ?? null);
  } catch {
    return null;
  }
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
  /** What the page itself emulates for its frame: touch events from the mouse, and the pixel ratio scripts read. */
  setEmulation: { params: { touch: boolean; dpr: number }; result: { touchEvents: boolean } };
  /**
   * Tailwind mode's temporary look of one template node (nothing is written to source): `addClasses` are put on its elements,
   * `css` is injected as the last stylesheet (the rule of a class that is not in the project's build yet, or a forced state's
   * rule), `mark` tags the element (and its nearest `.group` ancestor) so CDP can force pseudo-states on it, `dark` puts
   * `dark` on the root. `id: null` removes it all.
   */
  setPreview: { params: { id: string | null; addClasses: string[]; css: string; mark: boolean; dark: boolean }; result: { elements: number } };
  /** Repeats a user interaction another frame reported (sync between frames); `false` if its element is not on this page. */
  replay: { params: Interaction; result: boolean };
  /** Component mode: what the page mounts. */
  scenes: { params: void; result: SceneInfo | null };
  mountScene: { params: { name: string }; result: true };
  /** Page mode: the Scenario applied to the real app (its page URL named one), or null when none is active. */
  pageScenario: { params: void; result: PageScenarioInfo | null };
  /** The HTTP requests the Scenario's mocks have answered (newest last), in either mode. */
  httpLog: { params: void; result: HttpLogEntry[] };
}

export interface PageScenarioInfo {
  module: string;
  name: string;
  /** Where the Scenario wants the app to open (`Scene.url`), if it says. */
  url: string | null;
  mocks: Array<{ method: string; url: string }>;
}

export interface HttpLogEntry {
  method: string;
  url: string;
  /** Index into the Scenario's `http` list; -1 when no mock matched. */
  mock: number;
  outcome: string;
  at: number;
}

/** A user interaction, located by the child-index path of its element from the document element. */
export interface Interaction {
  kind: "click" | "input" | "scroll" | "key";
  path: number[];
  /** `key`: the key (only Enter and Escape are synced). `input`: the new value (and `checked` for checkboxes and radios). */
  key?: string;
  /** `input`: the new value (and `checked` for checkboxes and radios). */
  value?: string;
  checked?: boolean;
  /** `scroll`: the offset as a fraction of the scrollable range, so frames of different sizes line up. */
  x?: number;
  y?: number;
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
  /** A real (trusted) click, input or scroll in interact mode, for syncing the other frames. */
  | (Envelope & { type: "interaction"; interaction: Interaction })
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
