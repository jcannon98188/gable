// The Storage panel's shared types (TASK-56.21): the selected frame's localStorage, sessionStorage and cookies, read and
// edited in the page by the Preview agent (src/agent/storage.ts), and cookies over CDP where the backend has it (HttpOnly
// cookies and cookie attributes are invisible to the page). Each preview frame has its own origin, so its own storage.

export type StorageArea = "local" | "session";

export interface StorageItem {
  key: string;
  value: string;
}

/** A cookie as the page sees it in `document.cookie`: a name and a value, no attributes, no HttpOnly cookies. */
export interface PageCookie {
  name: string;
  value: string;
}

export interface StorageSnapshot {
  /** The frame's URL and origin (the cookies' URL over CDP). */
  url: string;
  origin: string;
  /** Null when the page cannot read that storage (blocked, sandboxed); see `errors`. */
  local: StorageItem[] | null;
  session: StorageItem[] | null;
  cookies: PageCookie[];
  errors: { local?: string; session?: string; cookies?: string };
  /** The Designer's own keys in the frame's storage, left out of the lists (and never cleared). */
  hidden: number;
}

export type SameSite = "Strict" | "Lax" | "None";

/** A cookie with its attributes, as CDP's `Network.getCookies` lists it. */
export interface FullCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** Seconds since the epoch; -1 is a session cookie. */
  expires: number;
  size: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite?: SameSite;
}

/** A cookie to write. `maxAge` in seconds (null or absent: a session cookie). */
export interface CookieWrite {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  maxAge?: number | null;
  sameSite?: SameSite;
  secure?: boolean;
  /** Only over CDP: a page cannot write an HttpOnly cookie. */
  httpOnly?: boolean;
}

export interface CookieDelete {
  name: string;
  path?: string;
  domain?: string;
}

export interface StorageMethods {
  /** The frame's storage and the cookies `document.cookie` shows. */
  storage: { params: void; result: StorageSnapshot };
  setStorageItem: { params: { area: StorageArea; key: string; value: string }; result: StorageSnapshot };
  removeStorageItem: { params: { area: StorageArea; key: string }; result: StorageSnapshot };
  /** Removes every item of the area but the Designer's own. */
  clearStorage: { params: { area: StorageArea }; result: StorageSnapshot };
  /** Writes a cookie through `document.cookie` (no HttpOnly). */
  setCookie: { params: CookieWrite; result: StorageSnapshot };
  /** Expires a cookie through `document.cookie`, on its path (or every path of the page's URL when not given). */
  deleteCookie: { params: CookieDelete; result: StorageSnapshot };
}

/** Why cookies are only partly visible and writable without CDP. */
export const COOKIES_NEED_CDP =
  "HttpOnly cookies and cookie attributes (domain, path, expiry, flags) are invisible to the page: listing and editing them goes through CDP, which only the Windows desktop app (or a browser started with a debugging port) has. The cookies the page can see are listed and editable.";

/** The Designer's own keys in a frame's storage (its session, the network condition and recording). */
export function isDesignerKey(key: string): boolean {
  return key.startsWith("__gable_designer") || key.startsWith("gable-designer");
}

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const SAME_SITE = new Set<string>(["Strict", "Lax", "None"]);

/** Null when `c` can be written as it is, else why not. The name is an HTTP token; the value has no `;`, `,` or control characters. */
export function cookieProblem(c: Partial<CookieWrite> | null | undefined): string | null {
  if (!c || typeof c.name !== "string" || !c.name) return "A cookie needs a name.";
  if (!TOKEN.test(c.name)) return `"${c.name}" is not a valid cookie name (letters, digits and !#$%&'*+-.^_\`|~ only).`;
  if (typeof c.value !== "string") return "A cookie needs a value (it may be empty).";
  // eslint-disable-next-line no-control-regex
  if (/[;,\s"\\\x00-\x1f\x7f]/.test(c.value)) return "A cookie value cannot hold spaces, quotes, commas, semicolons, backslashes or control characters (encode it, e.g. with encodeURIComponent).";
  if (c.path !== undefined && (typeof c.path !== "string" || !c.path.startsWith("/") || /[;\s]/.test(c.path))) return "A cookie path starts with / and has no spaces or semicolons.";
  if (c.domain !== undefined && (typeof c.domain !== "string" || !/^\.?[A-Za-z0-9.-]+$/.test(c.domain))) return "That is not a valid cookie domain.";
  if (c.maxAge !== undefined && c.maxAge !== null && !(typeof c.maxAge === "number" && Number.isFinite(c.maxAge))) return "maxAge is a number of seconds.";
  if (c.sameSite !== undefined && !SAME_SITE.has(c.sameSite)) return "sameSite is Strict, Lax or None.";
  if (c.sameSite === "None" && c.secure !== true) return "A SameSite=None cookie must be Secure.";
  return null;
}

/** The `document.cookie` assignment that writes `c` (checked with `cookieProblem` first). */
export function cookieString(c: CookieWrite): string {
  let s = `${c.name}=${c.value}; path=${c.path ?? "/"}`;
  if (c.domain) s += `; domain=${c.domain}`;
  if (typeof c.maxAge === "number") s += `; max-age=${Math.round(c.maxAge)}`;
  if (c.sameSite) s += `; samesite=${c.sameSite}`;
  if (c.secure) s += "; secure";
  return s;
}

/** `document.cookie` as name/value pairs, in the order the browser lists them. */
export function parseDocumentCookie(text: string): PageCookie[] {
  const out: PageCookie[] = [];
  for (const part of text.split(";")) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    // A cookie set as just "value" has an empty name.
    out.push(eq < 0 ? { name: "", value: p } : { name: p.slice(0, eq), value: p.slice(eq + 1) });
  }
  return out;
}

/** The paths a cookie of the page at `pathname` can be on: `/`, `/a`, `/a/`, `/a/b`, … (to delete it without knowing which). */
export function cookiePaths(pathname: string): string[] {
  const paths = new Set<string>(["/"]);
  const parts = pathname.split("/").filter(Boolean);
  let at = "";
  for (const p of parts) {
    at += "/" + p;
    paths.add(at);
    paths.add(at + "/");
  }
  return [...paths];
}

/**
 * The site of an origin, as SameSite rules compare them: the scheme and the registrable domain. Without the public suffix
 * list this is the last two labels of a name, `localhost` for it and its subdomains, and an IP address as it is.
 */
export function siteOf(origin: string): string | null {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  const host = u.hostname;
  const ip = /^\d+(\.\d+){3}$/.test(host) || host.startsWith("[");
  const domain = ip ? host : host === "localhost" || host.endsWith(".localhost") ? "localhost" : host.split(".").slice(-2).join(".");
  return `${u.protocol}//${domain}`;
}

/**
 * Why the frame's cookies may not be what the app would get on its own: when the Designer's window is another site than
 * the frame (the browser shell on 127.0.0.1, the frame on localhost), the frame is a third-party iframe, where the browser
 * keeps and sends only `SameSite=None; Secure` cookies (and none at all when it blocks third-party cookies). Null when
 * they are the same site (the desktop app's window on tauri.localhost).
 */
export function thirdPartyNote(shellOrigin: string, frameOrigin: string): string | null {
  const shell = siteOf(shellOrigin);
  const frame = siteOf(frameOrigin);
  if (!shell || !frame || shell === frame) return null;
  return `The frame (${frameOrigin}) is a third-party iframe in the Designer's window (${shellOrigin}): the browser keeps and sends only its SameSite=None; Secure cookies, so cookies set without them (a Lax session cookie, say) are dropped here though they work when the app runs on its own. The desktop app's window is the same site as the frame.`;
}

/** What the shell's Storage panel is asked to do over MCP, on the selected frame or the frame `frame` (an id). */
export type StorageCommand =
  | { action: "get"; frame?: string }
  | { action: "set"; frame?: string; area: StorageArea; key: string; value: string }
  | { action: "remove"; frame?: string; area: StorageArea; key: string }
  | { action: "clear"; frame?: string; area: StorageArea }
  | { action: "setCookie"; frame?: string; cookie: CookieWrite }
  | { action: "deleteCookie"; frame?: string; cookie: CookieDelete };

/** A cookie row: the full cookie over CDP, or what the page sees (`attributes: false`). */
export type CookieRow = (FullCookie & { attributes: true }) | (PageCookie & { attributes: false; size: number });

export interface StorageCommandResult {
  frame: { id: string; name: string };
  snapshot: StorageSnapshot;
  /** The cookies: over CDP with attributes and HttpOnly ones, else the page's view. */
  cookies: CookieRow[];
  cookiesVia: "cdp" | "page";
  note: string | null;
  /** The frame is a third-party iframe in the Designer's window, so only SameSite=None cookies work (see thirdPartyNote). */
  thirdParty: string | null;
}
