// The Preview agent's side of the Storage panel (TASK-56.21): reads and edits the frame's localStorage, sessionStorage and
// the cookies the page can see, and tells the shell when the page changes them (its own writes through the Storage API and
// document.cookie, another tab of the same origin, and cookie changes the browser reports), so the panel stays live.
// The Designer's own keys (its session, the network condition and recording) are left out and never cleared.
import {
  cookieProblem,
  cookieString,
  cookiePaths,
  isDesignerKey,
  parseDocumentCookie,
  type CookieDelete,
  type CookieWrite,
  type StorageArea,
  type StorageItem,
  type StorageSnapshot,
} from "../storage.js";

/** What of the page the capture reads and hooks (the window in the frame; a stand-in in tests). */
export interface StorageTarget {
  location: { href: string };
  localStorage?: Storage;
  sessionStorage?: Storage;
  document?: { cookie: string };
  Storage?: { prototype: Storage };
  addEventListener?: (type: string, listener: () => void) => void;
  cookieStore?: { addEventListener?: (type: string, listener: () => void) => void };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class StorageAccess {
  #win: StorageTarget;
  constructor(win: StorageTarget) {
    this.#win = win;
  }

  /** The area's Storage, or why the page cannot use it. */
  #area(area: StorageArea): Storage | string {
    try {
      const s = area === "local" ? this.#win.localStorage : this.#win.sessionStorage;
      return s ?? `${area}Storage is not available in this page.`;
    } catch (e) {
      return message(e);
    }
  }

  snapshot(): StorageSnapshot {
    const errors: StorageSnapshot["errors"] = {};
    let hidden = 0;
    const read = (area: StorageArea): StorageItem[] | null => {
      const s = this.#area(area);
      if (typeof s === "string") return (errors[area] = s), null;
      try {
        const items: StorageItem[] = [];
        for (let i = 0; i < s.length; i++) {
          const key = s.key(i);
          if (key === null) continue;
          if (isDesignerKey(key)) hidden++;
          else items.push({ key, value: s.getItem(key) ?? "" });
        }
        return items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      } catch (e) {
        errors[area] = message(e);
        return null;
      }
    };
    const local = read("local");
    const session = read("session");
    let cookies: StorageSnapshot["cookies"] = [];
    try {
      cookies = this.#win.document ? parseDocumentCookie(this.#win.document.cookie) : [];
    } catch (e) {
      errors.cookies = message(e);
    }
    const url = this.#win.location.href;
    let origin = "";
    try {
      origin = new URL(url).origin;
    } catch {
      // an opaque URL: no origin to show
    }
    return { url, origin, local, session, cookies, errors, hidden };
  }

  setItem(area: StorageArea, key: string, value: string): StorageSnapshot {
    if (typeof key !== "string" || key === "") throw new Error("A storage item needs a key.");
    if (typeof value !== "string") throw new Error("A storage value is a string.");
    if (isDesignerKey(key)) throw new Error(`"${key}" belongs to the Designer and is not edited here.`);
    const s = this.#area(area);
    if (typeof s === "string") throw new Error(s);
    s.setItem(key, value); // a full storage throws QuotaExceededError, which reaches the caller as it is
    return this.snapshot();
  }

  removeItem(area: StorageArea, key: string): StorageSnapshot {
    if (isDesignerKey(key)) throw new Error(`"${key}" belongs to the Designer and is not removed here.`);
    const s = this.#area(area);
    if (typeof s === "string") throw new Error(s);
    s.removeItem(key);
    return this.snapshot();
  }

  clear(area: StorageArea): StorageSnapshot {
    const s = this.#area(area);
    if (typeof s === "string") throw new Error(s);
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null && !isDesignerKey(k)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
    return this.snapshot();
  }

  setCookie(c: CookieWrite): StorageSnapshot {
    const problem = cookieProblem(c);
    if (problem) throw new Error(problem);
    if (c.httpOnly) throw new Error("A page cannot write an HttpOnly cookie; that needs CDP.");
    const doc = this.#doc();
    doc.cookie = cookieString(c);
    const seen = parseDocumentCookie(doc.cookie).some((x) => x.name === c.name && x.value === c.value);
    const expired = typeof c.maxAge === "number" && c.maxAge <= 0;
    if (!seen && !expired) throw new Error(`The browser did not keep the cookie "${c.name}" (Secure needs https or localhost, the domain must be the page's own, and a third-party iframe keeps only SameSite=None; Secure cookies).`);
    return this.snapshot();
  }

  /** Expires the cookie on its path, or on every path it could be on for this page (and the page's domain). */
  deleteCookie(c: CookieDelete): StorageSnapshot {
    if (!c || typeof c.name !== "string") throw new Error("Which cookie: a name is needed.");
    const doc = this.#doc();
    const paths = c.path ? [c.path] : cookiePaths(new URL(this.#win.location.href).pathname);
    const domains = c.domain ? [c.domain] : [undefined];
    // Each write plainly and as SameSite=None; Secure: a third-party iframe ignores any other write, the expiring one too.
    for (const path of paths) {
      for (const domain of domains) {
        const expire = `${c.name}=; path=${path}${domain ? `; domain=${domain}` : ""}; max-age=0`;
        doc.cookie = expire;
        doc.cookie = `${expire}; samesite=None; secure`;
      }
    }
    if (parseDocumentCookie(doc.cookie).some((x) => x.name === c.name)) {
      throw new Error(`The cookie "${c.name}" is still there: it is on another path or domain (give them), or it was set by the server for a parent domain.`);
    }
    return this.snapshot();
  }

  #doc(): { cookie: string } {
    const doc = this.#win.document;
    if (!doc) throw new Error("This page has no document cookies.");
    return doc;
  }

  /**
   * Calls `changed` when the page changes its storage: the Storage API's writes (on this page's two storages, the
   * Designer's own keys aside), document.cookie writes, the `storage` event (another page of the origin) and the browser's
   * cookie changes (cookieStore, where there is one: it also sees a response's Set-Cookie). Direct property writes
   * (`localStorage.x = 1`) are not seen until the next read.
   */
  watch(changed: () => void): void {
    const win = this.#win;
    const proto = win.Storage?.prototype;
    if (proto) {
      const ours = (s: Storage) => {
        try {
          return s === win.localStorage || s === win.sessionStorage;
        } catch {
          return false;
        }
      };
      const setItem = proto.setItem;
      const removeItem = proto.removeItem;
      const clear = proto.clear;
      proto.setItem = function (this: Storage, key: string, value: string) {
        setItem.call(this, key, value);
        if (ours(this) && !isDesignerKey(String(key))) changed();
      };
      proto.removeItem = function (this: Storage, key: string) {
        removeItem.call(this, key);
        if (ours(this) && !isDesignerKey(String(key))) changed();
      };
      proto.clear = function (this: Storage) {
        clear.call(this);
        if (ours(this)) changed();
      };
    }
    const doc = win.document;
    if (doc) {
      let owner: object | null = Object.getPrototypeOf(doc) as object | null;
      let desc: PropertyDescriptor | undefined;
      while (owner && !(desc = Object.getOwnPropertyDescriptor(owner, "cookie"))) owner = Object.getPrototypeOf(owner) as object | null;
      if (desc?.get && desc.set) {
        const { get, set } = desc;
        Object.defineProperty(doc, "cookie", {
          configurable: true,
          enumerable: desc.enumerable,
          get() {
            return get.call(this) as string;
          },
          set(v: string) {
            set.call(this, v);
            changed();
          },
        });
      }
    }
    win.addEventListener?.("storage", changed);
    try {
      win.cookieStore?.addEventListener?.("change", changed);
    } catch {
      // no cookieStore here
    }
  }
}

/** The agent's side: hooks the page's storage and returns the handlers of the storage methods. */
export function startStorage(win: StorageTarget, changed: () => void) {
  const access = new StorageAccess(win);
  access.watch(changed);
  return {
    access,
    handlers: {
      storage: () => access.snapshot(),
      setStorageItem: (p: { area: StorageArea; key: string; value: string }) => access.setItem(p.area, p.key, p.value),
      removeStorageItem: (p: { area: StorageArea; key: string }) => access.removeItem(p.area, p.key),
      clearStorage: (p: { area: StorageArea }) => access.clear(p.area),
      setCookie: (p: CookieWrite) => access.setCookie(p),
      deleteCookie: (p: CookieDelete) => access.deleteCookie(p),
    },
  };
}
