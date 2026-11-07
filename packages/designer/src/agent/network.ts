// The Preview agent's view of the page's network: every `fetch` and `XMLHttpRequest` the app makes (and every request the
// Scenario's HTTP mocks answer), the network condition the Designer puts on them, and recording real responses so they can
// be written into a scenes file as mocks. Only installed in a Designer session; the Designer's and Vite's own requests are
// left alone. The condition and the recording live in the frame's sessionStorage (each frame has its own origin), so a
// reload keeps them: that is how the first requests of a page load get slowed, failed or recorded.
import { NORMAL_CONDITION, conditionApplies, sanitizeCondition, type NetworkCondition, type NetworkEntry, type NetworkSnapshot, type RecordedResponse, type RecordingInfo } from "../network.js";

/** sessionStorage keys of the Designer's own state; the Storage panel leaves them out. */
export const DESIGNER_STORAGE_PREFIX = "__gable_designer";
const CONDITION_KEY = "__gable_designer_net";
const RECORD_KEY = "__gable_designer_rec";
const MAX_ENTRIES = 500;
const MAX_RECORDS = 100;
const MAX_BODY = 512 * 1024;
const SIMULATED = "Simulated by the Gable Designer";

/** What the generated Scenario module (vite-plugin.ts) calls for every mocked request, to log it and apply the condition. */
export interface MockHook {
  reply(req: { method: string; url: string; params?: Record<string, unknown> }, reply: MockReply, index: number): MockReply;
  unmatched(entry: { method: string; url: string; outcome: string }): void;
}
interface MockReply {
  status?: number;
  statusText?: string;
  body?: unknown;
  delay?: number;
  error?: "network" | "abort";
}

declare global {
  // eslint-disable-next-line no-var
  var __GABLE_DESIGNER_NET__: MockHook | undefined;
}

export interface CaptureTarget {
  fetch?: typeof fetch;
  XMLHttpRequest?: typeof XMLHttpRequest;
  location: { href: string };
  navigator?: Navigator;
  dispatchEvent?(e: Event): boolean;
}

export interface CaptureOptions {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** The Designer's own modules and endpoints (never logged or conditioned). */
  isDesigner(url: string): boolean;
  /** Something changed (throttled by the caller). */
  changed(): void;
  now?(): number;
}

const read = <T>(storage: CaptureOptions["storage"], key: string): T | null => {
  try {
    const v = storage?.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};

/** Vite's own traffic: its client, pre-bundled deps and modules, and its ping. */
const VITE = /\/@(vite|fs|id)\/|\/__vite|\/node_modules\//;

/** The first frame of the call stack that is the app's own code (`/src/users.ts:12`), skipping this agent, Vite and dependencies. */
export function initiatorOf(stack: string | undefined, skip: (url: string) => boolean): string | null {
  for (const m of (stack ?? "").matchAll(/(https?:\/\/[^\s()]+?):(\d+):\d+/g)) {
    const url = m[1]!;
    if (skip(url) || VITE.test(url)) continue;
    try {
      const u = new URL(url);
      return `${u.pathname}:${m[2]}`;
    } catch {
      continue;
    }
  }
  return null;
}

const typeOf = (headers: Headers | null): string | null => headers?.get("content-type")?.split(";")[0]?.trim().toLowerCase() || null;
const isText = (type: string | null) => !type || /^text\/|json|xml|javascript|x-www-form-urlencoded/.test(type);
/** A response whose body can be read up front and handed on as a copy: not a stream, not opaque, not a null-body status. */
const bufferable = (res: Response) =>
  !!res.body && res.type !== "opaque" && res.type !== "opaqueredirect" && res.status >= 200 && ![204, 205, 304].includes(res.status) && typeOf(res.headers) !== "text/event-stream";

export class NetworkCapture {
  entries: NetworkEntry[] = [];
  dropped = 0;
  condition: NetworkCondition;
  #next = 1;
  #recording: boolean;
  #records: RecordedResponse[];
  #persisted = true;
  #opts: CaptureOptions;
  #target: CaptureTarget | null = null;
  #offline = false;
  #now: () => number;

  constructor(opts: CaptureOptions) {
    this.#opts = opts;
    this.#now = opts.now ?? (() => performance.now());
    this.condition = sanitizeCondition(read(opts.storage, CONDITION_KEY) ?? NORMAL_CONDITION);
    const rec = read<{ on?: boolean; records?: RecordedResponse[] }>(opts.storage, RECORD_KEY);
    this.#recording = rec?.on === true;
    this.#records = Array.isArray(rec?.records) ? rec.records : [];
    this.#next = this.#records.reduce((n, r) => Math.max(n, r.id + 1), 1);
  }

  /** Wraps `fetch` and `XMLHttpRequest` of `target` and publishes the hook the Scenario's mocks call. */
  install(target: CaptureTarget): void {
    this.#target = target;
    if (target.fetch) target.fetch = this.#wrapFetch(target.fetch, target);
    if (target.XMLHttpRequest) this.#wrapXhr(target.XMLHttpRequest);
    globalThis.__GABLE_DESIGNER_NET__ = { reply: (req, reply, index) => this.#mocked(req, reply, index), unmatched: (e) => this.#unmatched(e) };
    this.#syncOnline(false);
  }

  snapshot(): NetworkSnapshot {
    return { entries: this.entries.map((e) => ({ ...e })), condition: { ...this.condition }, recording: this.recordingInfo(), dropped: this.dropped };
  }

  clear(): void {
    this.dropped = 0;
    this.entries = [];
    this.#opts.changed();
  }

  setCondition(value: unknown): NetworkCondition {
    this.condition = sanitizeCondition(value);
    try {
      if (this.condition.mode === "normal") this.#opts.storage?.removeItem(CONDITION_KEY);
      else this.#opts.storage?.setItem(CONDITION_KEY, JSON.stringify(this.condition));
    } catch {
      // storage blocked: the condition lasts until the next reload
    }
    this.#syncOnline(true);
    this.#opts.changed();
    return { ...this.condition };
  }

  record({ on, clear }: { on?: boolean; clear?: boolean }): RecordingInfo {
    if (on !== undefined) this.#recording = on;
    if (clear) this.#records = [];
    this.#saveRecords();
    this.#opts.changed();
    return this.recordingInfo();
  }

  recordingInfo(): RecordingInfo {
    return { on: this.#recording, count: this.#records.length, persisted: this.#persisted };
  }

  recorded(): RecordedResponse[] {
    return this.#records.map((r) => ({ ...r }));
  }

  #saveRecords(): void {
    try {
      if (!this.#recording && this.#records.length === 0) this.#opts.storage?.removeItem(RECORD_KEY);
      else this.#opts.storage?.setItem(RECORD_KEY, JSON.stringify({ on: this.#recording, records: this.#records }));
      this.#persisted = true;
    } catch {
      this.#persisted = false;
    }
  }

  // --- the log -------------------------------------------------------------------------------------------------------

  #absolute(url: string): string {
    try {
      return new URL(url, this.#target?.location.href).href;
    } catch {
      return url;
    }
  }

  #skip(url: string): boolean {
    return this.#opts.isDesigner(url) || VITE.test(url);
  }

  #initiator(): { at: string | null; vite: boolean } {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 60;
    const stack = new Error().stack;
    Error.stackTraceLimit = limit;
    // Vite's client pings the server itself (on reconnect); those are not the app's.
    const first = initiatorOf(stack, (u) => this.#opts.isDesigner(u));
    const vite = !first && /\/@vite\/client/.test(stack ?? "");
    return { at: first, vite };
  }

  #begin(kind: NetworkEntry["kind"], method: string, url: string, initiator: string | null): NetworkEntry {
    const entry: NetworkEntry = { id: this.#next++, kind, method, url, status: null, statusText: "", start: this.#now(), duration: null, size: null, contentType: null, initiator, error: null, conditioned: null };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
      this.dropped++;
    }
    this.#opts.changed();
    return entry;
  }

  #end(entry: NetworkEntry, status: number, statusText: string, size: number | null, contentType: string | null): void {
    entry.status = status;
    entry.statusText = statusText;
    entry.size = size;
    entry.contentType = contentType;
    entry.duration = this.#now() - entry.start;
    this.#opts.changed();
  }

  #fail(entry: NetworkEntry, error: string): void {
    entry.status = 0;
    entry.error = error;
    entry.duration = this.#now() - entry.start;
    this.#opts.changed();
  }

  #keep(method: string, asked: string, status: number, contentType: string | null, text: string | null, size: number | null): void {
    if (!this.#recording) return;
    const cut = asked.search(/[?#]/);
    const record: RecordedResponse = { id: this.#next++, method, url: cut < 0 ? asked : asked.slice(0, cut), query: cut < 0 ? "" : asked.slice(cut), status, contentType: contentType ?? "", body: null, at: Date.now() };
    if (!isText(contentType)) record.skipped = `binary (${contentType})`;
    else if ((size ?? 0) > MAX_BODY || (text?.length ?? 0) > MAX_BODY) record.skipped = "over 512 KB";
    else if (text) {
      try {
        record.body = JSON.parse(text);
      } catch {
        record.body = text;
      }
    }
    this.#records.push(record);
    if (this.#records.length > MAX_RECORDS) this.#records.shift();
    this.#saveRecords();
    // The body is read after the response settles, so the panel's count is told separately.
    this.#opts.changed();
  }

  // --- conditions ----------------------------------------------------------------------------------------------------

  /** `navigator.onLine` follows the condition (when the whole frame is offline over CDP the browser does it itself). */
  #syncOnline(announce: boolean): void {
    const nav = this.#target?.navigator;
    if (!nav) return;
    const offline = this.condition.mode === "offline" && !this.condition.frame && this.condition.match === "";
    if (offline === this.#offline) return;
    this.#offline = offline;
    try {
      if (offline) Object.defineProperty(nav, "onLine", { configurable: true, get: () => false });
      else delete (nav as { onLine?: boolean }).onLine;
    } catch {
      return;
    }
    if (announce) this.#target?.dispatchEvent?.(new Event(offline ? "offline" : "online"));
  }

  #delay(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
    return new Promise((ok, fail) => {
      if (signal?.aborted) return fail(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        ok();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        fail(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  // --- fetch -----------------------------------------------------------------------------------------------------------

  #wrapFetch(original: typeof fetch, target: CaptureTarget): typeof fetch {
    const capture = this;
    return function designerFetch(this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const isRequest = typeof Request !== "undefined" && input instanceof Request;
      const asked = typeof input === "string" ? input : input instanceof URL ? input.href : isRequest ? input.url : String(input);
      const url = capture.#absolute(asked);
      const headers = new Headers(init?.headers ?? (isRequest ? input.headers : undefined));
      if (capture.#skip(url) || headers.get("accept") === "text/x-vite-ping") return original.call(this ?? target, input, init);
      const { at, vite } = capture.#initiator();
      if (vite) return original.call(this ?? target, input, init);
      const method = (init?.method ?? (isRequest ? input.method : "GET")).toUpperCase();
      return capture.#fetch(original, this ?? target, input, init, method, asked, url, at);
    } as typeof fetch;
  }

  async #fetch(original: typeof fetch, self: unknown, input: RequestInfo | URL, init: RequestInit | undefined, method: string, asked: string, url: string, initiator: string | null): Promise<Response> {
    const entry = this.#begin("fetch", method, url, initiator);
    const c = this.condition;
    const signal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : null);
    if (conditionApplies(c, url)) {
      try {
        if (c.mode === "slow") {
          entry.conditioned = `slowed +${c.delay} ms`;
          await this.#delay(c.delay, signal);
        } else if (c.mode === "offline") {
          entry.conditioned = "offline";
          await this.#delay(0, signal);
          this.#fail(entry, "Offline (Designer network condition)");
          throw new TypeError("Failed to fetch");
        } else if (c.mode === "error") {
          entry.conditioned = `error ${c.status}`;
          await this.#delay(0, signal);
          const res = new Response(null, { status: c.status, statusText: SIMULATED });
          this.#end(entry, c.status, SIMULATED, 0, null);
          return res;
        }
      } catch (e) {
        if (entry.status === null) this.#fail(entry, e instanceof Error ? e.message : String(e));
        throw e;
      }
    }
    let res: Response;
    try {
      res = await original.call(self, input, init);
    } catch (e) {
      this.#fail(entry, e instanceof Error ? e.message : String(e));
      throw e;
    }
    if (this.#recording && bufferable(res)) return this.#buffered(entry, res, method, asked);
    void this.#settle(entry, res, method, asked);
    return res;
  }

  /**
   * While recording, the body is read in full before the app gets the response (a copy of it): reading a clone alongside
   * the app is cut short when the app's client aborts the request once it has read it (the core Http client does).
   */
  async #buffered(entry: NetworkEntry, res: Response, method: string, asked: string): Promise<Response> {
    const type = typeOf(res.headers);
    let bytes: ArrayBuffer;
    try {
      bytes = await res.arrayBuffer();
    } catch (e) {
      this.#fail(entry, e instanceof Error ? e.message : String(e));
      throw e;
    }
    this.#end(entry, res.status, res.statusText, bytes.byteLength, type);
    this.#keep(method, asked, res.status, type, isText(type) && bytes.byteLength <= MAX_BODY ? new TextDecoder().decode(bytes) : null, bytes.byteLength);
    const copy = new Response(bytes, { status: res.status, statusText: res.statusText, headers: res.headers });
    for (const k of ["url", "redirected", "type"] as const) Object.defineProperty(copy, k, { configurable: true, value: res[k] });
    return copy;
  }

  /** Reads a copy of the body for its size; the app reads the original. Streams are not waited for. */
  async #settle(entry: NetworkEntry, res: Response, method: string, asked: string): Promise<void> {
    const type = typeOf(res.headers);
    const length = Number(res.headers.get("content-length") ?? NaN);
    if (type === "text/event-stream" || !res.body) {
      this.#end(entry, res.status, res.statusText, Number.isFinite(length) ? length : res.body ? null : 0, type);
      return;
    }
    try {
      const bytes = await res.clone().arrayBuffer();
      this.#end(entry, res.status, res.statusText, bytes.byteLength, type);
    } catch (e) {
      this.#end(entry, res.status, res.statusText, Number.isFinite(length) ? length : null, type);
      // The app's client aborting the request after reading it (the core Http client does) is not a failure.
      if (!(e instanceof DOMException && e.name === "AbortError")) entry.error = `body: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // --- XMLHttpRequest --------------------------------------------------------------------------------------------------

  #wrapXhr(Xhr: typeof XMLHttpRequest): void {
    const capture = this;
    const proto = Xhr.prototype;
    const open = proto.open;
    const send = proto.send;
    const meta = new WeakMap<XMLHttpRequest, { method: string; asked: string }>();
    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      meta.set(this, { method: String(method).toUpperCase(), asked: String(url) });
      return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof proto.open;
    proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const m = meta.get(this);
      const url = m ? capture.#absolute(m.asked) : "";
      const at = m && !capture.#skip(url) ? capture.#initiator() : null;
      if (!m || !at || at.vite) return send.call(this, body);
      const entry = capture.#begin("xhr", m.method, url, at.at);
      const xhr = this;
      let simulated = false;
      xhr.addEventListener("loadend", () => {
        if (simulated) return;
        if (xhr.status === 0) return capture.#fail(entry, "Network error or aborted");
        const type = (xhr.getResponseHeader("content-type") ?? "").split(";")[0]!.trim().toLowerCase() || null;
        const text = xhr.responseType === "" || xhr.responseType === "text" ? xhr.responseText : null;
        const res = xhr.response as unknown;
        const size = text !== null ? new TextEncoder().encode(text).byteLength : res instanceof ArrayBuffer ? res.byteLength : res instanceof Blob ? res.size : null;
        capture.#end(entry, xhr.status, xhr.statusText, size, type);
        if (capture.#recording) capture.#keep(m.method, m.asked, xhr.status, type, text ?? (xhr.responseType === "json" ? JSON.stringify(res) : null), size);
      });
      const c = capture.condition;
      if (!conditionApplies(c, url)) return send.call(this, body);
      if (c.mode === "slow") {
        entry.conditioned = `slowed +${c.delay} ms`;
        setTimeout(() => xhr.readyState === 1 && send.call(xhr, body), c.delay);
        return;
      }
      simulated = true;
      const define = (props: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(props)) Object.defineProperty(xhr, k, { configurable: true, value: v });
      };
      setTimeout(() => {
        if (c.mode === "offline") {
          entry.conditioned = "offline";
          define({ readyState: 4, status: 0 });
          capture.#fail(entry, "Offline (Designer network condition)");
          for (const t of ["readystatechange", "error", "loadend"]) xhr.dispatchEvent(t === "readystatechange" ? new Event(t) : new ProgressEvent(t));
        } else {
          entry.conditioned = `error ${c.status}`;
          define({ readyState: 4, status: c.status, statusText: SIMULATED, responseText: "", response: xhr.responseType === "json" ? null : "", getResponseHeader: () => null, getAllResponseHeaders: () => "" });
          capture.#end(entry, c.status, SIMULATED, 0, null);
          for (const t of ["readystatechange", "load", "loadend"]) xhr.dispatchEvent(t === "readystatechange" ? new Event(t) : new ProgressEvent(t));
        }
      }, 0);
    };
  }

  // --- the Scenario's mocks ------------------------------------------------------------------------------------------

  #mocked(req: { method: string; url: string; params?: Record<string, unknown> }, reply: MockReply, index: number): MockReply {
    let asked = req.url;
    if (req.params && Object.keys(req.params).length) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(req.params)) for (const x of Array.isArray(v) ? v : [v]) q.append(k, String(x));
      asked += (asked.includes("?") ? "&" : "?") + q.toString();
    }
    const url = this.#absolute(asked);
    const entry = this.#begin("mock", req.method.toUpperCase(), url, this.#initiator().at);
    entry.mock = index;
    const c = this.condition;
    let r = reply;
    if (conditionApplies(c, url)) {
      if (c.mode === "slow") r = { ...reply, delay: (reply.delay ?? 0) + c.delay };
      else if (c.mode === "offline") r = { error: "network" };
      else if (c.mode === "error") r = { status: c.status, statusText: SIMULATED, body: null };
      entry.conditioned = c.mode === "slow" ? `slowed +${c.delay} ms` : c.mode === "offline" ? "offline" : `error ${c.status}`;
    }
    const finish = () => {
      if (r.error) return this.#fail(entry, `Mocked ${r.error} error`);
      let size = 0;
      try {
        size = r.body === undefined || r.body === null ? 0 : new TextEncoder().encode(typeof r.body === "string" ? r.body : JSON.stringify(r.body)).byteLength;
      } catch {
        size = 0;
      }
      this.#end(entry, r.status ?? 200, r.statusText ?? "", size, r.body === undefined || r.body === null ? null : typeof r.body === "string" ? "text/plain" : "application/json");
    };
    if (r.delay) setTimeout(finish, r.delay);
    else finish();
    return r;
  }

  #unmatched(e: { method: string; url: string; outcome: string }): void {
    const entry = this.#begin("mock", e.method.toUpperCase(), this.#absolute(e.url), this.#initiator().at);
    entry.mock = -1;
    const status = Number(e.outcome);
    if (Number.isFinite(status)) this.#end(entry, status, "No mock matched", 0, null);
    else this.#fail(entry, `No mock matched (${e.outcome})`);
  }
}

/** The agent's side: installs the capture on the page and returns the handlers of the network methods. */
export function startNetwork(win: Window & typeof globalThis, isDesigner: (url: string) => boolean, activity: () => void) {
  let storage: Storage | null = null;
  try {
    storage = win.sessionStorage;
  } catch {
    // storage blocked (sandboxed): conditions and recordings last until the frame reloads
  }
  const net = new NetworkCapture({ storage, isDesigner, changed: activity });
  net.install(win);
  return {
    capture: net,
    handlers: {
      network: (p: { clear?: boolean } | undefined) => (p?.clear && net.clear(), net.snapshot()),
      setNetworkCondition: (c: NetworkCondition) => net.setCondition(c),
      record: (p: { on?: boolean; clear?: boolean } | undefined) => net.record(p ?? {}),
      recording: () => net.recorded(),
    },
  };
}

/** Calls `fn` at most once per `ms`, trailing (the last change is always reported). */
export function throttled(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    timer ??= setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}
