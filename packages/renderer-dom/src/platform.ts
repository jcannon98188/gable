import { FocusManager, History, Location, LiveAnnouncer, Meta, Title, mergeMeta, metaEntries, type MetaEntry, type FocusTarget, type MetaTags, type Politeness } from "@gable/core/renderer";

export interface PlatformOptions {
  /** `path` (default) uses the real path; `hash` keeps the app URL after the `#`. */
  mode?: "path" | "hash";
  /** In path mode, a prefix of the real path that is not part of the app URL, e.g. `/app`. */
  base?: string;
}

export interface PlatformEnvironment {
  /** The document the app lives in. Defaults to the global `document`, read when first needed. */
  document?: Document;
  /** Where the live regions go: an element, or a function returning one. Defaults to `document.body`. */
  overlayRoot?: Element | (() => Element);
}

interface Strategy {
  /** App-relative URL for the browser's current URL. */
  read(): string;
  /** Browser URL for an app-relative one. */
  write(href: string): string;
}

function strategyFor({ mode = "path", base = "" }: PlatformOptions): Strategy {
  const prefix = base.replace(/\/+$/, "");
  if (mode === "hash") {
    return {
      read: () => window.location.hash.slice(1) || "/",
      write: (href) => `${window.location.pathname}${window.location.search}#${href}`,
    };
  }
  return {
    read() {
      const { pathname, search, hash } = window.location;
      const path = prefix && pathname.startsWith(prefix) ? pathname.slice(prefix.length) || "/" : pathname;
      return path + search + hash;
    },
    write: (href) => prefix + href,
  };
}

function part(href: string, which: "pathname" | "search" | "hash"): string {
  return new URL(href, "http://gable.invalid")[which];
}

interface Managed {
  el: Element;
  created: boolean;
  /** The page's own value (`content` or `href`) before the first write, restored on removal. */
  original: string | null;
}

/** Meta over `document.head`. Adopts a tag the page already has (restoring it later); creates the rest and removes them. */
function createDomMeta(): Meta {
  const managed = new Map<string, Managed>();
  let current: MetaTags = {};
  const attr = (e: MetaEntry) => (e.kind === "link" ? "href" : "content");
  const selector = (e: MetaEntry) => (e.kind === "link" ? `link[rel="${e.key}"]` : `meta[${e.kind}="${e.key}"]`);
  const apply = (tags: MetaTags) => {
    current = tags;
    const wanted = new Map(metaEntries(tags).map((e) => [`${e.kind}:${e.key}`, e]));
    for (const [id, m] of managed) {
      if (wanted.has(id)) continue;
      const name = m.el.localName === "link" ? "href" : "content";
      if (m.created) m.el.remove();
      else if (m.original === null) m.el.removeAttribute(name);
      else m.el.setAttribute(name, m.original);
      managed.delete(id);
    }
    for (const [id, e] of wanted) {
      let m = managed.get(id);
      if (!m) {
        let el = document.head.querySelector(selector(e));
        const created = !el;
        if (!el) {
          el = document.createElement(e.kind === "link" ? "link" : "meta");
          if (e.kind === "link") el.setAttribute("rel", e.key);
          else el.setAttribute(e.kind, e.key);
          document.head.appendChild(el);
        }
        m = { el, created, original: el.getAttribute(attr(e)) };
        managed.set(id, m);
      }
      m.el.setAttribute(attr(e), e.value);
    }
  };
  return {
    get: () => current,
    set: apply,
    update: (tags) => apply(mergeMeta(current, tags)),
    clear: () => apply({}),
  };
}

const VISUALLY_HIDDEN = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";

/** LiveAnnouncer over two visually hidden live regions (`role="status"` polite, `role="alert"` assertive), created when the service is first injected (a region added together with its text is often not announced). */
function createDomAnnouncer(env: PlatformEnvironment): LiveAnnouncer {
  const regions = new Map<Politeness, { el: HTMLElement; flip: boolean }>();
  const doc = () => env.document ?? document;
  const ensure = (politeness: Politeness) => {
    let region = regions.get(politeness);
    if (!region || !region.el.isConnected) {
      const el = doc().createElement("div");
      el.setAttribute("data-gable-live", politeness);
      el.setAttribute("role", politeness === "polite" ? "status" : "alert");
      el.setAttribute("aria-live", politeness);
      el.setAttribute("aria-atomic", "true");
      el.setAttribute("style", VISUALLY_HIDDEN);
      const root = typeof env.overlayRoot === "function" ? env.overlayRoot() : env.overlayRoot;
      (root ?? doc().body).appendChild(el);
      region = { el, flip: region?.flip ?? false };
      regions.set(politeness, region);
    }
    return region;
  };
  ensure("polite");
  ensure("assertive");
  return {
    announce(message, politeness = "polite") {
      if (!message) return;
      const region = ensure(politeness);
      // A trailing non-breaking space makes a repeated message a change the screen reader notices.
      region.flip = !region.flip;
      region.el.textContent = region.flip ? message : message + " ";
    },
    clear() {
      for (const { el } of regions.values()) el.textContent = "";
    },
  };
}

function createDomFocus(env: PlatformEnvironment): FocusManager {
  return {
    focus(target: FocusTarget) {
      const doc = env.document ?? document;
      for (const selector of typeof target === "string" ? [target] : target) {
        let el: HTMLElement | null;
        try {
          el = doc.querySelector<HTMLElement>(selector);
        } catch {
          continue; // an invalid selector matches nothing
        }
        if (!el || typeof el.focus !== "function") continue;
        if (!el.hasAttribute("tabindex") && !isNativelyFocusable(el)) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: false });
        return true;
      }
      return false;
    },
  };
}

const isNativelyFocusable = (el: HTMLElement) => /^(a|area)$/i.test(el.localName) ? el.hasAttribute("href") : /^(button|input|select|textarea|summary|iframe)$/i.test(el.localName) || el.isContentEditable;

/** Location, History, Title, Meta, LiveAnnouncer and FocusManager over `window`, `window.history` and `document`. */
export function createDomPlatform(options: PlatformOptions & PlatformEnvironment = {}): { location: Location; history: History; title: Title; meta: Meta; announcer: LiveAnnouncer; focus: FocusManager } {
  const strategy = strategyFor(options);
  const location: Location = {
    get href() {
      return strategy.read();
    },
    get pathname() {
      return part(strategy.read(), "pathname");
    },
    get search() {
      return part(strategy.read(), "search");
    },
    get hash() {
      return options.mode === "hash" ? "" : part(strategy.read(), "hash");
    },
    subscribe(listener) {
      const notify = () => listener(strategy.read(), window.history.state);
      // `popstate` covers back, forward and (path mode) hash edits; hash mode also needs `hashchange` for typed URLs.
      window.addEventListener("popstate", notify);
      if (options.mode === "hash") window.addEventListener("hashchange", notify);
      return () => {
        window.removeEventListener("popstate", notify);
        window.removeEventListener("hashchange", notify);
      };
    },
  };
  const history: History = {
    get state() {
      return window.history.state;
    },
    push: (href, state) => window.history.pushState(state ?? null, "", strategy.write(href)),
    replace: (href, state) => window.history.replaceState(state ?? null, "", strategy.write(href)),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
  };
  const title: Title = {
    get: () => document.title,
    set: (value) => void (document.title = value),
  };
  return { location, history, title, meta: createDomMeta(), announcer: createDomAnnouncer(options), focus: createDomFocus(options) };
}
