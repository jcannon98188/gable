import { History, Location, Title } from "@gable/core/renderer";

export interface PlatformOptions {
  /** `path` (default) uses the real path; `hash` keeps the app URL after the `#`. */
  mode?: "path" | "hash";
  /** In path mode, a prefix of the real path that is not part of the app URL, e.g. `/app`. */
  base?: string;
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

/** Location, History and Title over `window`, `window.history` and `document`. */
export function createDomPlatform(options: PlatformOptions = {}): { location: Location; history: History; title: Title } {
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
  return { location, history, title };
}
