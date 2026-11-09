// Stand-ins for the WinterCG host globals (spec section 8) that Gable's
// suites touch. The engine provides only the ECMAScript library; the Host
// runtime is where these will live for real. Until it exists, the harness
// installs these small JavaScript versions, and only where a global is
// missing, so in Node the real implementations stay in place.
//
// The harness supplies the primitives that need the host: setTimeout,
// clearTimeout, setInterval, clearInterval and performance.now (Rust, see
// src/host.rs). Everything here is plain JavaScript on top of them.

const g = globalThis;
const define = (name, value) => {
  if (!(name in g)) Object.defineProperty(g, name, { value, writable: true, configurable: true, enumerable: false });
};

define("self", g);

define("queueMicrotask", (cb) => {
  if (typeof cb !== "function") throw new TypeError("queueMicrotask: callback is not a function");
  Promise.resolve().then(() => cb());
});

/* ---------------- structuredClone ---------------- */

define("structuredClone", (value) => {
  const seen = new Map();
  const clone = (v) => {
    if (v === null || typeof v !== "object") {
      if (typeof v === "function" || typeof v === "symbol") throw new DOMExceptionLike(`${String(v)} could not be cloned.`, "DataCloneError");
      return v;
    }
    if (seen.has(v)) return seen.get(v);
    let out;
    if (Array.isArray(v)) {
      out = new Array(v.length);
      seen.set(v, out);
      for (let i = 0; i < v.length; i++) if (i in v) out[i] = clone(v[i]);
      return out;
    }
    if (v instanceof Date) return new Date(v.getTime());
    if (v instanceof RegExp) return new RegExp(v.source, v.flags);
    if (v instanceof Map) {
      out = new Map();
      seen.set(v, out);
      for (const [k, x] of v) out.set(clone(k), clone(x));
      return out;
    }
    if (v instanceof Set) {
      out = new Set();
      seen.set(v, out);
      for (const x of v) out.add(clone(x));
      return out;
    }
    if (v instanceof ArrayBuffer) return v.slice(0);
    if (ArrayBuffer.isView(v)) return new v.constructor(v);
    if (v instanceof Error) {
      const e = new (g[v.name] || Error)(v.message);
      if ("cause" in v) e.cause = clone(v.cause);
      return e;
    }
    out = {};
    seen.set(v, out);
    for (const k of Object.keys(v)) out[k] = clone(v[k]);
    return out;
  };
  return clone(value);
});

class DOMExceptionLike extends Error {
  constructor(message = "", name = "Error") {
    super(message);
    this.name = name;
  }
}
define("DOMException", DOMExceptionLike);

/* ---------------- Event, EventTarget ---------------- */

class EventShim {
  constructor(type, init = {}) {
    this.type = String(type);
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
    this.composed = !!init.composed;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this.timeStamp = typeof performance !== "undefined" ? performance.now() : 0;
    this._stop = false;
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() {}
  stopImmediatePropagation() { this._stop = true; }
}
define("Event", EventShim);

class CustomEventShim extends g.Event {
  constructor(type, init = {}) {
    super(type, init);
    this.detail = init.detail === undefined ? null : init.detail;
  }
}
define("CustomEvent", CustomEventShim);

class EventTargetShim {
  #listeners = new Map();
  addEventListener(type, listener, options) {
    if (!listener) return;
    const once = typeof options === "object" && options !== null && !!options.once;
    const signal = typeof options === "object" && options !== null ? options.signal : undefined;
    if (signal && signal.aborted) return;
    let list = this.#listeners.get(type);
    if (!list) this.#listeners.set(type, (list = []));
    if (list.some((l) => l.listener === listener)) return;
    const entry = { listener, once };
    list.push(entry);
    if (signal) signal.addEventListener("abort", () => this.removeEventListener(type, listener));
  }
  removeEventListener(type, listener) {
    const list = this.#listeners.get(type);
    if (!list) return;
    const i = list.findIndex((l) => l.listener === listener);
    if (i >= 0) list.splice(i, 1);
  }
  dispatchEvent(event) {
    const list = this.#listeners.get(event.type);
    try { event.target = this; event.currentTarget = this; } catch {}
    if (list) {
      for (const entry of [...list]) {
        if (entry.once) this.removeEventListener(event.type, entry.listener);
        const l = entry.listener;
        if (typeof l === "function") l.call(this, event);
        else if (l && typeof l.handleEvent === "function") l.handleEvent(event);
        if (event._stop) break;
      }
    }
    const handler = this["on" + event.type];
    if (typeof handler === "function") handler.call(this, event);
    return !event.defaultPrevented;
  }
}
define("EventTarget", EventTargetShim);

/* ---------------- AbortController, AbortSignal ---------------- */

class AbortSignalShim extends g.EventTarget {
  constructor() {
    super();
    this.aborted = false;
    this.reason = undefined;
    this.onabort = null;
  }
  throwIfAborted() { if (this.aborted) throw this.reason; }
  static abort(reason) {
    const c = new g.AbortController();
    c.abort(reason);
    return c.signal;
  }
  static timeout(ms) {
    const c = new g.AbortController();
    setTimeout(() => c.abort(new DOMExceptionLike("The operation timed out.", "TimeoutError")), ms);
    return c.signal;
  }
  static any(signals) {
    const c = new g.AbortController();
    for (const s of signals) {
      if (s.aborted) { c.abort(s.reason); break; }
      s.addEventListener("abort", () => c.abort(s.reason), { once: true });
    }
    return c.signal;
  }
}
define("AbortSignal", AbortSignalShim);

class AbortControllerShim {
  constructor() { this.signal = new g.AbortSignal(); }
  abort(reason) {
    const s = this.signal;
    if (s.aborted) return;
    s.aborted = true;
    s.reason = reason === undefined ? new DOMExceptionLike("This operation was aborted", "AbortError") : reason;
    s.dispatchEvent(new g.Event("abort"));
  }
}
define("AbortController", AbortControllerShim);

/* ---------------- TextEncoder, TextDecoder ---------------- */

class TextEncoderShim {
  get encoding() { return "utf-8"; }
  encode(input = "") {
    const s = String(input);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        const d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
        else c = 0xfffd;
      } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
}
define("TextEncoder", TextEncoderShim);

class TextDecoderShim {
  get encoding() { return "utf-8"; }
  decode(input) {
    if (input === undefined) return "";
    const b = input instanceof Uint8Array ? input : new Uint8Array(input.buffer ? input.buffer : input);
    let s = "";
    for (let i = 0; i < b.length; ) {
      const c = b[i++];
      let cp;
      if (c < 0x80) cp = c;
      else if (c >> 5 === 6) cp = ((c & 31) << 6) | (b[i++] & 63);
      else if (c >> 4 === 14) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
      else cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
      s += String.fromCodePoint(cp);
    }
    return s;
  }
}
define("TextDecoder", TextDecoderShim);

/* ---------------- URLSearchParams, URL ---------------- */

const formEncode = (s) => encodeURIComponent(s).replace(/%20/g, "+").replace(/[!'()~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const formDecode = (s) => {
  try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; }
};

class URLSearchParamsShim {
  #list = [];
  #url = null;
  constructor(init) {
    if (init === undefined || init === null) return;
    if (typeof init === "string") this.#parse(init);
    else if (typeof init === "object" && typeof init[Symbol.iterator] === "function") for (const [k, v] of init) this.#list.push([String(k), String(v)]);
    else if (typeof init === "object") for (const k of Object.keys(init)) this.#list.push([k, String(init[k])]);
    else this.#parse(String(init));
  }
  #parse(s) {
    this.#list = [];
    if (s.startsWith("?")) s = s.slice(1);
    for (const part of s.split("&")) {
      if (!part) continue;
      const i = part.indexOf("=");
      this.#list.push(i < 0 ? [formDecode(part), ""] : [formDecode(part.slice(0, i)), formDecode(part.slice(i + 1))]);
    }
  }
  _attach(url, search) { this.#url = url; this.#parse(search); }
  #update() { if (this.#url) this.#url._setSearchFromParams(this.toString()); }
  get size() { return this.#list.length; }
  append(k, v) { this.#list.push([String(k), String(v)]); this.#update(); }
  delete(k) { this.#list = this.#list.filter(([x]) => x !== String(k)); this.#update(); }
  get(k) { const e = this.#list.find(([x]) => x === String(k)); return e ? e[1] : null; }
  getAll(k) { return this.#list.filter(([x]) => x === String(k)).map(([, v]) => v); }
  has(k) { return this.#list.some(([x]) => x === String(k)); }
  set(k, v) {
    k = String(k);
    const i = this.#list.findIndex(([x]) => x === k);
    if (i < 0) this.#list.push([k, String(v)]);
    else { this.#list[i][1] = String(v); this.#list = this.#list.filter(([x], j) => x !== k || j === i); }
    this.#update();
  }
  sort() { this.#list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); this.#update(); }
  forEach(cb, thisArg) { for (const [k, v] of this.#list) cb.call(thisArg, v, k, this); }
  keys() { return this.#list.map(([k]) => k)[Symbol.iterator](); }
  values() { return this.#list.map(([, v]) => v)[Symbol.iterator](); }
  entries() { return this.#list.map(([k, v]) => [k, v])[Symbol.iterator](); }
  [Symbol.iterator]() { return this.entries(); }
  toString() { return this.#list.map(([k, v]) => `${formEncode(k)}=${formEncode(v)}`).join("&"); }
}
define("URLSearchParams", URLSearchParamsShim);

const SPECIAL = { "http:": "80", "https:": "443", "ws:": "80", "wss:": "443", "ftp:": "21", "file:": "" };

function normalizePath(path, special) {
  const segs = path.split("/");
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const last = i === segs.length - 1;
    if (s === "." || s.toLowerCase() === "%2e") { if (last) out.push(""); continue; }
    if (s === ".." || /^(\.|%2e){2}$/i.test(s)) {
      if (out.length > 1) out.pop();
      if (last) out.push("");
      continue;
    }
    out.push(s);
  }
  let p = out.join("/");
  if (special && !p.startsWith("/")) p = "/" + p;
  return p;
}

const encodePath = (p) => p.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@/%]/g, (c) => encodeURIComponent(c));
const encodeQuery = (q) => q.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@/?%]/g, (c) => encodeURIComponent(c));
const encodeHash = (h) => h.replace(/[ "<>`]/g, (c) => encodeURIComponent(c));

class URLShim {
  #protocol = "";
  #username = "";
  #password = "";
  #hostname = "";
  #port = "";
  #pathname = "";
  #search = "";
  #hash = "";
  #params;
  constructor(input, base) {
    input = String(input).trim();
    const abs = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/.exec(input);
    if (abs) {
      this.#parseAbsolute(abs[1].toLowerCase() + ":", abs[2]);
    } else {
      if (base === undefined) throw new TypeError(`Invalid URL: ${input}`);
      const b = base instanceof URLShim ? base : new URLShim(String(base));
      this.#resolve(input, b);
    }
    this.#params = new g.URLSearchParams();
    this.#params._attach(this, this.#search);
  }
  #parseAbsolute(protocol, rest) {
    this.#protocol = protocol;
    const special = protocol in SPECIAL;
    if (special) rest = rest.replace(/\\/g, "/");
    let hashI = rest.indexOf("#");
    if (hashI >= 0) { this.#hash = rest.slice(hashI); rest = rest.slice(0, hashI); }
    let qI = rest.indexOf("?");
    if (qI >= 0) { this.#search = rest.slice(qI); rest = rest.slice(0, qI); }
    if (this.#search === "?") this.#search = "";
    if (this.#hash === "#") this.#hash = "";
    if (rest.startsWith("//") || special) {
      rest = rest.replace(/^\/*/, "");
      const slash = rest.indexOf("/");
      const authority = slash < 0 ? rest : rest.slice(0, slash);
      const path = slash < 0 ? "" : rest.slice(slash);
      this.#setAuthority(authority);
      if (special && !this.#hostname && protocol !== "file:") throw new TypeError(`Invalid URL: ${protocol}${rest}`);
      this.#pathname = normalizePath(path || (special ? "/" : ""), special);
    } else {
      this.#pathname = rest;
    }
    this.#search = encodeQuery(this.#search);
    this.#hash = encodeHash(this.#hash);
    this.#pathname = encodePath(this.#pathname);
  }
  #setAuthority(a) {
    const at = a.lastIndexOf("@");
    if (at >= 0) {
      const cred = a.slice(0, at);
      a = a.slice(at + 1);
      const c = cred.indexOf(":");
      this.#username = c < 0 ? cred : cred.slice(0, c);
      this.#password = c < 0 ? "" : cred.slice(c + 1);
    }
    const m = /^(\[[^\]]*\]|[^:]*)(?::(\d*))?$/.exec(a);
    if (!m) throw new TypeError(`Invalid URL host: ${a}`);
    this.#hostname = m[1].toLowerCase();
    this.#port = m[2] && m[2] !== SPECIAL[this.#protocol] ? String(Number(m[2])) : "";
  }
  #resolve(input, b) {
    this.#protocol = b.protocol;
    const special = this.#protocol in SPECIAL;
    if (special) input = input.replace(/\\/g, "/");
    if (input.startsWith("//")) {
      this.#parseAbsolute(this.#protocol, input);
      return;
    }
    this.#username = b.username;
    this.#password = b.password;
    this.#hostname = b.hostname;
    this.#port = b.port;
    let hashI = input.indexOf("#");
    let hash = "";
    if (hashI >= 0) { hash = input.slice(hashI); input = input.slice(0, hashI); }
    let qI = input.indexOf("?");
    let search = null;
    if (qI >= 0) { search = input.slice(qI); input = input.slice(0, qI); }
    if (input === "") {
      this.#pathname = b.pathname;
      this.#search = search === null ? b.search : search === "?" ? "" : encodeQuery(search);
    } else {
      let path;
      if (input.startsWith("/")) path = input;
      else {
        const basePath = b.pathname;
        path = basePath.slice(0, basePath.lastIndexOf("/") + 1) + input;
      }
      this.#pathname = encodePath(normalizePath(path, special));
      this.#search = search === null || search === "?" ? "" : encodeQuery(search);
    }
    this.#hash = hash === "#" ? "" : encodeHash(hash);
  }
  _setSearchFromParams(s) { this.#search = s ? "?" + s : ""; }
  get protocol() { return this.#protocol; }
  set protocol(v) { v = String(v).replace(/:.*$/, ""); this.#protocol = v.toLowerCase() + ":"; }
  get username() { return this.#username; }
  set username(v) { this.#username = String(v); }
  get password() { return this.#password; }
  set password(v) { this.#password = String(v); }
  get hostname() { return this.#hostname; }
  set hostname(v) { this.#hostname = String(v).toLowerCase(); }
  get port() { return this.#port; }
  set port(v) { v = String(v); this.#port = v === SPECIAL[this.#protocol] ? "" : v; }
  get host() { return this.#hostname + (this.#port ? ":" + this.#port : ""); }
  set host(v) { this.#setAuthority(String(v)); }
  get origin() { return this.#protocol in SPECIAL && this.#protocol !== "file:" ? `${this.#protocol}//${this.host}` : "null"; }
  get pathname() { return this.#pathname; }
  set pathname(v) { v = String(v); this.#pathname = encodePath(normalizePath(this.#protocol in SPECIAL && !v.startsWith("/") ? "/" + v : v, this.#protocol in SPECIAL)); }
  get search() { return this.#search; }
  set search(v) {
    v = String(v);
    this.#search = v === "" || v === "?" ? "" : encodeQuery(v.startsWith("?") ? v : "?" + v);
    this.#params._attach(this, this.#search);
  }
  get searchParams() { return this.#params; }
  get hash() { return this.#hash; }
  set hash(v) { v = String(v); this.#hash = v === "" || v === "#" ? "" : encodeHash(v.startsWith("#") ? v : "#" + v); }
  get href() {
    const auth = this.#username ? this.#username + (this.#password ? ":" + this.#password : "") + "@" : "";
    const hasAuthority = this.#protocol in SPECIAL || this.#hostname;
    return this.#protocol + (hasAuthority ? "//" + auth + this.host : "") + this.#pathname + this.#search + this.#hash;
  }
  set href(v) {
    const u = new URLShim(v);
    this.#protocol = u.protocol; this.#username = u.username; this.#password = u.password;
    this.#hostname = u.hostname; this.#port = u.port; this.#pathname = u.pathname;
    this.#search = u.search; this.#hash = u.hash;
    this.#params._attach(this, this.#search);
  }
  toString() { return this.href; }
  toJSON() { return this.href; }
  static canParse(url, base) { try { new URLShim(url, base); return true; } catch { return false; } }
  static parse(url, base) { try { return new URLShim(url, base); } catch { return null; } }
}
define("URL", URLShim);

/* ---------------- Headers, Response, Request ---------------- */

class HeadersShim {
  #map = new Map();
  constructor(init) {
    if (!init) return;
    if (init instanceof HeadersShim || (typeof init === "object" && typeof init.forEach === "function" && !Array.isArray(init))) init.forEach((v, k) => this.append(k, v));
    else if (Array.isArray(init) || typeof init[Symbol.iterator] === "function") for (const [k, v] of init) this.append(k, v);
    else for (const k of Object.keys(init)) this.append(k, init[k]);
  }
  append(k, v) { k = String(k).toLowerCase(); const prev = this.#map.get(k); this.#map.set(k, prev === undefined ? String(v) : `${prev}, ${v}`); }
  set(k, v) { this.#map.set(String(k).toLowerCase(), String(v)); }
  get(k) { const v = this.#map.get(String(k).toLowerCase()); return v === undefined ? null : v; }
  has(k) { return this.#map.has(String(k).toLowerCase()); }
  delete(k) { this.#map.delete(String(k).toLowerCase()); }
  forEach(cb, thisArg) { for (const [k, v] of [...this.#map].sort()) cb.call(thisArg, v, k, this); }
  *entries() { yield* [...this.#map].sort(); }
  *keys() { for (const [k] of this.entries()) yield k; }
  *values() { for (const [, v] of this.entries()) yield v; }
  [Symbol.iterator]() { return this.entries(); }
}
define("Headers", HeadersShim);

const bodyText = (body) => {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return new g.TextDecoder().decode(body);
  if (body instanceof g.URLSearchParams) return body.toString();
  return String(body);
};

class BodyShim {
  #text;
  #used = false;
  constructor(body) { this.#text = body === undefined || body === null ? null : bodyText(body); }
  get body() { return this.#text; }
  get bodyUsed() { return this.#used; }
  #take() {
    if (this.#used) return Promise.reject(new TypeError("Body is unusable: Body has already been read"));
    this.#used = true;
    return Promise.resolve(this.#text === null ? "" : this.#text);
  }
  text() { return this.#take(); }
  json() { return this.#take().then((t) => JSON.parse(t)); }
  arrayBuffer() { return this.#take().then((t) => new g.TextEncoder().encode(t).buffer); }
}

class ResponseShim extends BodyShim {
  constructor(body, init = {}) {
    super(body);
    this.status = init.status === undefined ? 200 : init.status;
    this.statusText = init.statusText === undefined ? "" : String(init.statusText);
    this.headers = new g.Headers(init.headers);
    if (typeof body === "string" && !this.headers.has("content-type")) this.headers.set("content-type", "text/plain;charset=UTF-8");
    this.type = "default";
    this.url = "";
    this.redirected = false;
  }
  get ok() { return this.status >= 200 && this.status < 300; }
  clone() { return new ResponseShim(this.body, { status: this.status, statusText: this.statusText, headers: this.headers }); }
  static json(data, init = {}) {
    const headers = new g.Headers(init.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new ResponseShim(JSON.stringify(data), { ...init, headers });
  }
  static error() { const r = new ResponseShim(null, { status: 0 }); r.type = "error"; return r; }
}
define("Response", ResponseShim);

class RequestShim extends BodyShim {
  constructor(input, init = {}) {
    super(init.body);
    this.url = input instanceof RequestShim ? input.url : String(input);
    this.method = (init.method || (input instanceof RequestShim ? input.method : "GET")).toUpperCase();
    this.headers = new g.Headers(init.headers || (input instanceof RequestShim ? input.headers : undefined));
    this.signal = init.signal || (input instanceof RequestShim ? input.signal : new g.AbortController().signal);
  }
}
define("Request", RequestShim);

define("fetch", () => Promise.reject(new TypeError("fetch is not available in the engine test harness")));

/* ---------------- beyond spec section 8 ---------------- */

// @zag-js/store (under @gable/ui-primitives) tests `x instanceof File` and
// `x instanceof Blob` on every proxied value, so it throws a ReferenceError
// on a host without them. Section 8 does not list them: the switch-over
// report flags this for the host runtime. Minimal, data-holding versions.
class BlobShim {
  #text;
  constructor(parts = [], options = {}) {
    this.#text = parts.map((p) => (p instanceof BlobShim ? p.#text : bodyText(p))).join("");
    this.type = options.type ? String(options.type).toLowerCase() : "";
  }
  get size() { return new g.TextEncoder().encode(this.#text).length; }
  text() { return Promise.resolve(this.#text); }
  arrayBuffer() { return Promise.resolve(new g.TextEncoder().encode(this.#text).buffer); }
  slice(start, end, type) { return new BlobShim([this.#text.slice(start, end)], { type }); }
}
define("Blob", BlobShim);

class FileShim extends g.Blob {
  constructor(parts, name, options = {}) {
    super(parts, options);
    this.name = String(name);
    this.lastModified = options.lastModified === undefined ? Date.now() : Number(options.lastModified);
  }
}
define("File", FileShim);

/* ---------------- misc ---------------- */

define("navigator", { userAgent: "Gable engine harness", language: "en-US", languages: ["en-US"], onLine: true, hardwareConcurrency: 1 });
define("crypto", {
  getRandomValues(arr) {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  },
  randomUUID() {
    const h = "0123456789abcdef";
    let s = "";
    for (let i = 0; i < 36; i++) s += i === 8 || i === 13 || i === 18 || i === 23 ? "-" : i === 14 ? "4" : h[Math.floor(Math.random() * 16)];
    return s;
  },
});
