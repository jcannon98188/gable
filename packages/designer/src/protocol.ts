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

/** Where the Designer's Vite plugin serves axe-core (as an ES module) for the agent's accessibility checks. */
export const AXE_PATH = "/__gable-designer/axe.js";

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
  /** The template node of the first element matching a CSS selector (or its nearest ancestor that has one). */
  nodeBySelector: { params: { selector: string }; result: DesignNode | null };
  /** The diagnostics to show on the canvas; each is located by the template literal text and an offset into it. */
  setDiagnostics: { params: { items: CanvasDiagnostic[] }; result: { placed: number; unplaced: number } };
  /**
   * What the page itself emulates for its frame: touch events from the mouse, the pixel ratio scripts read, and a text scale
   * (`textScale`, 1 = the page's own: the root font size is multiplied, so rem-based text and spacing follow, px does not).
   */
  setEmulation: { params: { touch: boolean; dpr: number; textScale?: number }; result: { touchEvents: boolean } };
  /** Marks a node the shell can see but not edit (a dynamic class list, a refused element): amber hatch and a lock chip. `id` null clears. */
  setReadOnly: { params: { id: string | null; label: string }; result: { elements: number } };
  /**
   * Another frame's selection, drawn here without selecting it (no `pick` comes back): the element at `start` of the template
   * `raw` (ids differ between frames, the template text does not). `null` clears.
   */
  mirror: { params: { raw: string; start: number } | null; result: { elements: number } };
  /**
   * Drag-insert from the shell: the template element under a point (CSS pixels of this page) and where a drop there inserts,
   * with an insertion line drawn. `null` clears the line.
   */
  dropTarget: { params: { x: number; y: number } | null; result: { node: DesignNode; where: DropWhere } | null };
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
  /** Runs the accessibility checker (axe-core, loaded on first use) on the page as it is now. Added after version 1 shipped; additive. */
  a11y: { params: void; result: A11yReport };
  /**
   * The page's performance as the browser measured it (Performance Timeline: paint, LCP, layout shifts, long tasks, event
   * timing, navigation and resource timing), plus DOM size and what the devtools hook counts. Waits for the page's `load`
   * and a painted frame first. Added after version 1 shipped; additive.
   */
  performance: { params: void; result: PerfReport };
  /**
   * Reloads the frame's document (the session survives in `window.name`, so the agent says `ready` again). Component mode
   * keeps the mounted scene. Added after version 1 shipped; additive.
   */
  reload: { params: void; result: true };
  /**
   * Writes JSON text to a writable signal after checking it has the shape of the value the signal holds now (see
   * `signal-value.ts`); `force` skips the check. Added after version 1 shipped; additive.
   */
  setSignalValue: { params: { id: string; text: string; force?: boolean }; result: SignalWriteResult };
  /**
   * Pins a signal to a value: written now (checked like `setSignalValue`) and again whenever the app changes it, until
   * unpinned (`text: null`) or until the app fights it (then suspended, with the reason). Pins live as long as the page.
   * Added after version 1 shipped; additive.
   */
  pinSignal: { params: { id: string; text: string | null; force?: boolean }; result: SignalWriteResult };
  pins: { params: void; result: SignalPin[] };
  /** Component mode: the mounted Component's inputs and writable signals as a Scene could hold them. Added after version 1 shipped; additive. */
  sceneState: { params: void; result: SceneStateReport | null };
}

export type SignalWriteResult = { ok: true } | { ok: false; error: string; /** Where the value does not fit the current one. */ problems?: string[] };

export interface SignalPin {
  id: string;
  name: string;
  owner: string | null;
  /** The pinned value, as JSON text. */
  text: string;
  /** `suspended`: the app kept overwriting it, see `reason`; `gone`: the signal no longer exists (remounted or hot-updated). */
  status: "active" | "suspended" | "gone";
  reason?: string;
}

/** One field of the mounted Component that a Scene can set: an input (`inputs`) or a writable signal (`state`). */
export interface SceneStateField {
  field: string;
  kind: "input" | "state";
  id: string;
  /** Its value as JSON text, or null when it is not plain data (`error` says why). */
  text: string | null;
  error?: string;
  /** Written from the Designer since the scene mounted. */
  poked: boolean;
  /** Differs from its value when the scene mounted. */
  changed: boolean;
}

export interface SceneStateReport {
  module: string;
  component: string;
  scene: string;
  fields: SceneStateField[];
  /** Signals written from the Designer that a Scene of this Component cannot hold (a child's or a service's). */
  skipped: Array<{ name: string; owner: string | null; reason: string }>;
}

/** web-vitals' rating names. */
export type PerfRating = "good" | "needs-improvement" | "poor";

/** An element a metric points at, tied to the template node that renders it (or its nearest ancestor a template renders). */
export interface PerfElement {
  /** A short description of the element: `img.hero`, `p#intro`. */
  label: string;
  node: { id: string; tag: string; component: string | null } | null;
  /** False when the element is no longer in the page (the metric still counts it). */
  connected: boolean;
}

export type PerfMetricId = "ttfb" | "fcp" | "lcp" | "cls" | "inp" | "tbt" | "dom";

/** One headline number with its rating. `value` is null when the page has not produced it yet or the engine cannot measure it (`unavailable` says which). */
export interface PerfMetric {
  id: PerfMetricId;
  label: string;
  value: number | null;
  unit: "ms" | "score" | "elements";
  rating: PerfRating | null;
  /** The good and poor limits the rating uses: good at or below the first, poor above the second. */
  thresholds: [number, number];
  /** Why there is no value: the engine does not report it, or the page has not produced it yet. */
  unavailable: string | null;
  /** The element behind it (LCP, the worst interaction's target). */
  element?: PerfElement | null;
}

/** One layout shift of the worst session window (the one CLS is). */
export interface PerfShift {
  value: number;
  /** ms since the navigation started. */
  at: number;
  sources: PerfElement[];
}

export interface PerfReport {
  url: string;
  mode: "page" | "component";
  /** When it was measured, in ms since the navigation started. */
  at: number;
  metrics: PerfMetric[];
  lcp: { at: number; size: number; url: string | null; element: PerfElement | null } | null;
  /** CLS's session window, biggest shift first (at most 10). */
  shifts: PerfShift[];
  /** null when the engine does not report long tasks. `blockingMs` is TBT: past FCP, until `at` (there is no TTI here). */
  longTasks: { count: number; totalMs: number; longestMs: number; blockingMs: number; tasks: Array<{ at: number; duration: number }> } | null;
  /** null when the engine has no Event Timing. */
  interactions: { count: number; worst: { type: string; duration: number; at: number; element: PerfElement | null } | null } | null;
  navigation: { type: string; ttfb: number; domInteractive: number; domContentLoaded: number; load: number; transferBytes: number } | null;
  resources: {
    count: number;
    transferBytes: number;
    decodedBytes: number;
    /** Requests whose size the browser does not expose (cross-origin without Timing-Allow-Origin) or that came from cache. */
    unsized: number;
    /** The Designer's own requests (agent, checker), left out of the numbers. */
    designer: number;
    byType: Array<{ type: string; count: number; transferBytes: number }>;
    slowest: Array<{ name: string; type: string; duration: number; transferBytes: number }>;
  } | null;
  dom: { elements: number; depth: number; maxChildren: number };
  /** What the devtools hook counted since the agent connected (before the app bootstrapped). null without the hook. */
  gable: {
    flushes: number;
    effectRuns: number;
    effectMs: number;
    slowestFlush: { ms: number; at: number; effect: string | null } | null;
    /** When the first component tree was reported, ms since the navigation started. */
    firstTree: number | null;
    /** The last hot update: when it was applied and how long until the next frame after it. */
    lastHotUpdate: { at: number; toFrameMs: number | null; status: string } | null;
  } | null;
  /** The page's own view of its device: CSS viewport and the pixel ratio scripts read. */
  device: { width: number; height: number; dpr: number };
  /** Performance entry types this engine does not report (their metrics are unavailable, not zero). */
  unsupported: string[];
}

/** What the accessibility checker found on the page. Only failures and undecided checks are listed; passes are counted. */
export interface A11yReport {
  /** The checker and its version, for example `axe-core 4.14.0`. */
  engine: string;
  url: string;
  mode: "page" | "component";
  /** Rules that ran, and the ones turned off for this mode (component mode mounts one component, not a page). */
  rules: number;
  skipped: string[];
  /** Rules that passed on every element they apply to. */
  passed: number;
  checks: A11yCheck[];
  /** How long the run took. */
  ms: number;
}

/** One element that failed (or could not be decided by) one rule. */
export interface A11yCheck {
  /** Unique within the report. */
  id: string;
  /** The checker's rule id, for example `color-contrast` or `image-alt`. */
  rule: string;
  /** `violation`: the rule failed. `review`: the checker could not decide (text over an image, say) and a person has to look. */
  kind: "violation" | "review";
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  /** The rule in a sentence. */
  help: string;
  helpUrl: string;
  /** What is wrong with this element, as the checker words it. */
  summary: string;
  /** The element's markup, shortened. */
  html: string;
  /** The checker's selector for the element. */
  selector: string;
  /** The template node that renders the element (or its nearest ancestor that a template renders); null when no template does. */
  node: { id: string; tag: string; component: string | null } | null;
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

export type DropWhere = "before" | "after" | "last";

/**
 * Where a drop at `y` on an element lands: its top quarter inserts before it, its bottom quarter after it, the middle inside
 * (as its last child) when it can have children; one that cannot splits at the middle.
 */
export function dropWhere(rect: { top: number; height: number }, y: number, canHaveChildren: boolean): DropWhere {
  const at = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;
  if (!canHaveChildren) return at < 0.5 ? "before" : "after";
  return at < 0.25 ? "before" : at > 0.75 ? "after" : "last";
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
  /** A button of the selection's floating toolbar was clicked; the shell performs it (as a source edit, or by moving the selection). */
  | (Envelope & { type: "action"; action: "parent" | "move-up" | "move-down" | "delete"; id: string })
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
