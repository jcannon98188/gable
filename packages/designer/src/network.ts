// What the Preview agent sees of the frame's network, and the conditions the Designer puts on it. Shared by the agent, the
// shell and the backend (plain data and pure functions only: no DOM, no Node).

/**
 * A network condition on one frame. The agent applies it to the page's API requests (`fetch`, `XMLHttpRequest`, and the
 * Scenario's HTTP mocks), so it works in every engine: `slow` holds each request back `delay` ms, `error` answers with
 * `status`, `offline` fails it the way a dropped connection does (and makes `navigator.onLine` false). `match` narrows it to
 * requests whose URL contains the text. `frame` takes the whole frame offline as well (assets, sockets) over CDP, which only
 * the desktop app (or a browser with a debugging port) has.
 */
export interface NetworkCondition {
  mode: "normal" | "slow" | "error" | "offline";
  delay: number;
  status: number;
  match: string;
  frame: boolean;
}

export const NORMAL_CONDITION: NetworkCondition = { mode: "normal", delay: 2000, status: 500, match: "", frame: false };

const MODES: ReadonlyArray<NetworkCondition["mode"]> = ["normal", "slow", "error", "offline"];

/** Only known modes and sane numbers get through (the condition reaches the page from the shell, MCP and sessionStorage). */
export function sanitizeCondition(value: unknown): NetworkCondition {
  const v = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof NetworkCondition, unknown>>;
  const mode = MODES.includes(v.mode as NetworkCondition["mode"]) ? (v.mode as NetworkCondition["mode"]) : "normal";
  const delay = typeof v.delay === "number" && Number.isFinite(v.delay) ? Math.min(60000, Math.max(0, Math.round(v.delay))) : NORMAL_CONDITION.delay;
  const status = typeof v.status === "number" && Number.isInteger(v.status) && v.status >= 400 && v.status <= 599 ? v.status : NORMAL_CONDITION.status;
  const match = typeof v.match === "string" ? v.match.slice(0, 200) : "";
  return { mode, delay, status, match, frame: mode === "offline" && v.frame === true };
}

/** Whether the condition applies to a request for `url` (the mode is not `normal`, and the URL contains `match`). */
export function conditionApplies(c: NetworkCondition, url: string): boolean {
  return c.mode !== "normal" && (c.match === "" || url.includes(c.match));
}

/** The condition in a few words: `Slow (2000 ms)`, `Error 503 on /api`, `Offline`. */
export function conditionLabel(c: NetworkCondition): string {
  const base = c.mode === "slow" ? `Slow (+${c.delay} ms)` : c.mode === "error" ? `Error ${c.status}` : c.mode === "offline" ? (c.frame ? "Offline (whole frame)" : "Offline") : "Normal";
  return c.mode !== "normal" && c.match ? `${base} on ${c.match}` : base;
}

/** One request of the frame, as the agent saw it. Times are ms on the frame's clock (`performance.now()`). */
export interface NetworkEntry {
  id: number;
  /** `fetch` and `xhr` are the page's own requests; `mock` was answered by the Scenario's HTTP mocks without a network. */
  kind: "fetch" | "xhr" | "mock";
  method: string;
  /** Absolute. */
  url: string;
  /** null while pending; 0 when it failed without a response. */
  status: number | null;
  statusText: string;
  start: number;
  duration: number | null;
  /** Response body bytes, when known. */
  size: number | null;
  contentType: string | null;
  /** The app's code that made the request (`/src/users.ts:12`), from the call stack. */
  initiator: string | null;
  error: string | null;
  /** What the Designer's network condition did to it, if anything. */
  conditioned: string | null;
  /** `mock`: the index of the mock that answered, -1 when none did. */
  mock?: number;
}

/** One real response kept while recording: what a mock needs to answer the same request the same way. */
export interface RecordedResponse {
  id: number;
  method: string;
  /** The URL as the app asked for it, without its query: exactly what a mock's string `url` matches. */
  url: string;
  query: string;
  status: number;
  contentType: string;
  /** Parsed JSON, or the text; null when there was no body or it was not kept (see `skipped`). */
  body: unknown;
  /** Why the body was not kept: a binary or oversized response. */
  skipped?: string;
  /** Date.now() */
  at: number;
}

export interface RecordingInfo {
  on: boolean;
  count: number;
  /** False when sessionStorage refused the records (they are kept until the frame reloads). */
  persisted: boolean;
}

/** The agent's `network` answer. */
export interface NetworkSnapshot {
  entries: NetworkEntry[];
  condition: NetworkCondition;
  recording: RecordingInfo;
  /** Requests dropped from the start of the log (it keeps the last 500). */
  dropped: number;
}

/** A mock as the Designer writes it into a scenes file: plain literals only. */
export interface MockSpec {
  method: string;
  url: string;
  status: number;
  body: unknown;
}

/**
 * The mocks a recording becomes: one per method and URL (a mock's string URL ignores the query, so later answers to the same
 * path replace earlier ones), in the order they were first seen. Responses whose body was not kept are left out and listed.
 */
export function mocksFromRecording(records: readonly RecordedResponse[]): { mocks: MockSpec[]; left: Array<{ method: string; url: string; why: string }> } {
  const byKey = new Map<string, MockSpec>();
  const left: Array<{ method: string; url: string; why: string }> = [];
  for (const r of records) {
    if (r.skipped) {
      left.push({ method: r.method, url: r.url, why: r.skipped });
      continue;
    }
    byKey.set(`${r.method} ${r.url}`, { method: r.method, url: r.url, status: r.status, body: r.body });
  }
  return { mocks: [...byKey.values()], left };
}

/** One mock of a scene as it is written in the scenes file. `reply` is null when it is computed (a function), so it is shown but not edited. */
export interface MockInfo {
  index: number;
  method: string | null;
  /** The URL as written (a RegExp shows as `/…/`). */
  url: string;
  reply: { status: number | null; delay: number | null; error: string | null; body: unknown; hasBody: boolean } | null;
  /** Why the mock cannot be edited here. */
  readonly: string | null;
}

export interface SceneMocks {
  scene: string;
  mocks: MockInfo[];
  /** The scene's `http` is not a list written in the file (computed), so it is not edited. */
  readonly: string | null;
}

/** A change to one mock's reply: a value sets it, null removes it. */
export interface MockReplyPatch {
  status?: number | null;
  delay?: number | null;
  error?: "network" | "abort" | null;
  body?: unknown;
}

/** The agent methods behind the Network panel. Added after protocol version 1 shipped; additive. */
export interface NetworkMethods {
  /** The frame's requests (the last 500), its condition and the recording state. `clear` empties the log first. */
  network: { params: { clear?: boolean }; result: NetworkSnapshot };
  /** Puts a condition on the frame's API requests (kept across reloads of the frame); `mode: "normal"` lifts it. */
  setNetworkCondition: { params: NetworkCondition; result: NetworkCondition };
  /** Starts or stops recording real responses (recording survives reloads of the frame), or clears what was recorded. */
  record: { params: { on?: boolean; clear?: boolean }; result: RecordingInfo };
  /** The responses recorded so far, oldest first. */
  recording: { params: void; result: RecordedResponse[] };
}

/** Why the whole frame cannot be taken offline here. */
export const OFFLINE_NEEDS_CDP = "Taking the whole frame offline needs CDP (the Windows desktop app, or a browser started with a debugging port). The page's API requests can still be failed as offline without it.";

/** What MCP asks the shell's Network panel to do, on the selected frame or the frame `frame` (an id). */
export type NetworkCommand =
  | { action: "get"; frame?: string; clear?: boolean }
  | { action: "condition"; frame?: string; condition: Partial<NetworkCondition> }
  | { action: "record"; frame?: string; on?: boolean; clear?: boolean; reload?: boolean }
  | { action: "recording"; frame?: string };

export interface NetworkCommandResult {
  frame: { id: string; name: string };
  /** The frame's network after the command. */
  snapshot: NetworkSnapshot;
  /** `recording`: what was recorded, oldest first. */
  records?: RecordedResponse[];
  /** Something that did not apply as asked (whole-frame offline without CDP, a reload that did not come back). */
  note: string | null;
}
