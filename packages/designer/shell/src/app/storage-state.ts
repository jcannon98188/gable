// The selected frame's storage and cookies, for the Storage panel and MCP (TASK-56.21). The Preview agent reads and edits
// localStorage, sessionStorage and the cookies the page can see (agent/storage.ts) and says when the page changed them;
// with CDP the backend lists and writes every cookie of the frame (HttpOnly ones and attributes included), otherwise the
// panel shows the page's view and says what it cannot see. Each frame has its own origin, so its own storage.
import { computed, effect, inject, signal, untracked } from "@gable/core";
import {
  COOKIES_NEED_CDP,
  type CookieDelete,
  type CookieRow,
  type CookieWrite,
  type FullCookie,
  type StorageArea,
  type StorageCommand,
  type StorageCommandResult,
  type StorageSnapshot,
  thirdPartyNote,
} from "../../../src/storage.js";
import { ChromeState } from "./chrome-state.js";
import { DesignerState } from "./designer-state.js";
import type { Frame } from "./frames.js";

const CALL_TIMEOUT_MS = 10000;
const bounded = <T>(p: Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> =>
  new Promise<T>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("The frame did not answer (it may have reloaded).")), ms);
    p.then((v) => (clearTimeout(timer), ok(v)), (e: unknown) => (clearTimeout(timer), fail(e)));
  });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type CookieApi = { ok: true; url: string; cookies: FullCookie[] } | { ok: false; error: string };

/** What a frame's storage looks like to the panel: the page's view, and the cookies (over CDP when there is CDP). */
export interface FrameStorage {
  snapshot: StorageSnapshot;
  cookies: CookieRow[];
  cookiesVia: "cdp" | "page";
  /** Why the cookies are the page's view only. */
  cookieNote: string | null;
  /** The frame is cross-site with the Designer's window, so its cookies follow third-party rules. */
  thirdParty: string | null;
}

const pageCookies = (s: StorageSnapshot): CookieRow[] => s.cookies.map((c) => ({ ...c, attributes: false as const, size: c.name.length + c.value.length }));

export class StorageState {
  static scope = "root";
  state = inject(DesignerState);
  chrome = inject(ChromeState);

  current = signal<FrameStorage | null>(null);
  error = signal<string | null>(null);
  cdp = computed(() => this.state.frames.capabilities().cdp);
  /** The panel is on screen: only then does page activity refresh it (MCP reads on demand). */
  visible = computed(() => this.chrome.drawerOpen() && this.chrome.drawerTab() === "storage");

  #running = false;
  #again = false;

  watch = effect(() => {
    const ready = this.state.connection() === "ready";
    const visible = this.visible();
    this.state.loads();
    this.state.frames.selectedId();
    // A response's Set-Cookie changes cookies without a storage event the page can hook (CDP sees it on the next read).
    this.state.activity();
    untracked(() => void (ready && visible && this.refresh()));
  });

  #frame(id?: string): Frame {
    const fs = this.state.frames;
    const frame = id ? fs.frames().find((f) => f.id === id) : fs.selected();
    if (!frame) throw new Error(`No frame ${id}; the frames are ${fs.frames().map((f) => f.id).join(", ")}.`);
    return frame;
  }

  /** Reads the frame's storage and cookies (a second request while one runs is made once, after it). */
  async refresh(): Promise<void> {
    if (this.#running) return void (this.#again = true);
    this.#running = true;
    const frame = this.state.frames.selected();
    try {
      const read = await this.read(frame);
      if (frame === this.state.frames.selected()) this.#show(read);
    } catch (e) {
      if (frame === this.state.frames.selected()) this.error.set(message(e));
    } finally {
      this.#running = false;
      if (this.#again) {
        this.#again = false;
        void this.refresh();
      }
    }
  }

  #show(read: FrameStorage): void {
    this.current.set(read);
    this.error.set(null);
  }

  /** The frame's storage as the page sees it, and its cookies over CDP when the backend has CDP. */
  async read(frame: Frame, snapshot?: StorageSnapshot): Promise<FrameStorage> {
    const snap = snapshot ?? (await bounded(frame.client.call("storage", undefined)));
    const thirdParty = thirdPartyNote(location.origin, snap.origin);
    if (!this.cdp()) return { snapshot: snap, cookies: pageCookies(snap), cookiesVia: "page", cookieNote: COOKIES_NEED_CDP, thirdParty };
    const r = await this.#cookieApi(frame, { action: "list" });
    if (!r.ok) return { snapshot: snap, cookies: pageCookies(snap), cookiesVia: "page", cookieNote: `Cookies over CDP: ${r.error}`, thirdParty };
    return { snapshot: snap, cookies: r.cookies.map((c) => ({ ...c, attributes: true as const })), cookiesVia: "cdp", cookieNote: null, thirdParty };
  }

  #cookieApi(frame: Frame, body: { action: "list" } | { action: "set"; cookie: CookieWrite } | { action: "delete"; cookie: CookieDelete }): Promise<CookieApi> {
    return this.state.api<CookieApi>("/api/storage/cookies", { nonce: frame.client.nonce, ...body }).catch((e: unknown) => ({ ok: false as const, error: message(e) }));
  }

  async #after(frame: Frame, snap: StorageSnapshot): Promise<FrameStorage> {
    const read = await this.read(frame, snap);
    if (frame === this.state.frames.selected()) this.#show(read);
    return read;
  }

  async setItem(area: StorageArea, key: string, value: string, frame = this.state.frames.selected()): Promise<FrameStorage> {
    return this.#after(frame, await bounded(frame.client.call("setStorageItem", { area, key, value })));
  }

  /** Renames an item: writes the new key, then removes the old one (two writes, as the page's own code would). */
  async renameItem(area: StorageArea, from: string, to: string, value: string, frame = this.state.frames.selected()): Promise<FrameStorage> {
    await bounded(frame.client.call("setStorageItem", { area, key: to, value }));
    return this.#after(frame, await bounded(frame.client.call("removeStorageItem", { area, key: from })));
  }

  async removeItem(area: StorageArea, key: string, frame = this.state.frames.selected()): Promise<FrameStorage> {
    return this.#after(frame, await bounded(frame.client.call("removeStorageItem", { area, key })));
  }

  async clear(area: StorageArea, frame = this.state.frames.selected()): Promise<FrameStorage> {
    return this.#after(frame, await bounded(frame.client.call("clearStorage", { area })));
  }

  /** Over CDP when there is CDP (any cookie, HttpOnly included), else through the page (`document.cookie`). */
  async setCookie(cookie: CookieWrite, frame = this.state.frames.selected()): Promise<FrameStorage> {
    if (this.cdp()) {
      const r = await this.#cookieApi(frame, { action: "set", cookie });
      if (!r.ok) throw new Error(r.error);
      const read = await this.#after(frame, await bounded(frame.client.call("storage", undefined)));
      const expired = typeof cookie.maxAge === "number" && cookie.maxAge <= 0;
      if (!expired && !read.cookies.some((c) => c.name === cookie.name && c.value === cookie.value)) throw new Error(`The browser did not keep the cookie "${cookie.name}" (Secure needs https or localhost, and the domain must be the frame's own).`);
      return read;
    }
    if (cookie.httpOnly) throw new Error(COOKIES_NEED_CDP);
    return this.#after(frame, await bounded(frame.client.call("setCookie", cookie)));
  }

  async deleteCookie(cookie: CookieDelete, frame = this.state.frames.selected()): Promise<FrameStorage> {
    if (this.cdp()) {
      const r = await this.#cookieApi(frame, { action: "delete", cookie });
      if (!r.ok) throw new Error(r.error);
      const read = await this.#after(frame, await bounded(frame.client.call("storage", undefined)));
      const left = read.cookies.some((c) => c.name === cookie.name && (!c.attributes || ((!cookie.path || c.path === cookie.path) && (!cookie.domain || c.domain === cookie.domain))));
      if (left) throw new Error(`The cookie "${cookie.name}" is still there: it is on another path or domain (give them).`);
      return read;
    }
    return this.#after(frame, await bounded(frame.client.call("deleteCookie", cookie)));
  }

  /** MCP: the same actions as the panel, on any frame. */
  async command(c: StorageCommand): Promise<StorageCommandResult> {
    const frame = this.#frame(c.frame);
    if (frame.connection() !== "ready") throw new Error(`The frame ${frame.config().name} is not connected (${frame.connection()}).`);
    let read: FrameStorage;
    if (c.action === "set") read = await this.setItem(c.area, c.key, c.value, frame);
    else if (c.action === "remove") read = await this.removeItem(c.area, c.key, frame);
    else if (c.action === "clear") read = await this.clear(c.area, frame);
    else if (c.action === "setCookie") read = await this.setCookie(c.cookie, frame);
    else if (c.action === "deleteCookie") read = await this.deleteCookie(c.cookie, frame);
    else read = await this.read(frame);
    if (frame === this.state.frames.selected()) this.#show(read);
    return { frame: { id: frame.id, name: frame.config().name }, snapshot: read.snapshot, cookies: read.cookies, cookiesVia: read.cookiesVia, note: read.cookieNote, thirdParty: read.thirdParty };
  }
}
