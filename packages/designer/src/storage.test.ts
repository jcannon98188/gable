// The Storage panel (TASK-56.21): cookie strings, the agent's reads and writes of a page's storage with its live hooks,
// the panel's rows, the get_storage view, and the Network log's filters.
import { describe, expect, it } from "vitest";
import { StorageAccess, startStorage, type StorageTarget } from "./agent/storage.js";
import { filterEntries, type NetworkEntry } from "./network.js";
import { cookiePaths, cookieProblem, cookieString, isDesignerKey, parseDocumentCookie, siteOf, thirdPartyNote, type CookieRow, type StorageCommandResult } from "./storage.js";
import { storageView } from "./server/mcp/storage-tools.js";
import { cookieMeta, expiresText, storageRows } from "../shell/src/app/storage-panel.js";

/** A Storage like the browser's: the methods on the prototype (so the agent's hooks wrap them), insertion-ordered keys. */
class FakeStorage {
  #m = new Map<string, string>();
  get length() {
    return this.#m.size;
  }
  key(i: number) {
    return [...this.#m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.#m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.#m.set(String(k), String(v));
  }
  removeItem(k: string) {
    this.#m.delete(k);
  }
  clear() {
    this.#m.clear();
  }
}

/** A cookie jar behind `document.cookie` (on the prototype, as in browsers): path-scoped, max-age=0 expires. */
class FakeDocument {
  jar: Array<{ name: string; value: string; path: string }> = [];
  pagePath = "/users/42";
  get cookie(): string {
    return this.jar.filter((c) => this.pagePath.startsWith(c.path.replace(/\/$/, "")) || c.path === "/").map((c) => `${c.name}=${c.value}`).join("; ");
  }
  set cookie(text: string) {
    const [pair, ...attrs] = text.split(";").map((s) => s.trim());
    const eq = pair!.indexOf("=");
    const name = pair!.slice(0, eq);
    const value = pair!.slice(eq + 1);
    let path = "/";
    let expire = false;
    for (const a of attrs) {
      const [k, v] = a.split("=");
      if (k!.toLowerCase() === "path") path = v!;
      if (k!.toLowerCase() === "max-age" && Number(v) <= 0) expire = true;
    }
    this.jar = this.jar.filter((c) => !(c.name === name && c.path === path));
    if (!expire) this.jar.push({ name, value, path });
  }
}

function page() {
  const local = new FakeStorage();
  const session = new FakeStorage();
  const doc = new FakeDocument();
  const listeners: Record<string, Array<() => void>> = {};
  const win = {
    location: { href: "http://f1.localhost:5173/users/42?tab=a" },
    localStorage: local as unknown as Storage,
    sessionStorage: session as unknown as Storage,
    document: doc,
    Storage: FakeStorage as unknown as { prototype: Storage },
    addEventListener: (t: string, l: () => void) => void (listeners[t] ??= []).push(l),
  } satisfies StorageTarget;
  let changes = 0;
  const { access, handlers } = startStorage(win, () => void changes++);
  return { win, local, session, doc, access, handlers, listeners, changes: () => changes };
}

describe("cookies as text", () => {
  it("builds the document.cookie assignment and refuses what a browser would mangle", () => {
    expect(cookieString({ name: "theme", value: "dark" })).toBe("theme=dark; path=/");
    expect(cookieString({ name: "a", value: "1", path: "/app", domain: ".example.com", maxAge: 3600, sameSite: "None", secure: true })).toBe("a=1; path=/app; domain=.example.com; max-age=3600; samesite=None; secure");
    expect(cookieProblem({ name: "ok_name-1", value: "v%20x" })).toBeNull();
    expect(cookieProblem({ name: "", value: "x" })).toMatch(/needs a name/);
    expect(cookieProblem({ name: "a b", value: "x" })).toMatch(/not a valid cookie name/);
    expect(cookieProblem({ name: "a", value: "x;y" })).toMatch(/cannot hold/);
    expect(cookieProblem({ name: "a", value: "x", path: "app" })).toMatch(/starts with \//);
    expect(cookieProblem({ name: "a", value: "x", sameSite: "None" })).toMatch(/must be Secure/);
    expect(cookieProblem({ name: "a", value: "x", sameSite: "Loose" as never })).toMatch(/Strict, Lax or None/);
  });

  it("reads document.cookie and lists the paths a page's cookie can be on", () => {
    expect(parseDocumentCookie("a=1; b=x=y;  c=; lone")).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "x=y" },
      { name: "c", value: "" },
      { name: "", value: "lone" },
    ]);
    expect(parseDocumentCookie("")).toEqual([]);
    expect(cookiePaths("/users/42")).toEqual(["/", "/users", "/users/", "/users/42", "/users/42/"]);
    expect(isDesignerKey("__gable_designer_net")).toBe(true);
    expect(isDesignerKey("gable-designer-session")).toBe(true);
    expect(isDesignerKey("theme")).toBe(false);
  });

  it("tells when the frame is a third-party iframe in the Designer's window", () => {
    expect(siteOf("http://f2.localhost:5173")).toBe("http://localhost");
    expect(siteOf("http://127.0.0.1:4100")).toBe("http://127.0.0.1");
    expect(siteOf("https://app.shop.example.com")).toBe("https://example.com");
    expect(siteOf("not a url")).toBeNull();
    // The desktop app (tauri.localhost) and the frames (localhost, f2.localhost) are one site; the browser shell is not.
    expect(thirdPartyNote("http://tauri.localhost", "http://localhost:5173")).toBeNull();
    expect(thirdPartyNote("http://localhost:4100", "http://f2.localhost:5173")).toBeNull();
    expect(thirdPartyNote("http://127.0.0.1:4100", "http://localhost:5173")).toMatch(/third-party iframe.*SameSite=None; Secure/);
    expect(thirdPartyNote("https://localhost:4100", "http://localhost:5173")).toMatch(/third-party/);
  });
});

describe("the agent's storage access", () => {
  it("lists both storages sorted, leaving the Designer's keys out and counting them", () => {
    const p = page();
    p.local.setItem("zeta", "1");
    p.local.setItem("alpha", '{"a":1}');
    p.session.setItem("__gable_designer_rec", "{}");
    p.session.setItem("gable-designer-session", "x");
    p.session.setItem("draft", "hello");
    p.doc.cookie = "seen=1; path=/";
    const s = p.access.snapshot();
    expect(s.origin).toBe("http://f1.localhost:5173");
    expect(s.local).toEqual([{ key: "alpha", value: '{"a":1}' }, { key: "zeta", value: "1" }]);
    expect(s.session).toEqual([{ key: "draft", value: "hello" }]);
    expect(s.hidden).toBe(2);
    expect(s.cookies).toEqual([{ name: "seen", value: "1" }]);
  });

  it("writes, removes and clears items, never touching the Designer's", () => {
    const p = page();
    p.session.setItem("__gable_designer_net", "{}");
    p.handlers.setStorageItem({ area: "session", key: "a", value: "1" });
    p.handlers.setStorageItem({ area: "session", key: "b", value: "2" });
    expect(p.session.getItem("a")).toBe("1");
    expect(() => p.handlers.setStorageItem({ area: "session", key: "__gable_designer_net", value: "x" })).toThrow(/belongs to the Designer/);
    expect(() => p.handlers.removeStorageItem({ area: "session", key: "gable-designer-session" })).toThrow(/belongs to the Designer/);
    expect(() => p.handlers.setStorageItem({ area: "local", key: "", value: "x" })).toThrow(/needs a key/);
    expect(p.handlers.removeStorageItem({ area: "session", key: "a" }).session).toEqual([{ key: "b", value: "2" }]);
    const cleared = p.handlers.clearStorage({ area: "session" });
    expect(cleared.session).toEqual([]);
    expect(p.session.getItem("__gable_designer_net")).toBe("{}");
  });

  it("says when a storage cannot be used instead of listing it as empty", () => {
    const win = {
      location: { href: "http://f1.localhost:5173/" },
      get localStorage(): Storage {
        throw new DOMException("The document is sandboxed and lacks the 'allow-same-origin' flag.", "SecurityError");
      },
      sessionStorage: new FakeStorage() as unknown as Storage,
    };
    const s = new StorageAccess(win).snapshot();
    expect(s.local).toBeNull();
    expect(s.errors.local).toMatch(/sandboxed/);
    expect(s.session).toEqual([]);
    expect(() => new StorageAccess(win).setItem("local", "a", "1")).toThrow(/sandboxed/);
  });

  it("tells the shell when the page writes its storage or cookies, but not for the Designer's own keys", () => {
    const p = page();
    const before = p.changes();
    p.local.setItem("theme", "dark"); // the app's own write, through the hooked prototype
    expect(p.changes()).toBe(before + 1);
    p.session.setItem("__gable_designer_rec", "{}");
    expect(p.changes()).toBe(before + 1);
    p.local.removeItem("theme");
    p.local.clear();
    expect(p.changes()).toBe(before + 3);
    p.doc.cookie = "seen=1; path=/";
    expect(p.changes()).toBe(before + 4);
    expect(p.doc.cookie).toBe("seen=1"); // the hooked getter still reads the jar
    p.listeners.storage!.forEach((l) => l()); // another page of the origin
    expect(p.changes()).toBe(before + 5);
    // A Storage that is not the page's own (another frame's) is not reported.
    new FakeStorage().setItem("x", "1");
    expect(p.changes()).toBe(before + 5);
  });

  it("writes cookies through document.cookie and deletes them on whichever path they are", () => {
    const p = page();
    expect(p.handlers.setCookie({ name: "theme", value: "dark", maxAge: 60 }).cookies).toEqual([{ name: "theme", value: "dark" }]);
    expect(() => p.handlers.setCookie({ name: "sid", value: "x", httpOnly: true })).toThrow(/HttpOnly/);
    expect(() => p.handlers.setCookie({ name: "bad name", value: "x" })).toThrow(/not a valid cookie name/);
    p.doc.cookie = "deep=1; path=/users";
    expect(p.handlers.deleteCookie({ name: "deep" }).cookies).toEqual([{ name: "theme", value: "dark" }]);
    expect(p.handlers.deleteCookie({ name: "theme", path: "/" }).cookies).toEqual([]);
    p.doc.cookie = "stuck=1; path=/users";
    expect(() => p.handlers.deleteCookie({ name: "stuck", path: "/other" })).toThrow(/still there/);
  });

  it("reports a cookie the browser did not keep", () => {
    const p = page();
    const doc = p.doc as unknown as { jar: unknown[] };
    Object.defineProperty(p.win.document, "cookie", { configurable: true, get: () => "", set: () => undefined });
    expect(() => p.handlers.setCookie({ name: "s", value: "1", secure: true })).toThrow(/did not keep/);
    expect(doc.jar).toEqual([]);
  });
});

describe("the Storage panel and get_storage", () => {
  const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
  const full: CookieRow = { attributes: true, name: "sid", value: "s3ss10n", domain: "f1.localhost", path: "/", expires: -1, size: 10, httpOnly: true, secure: false, session: true, sameSite: "Lax" };

  it("shows a cookie's attributes, or says they need CDP", () => {
    expect(cookieMeta(full, NOW)).toBe("f1.localhost · / · session · 10 B · HttpOnly · SameSite=Lax");
    expect(cookieMeta({ attributes: false, name: "seen", value: "1", size: 5 })).toBe("5 B · attributes need CDP");
    expect(expiresText(NOW / 1000 + 3600, false, NOW)).toBe("2026-11-07 13:00 UTC");
    expect(expiresText(NOW / 1000 - 1, false, NOW)).toBe("expired");
  });

  it("filters rows by name or value and cuts long values for the row", () => {
    const items = [
      { key: "theme", value: "dark" },
      { key: "blob", value: "x".repeat(400) },
    ];
    expect(storageRows(items, null, "").map((r) => r.name)).toEqual(["theme", "blob"]);
    expect(storageRows(items, null, "DARK").map((r) => r.name)).toEqual(["theme"]);
    const blob = storageRows(items, null, "blob")[0]!;
    expect(blob.shown.length).toBe(301);
    expect(blob.value.length).toBe(400);
    const cookies = storageRows(null, [full, { attributes: false, name: "seen", value: "1", size: 5 }], "");
    expect(cookies.map((r) => [r.name, r.httpOnly])).toEqual([
      ["sid", true],
      ["seen", false],
    ]);
  });

  it("answers get_storage with the areas asked for, cut values, where the cookies came from", () => {
    const r: StorageCommandResult = {
      frame: { id: "f1", name: "Laptop" },
      snapshot: { url: "http://f1.localhost:5173/", origin: "http://f1.localhost:5173", local: [{ key: "theme", value: "dark" }, { key: "big", value: "y".repeat(50) }], session: null, cookies: [], errors: { session: "blocked" }, hidden: 1 },
      cookies: [full],
      cookiesVia: "cdp",
      note: null,
      thirdParty: "third-party here",
    };
    const all = storageView(r, "all", "", 10);
    expect(all.localStorage).toEqual([{ key: "theme", value: "dark" }, { key: "big", value: "yyyyyyyyyy", truncated: 50 }]);
    expect(all.sessionStorage).toBeNull();
    expect(all.errors).toEqual({ session: "blocked" });
    expect(all.designerKeysHidden).toBe(1);
    expect(all.cookies).toEqual([{ name: "sid", value: "s3ss10n", domain: "f1.localhost", path: "/", expires: "session", size: 10, httpOnly: true, secure: false, sameSite: "Lax" }]);
    expect(all.cookiesVia).toBe("cdp");
    expect(all.thirdParty).toBe("third-party here");
    const local = storageView(r, "local", "theme");
    expect(Object.keys(local)).toEqual(["frame", "origin", "localStorage", "errors", "designerKeysHidden"]);
    expect(local.localStorage).toEqual([{ key: "theme", value: "dark" }]);
  });
});

describe("the Network log's filters", () => {
  const entry = (id: number, kind: NetworkEntry["kind"], method: string, url: string, status: number | null, extra: Partial<NetworkEntry> = {}): NetworkEntry => ({
    id,
    kind,
    method,
    url,
    status,
    statusText: "",
    start: 0,
    duration: 1,
    size: 0,
    contentType: null,
    initiator: "/src/app.ts:3",
    error: null,
    conditioned: null,
    ...extra,
  });
  const log = [
    entry(1, "fetch", "GET", "http://x/api/users", 200),
    entry(2, "xhr", "POST", "http://x/api/login", 500),
    entry(3, "mock", "GET", "http://x/api/other", 404, { mock: -1 }),
    entry(4, "fetch", "GET", "http://x/api/down", 0, { initiator: "/src/down.ts:9" }),
    entry(5, "fetch", "GET", "http://x/api/slow", null),
  ];
  it("keeps by text (URL, method or initiator), kind and failed", () => {
    expect(filterEntries(log, {}).length).toBe(5);
    expect(filterEntries(log, { text: "USERS" }).map((e) => e.id)).toEqual([1]);
    expect(filterEntries(log, { text: "post" }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries(log, { text: "down.ts" }).map((e) => e.id)).toEqual([4]);
    expect(filterEntries(log, { kind: "fetch" }).map((e) => e.id)).toEqual([1, 4, 5]);
    expect(filterEntries(log, { failed: true }).map((e) => e.id)).toEqual([2, 3, 4]);
    expect(filterEntries(log, { kind: "fetch", failed: true }).map((e) => e.id)).toEqual([4]);
  });
});
