import { REPO } from "./base.js";
import { parseMarkdown, type MarkdownDoc } from "./markdown.js";

export interface Guide {
  slug: string;
  title: string;
  group: "Getting started" | "Guides";
  summary: string;
}

/** The guides, in reading order. Each is `docs/<slug>.md` at the repository root. */
export const GUIDES: readonly Guide[] = [
  { slug: "getting-started", title: "Getting started", group: "Getting started", summary: "Create an app, run it and learn the moving parts." },
  { slug: "manual-setup", title: "Manual setup", group: "Getting started", summary: "Add Gable to an existing Vite and TypeScript app." },
  { slug: "router", title: "Router", group: "Guides", summary: "Routes, params, guards, lazy loading, hash mode and focus management." },
  { slug: "store", title: "Store", group: "Guides", summary: "Signal-based state with entities, queries and persistence." },
  { slug: "i18n", title: "Internationalisation", group: "Guides", summary: "Catalogs, plurals, formatting and extraction." },
  { slug: "errors", title: "Error handling", group: "Guides", summary: "The error handler, reporting and error boundaries." },
  { slug: "accessibility", title: "Accessibility", group: "Guides", summary: "Template checks, live regions and focus." },
  { slug: "performance", title: "Performance", group: "Guides", summary: "How updates are scheduled and how to keep them cheap." },
  { slug: "devtools", title: "Devtools", group: "Guides", summary: "Inspect components, signals and the injector tree." },
  { slug: "ui-primitives", title: "UI primitives", group: "Guides", summary: "Headless, accessible building blocks." },
  { slug: "ui-items", title: "UI items", group: "Guides", summary: "Item-based data inputs shared by the select-like components." },
  { slug: "gable-ui-cli", title: "gable-ui CLI", group: "Guides", summary: "Copy shadcn-style components into your project." },
  { slug: "library-authors", title: "Library authors", group: "Guides", summary: "Publishing components and services for others." },
];

export const guideBySlug = (slug: string): Guide | undefined => GUIDES.find((g) => g.slug === slug);

/** Guides each package page links under "Guides", next to its own package guide. */
export const PACKAGE_GUIDES: Record<string, readonly string[]> = {
  core: ["router", "errors", "i18n", "accessibility", "performance", "devtools"],
  store: ["store"],
  "ui-primitives": ["ui-primitives"],
  ui: ["ui-items", "gable-ui-cli"],
  "gable-ui": ["gable-ui-cli"],
  "devtools-extension": ["devtools"],
};

/** An application or tool with a package guide but no generated API reference (the extractor skips applications). */
export interface AppPackage {
  slug: string;
  name: string;
  description: string;
}

/** The application packages. They show in the docs menu, without an API link, once their guide (`docs/packages/<slug>.md`) exists. */
export const APP_PACKAGES: readonly AppPackage[] = [
  { slug: "designer", name: "designer", description: "The Gable Designer: inspect a running app, edit its source visually and drive it from a coding agent." },
  { slug: "devtools-extension", name: "devtools-extension", description: "The browser devtools panel for Gable dev builds." },
  { slug: "vscode", name: "vscode", description: "The VS Code extension: template diagnostics, completions and highlighting." },
];

type Loader = () => Promise<string>;
// Lazy: each guide is its own chunk, fetched when its page (or the search index) first needs it.
const RAW = import.meta.glob("../../../docs/*.md", { query: "?raw", import: "default" }) as Record<string, Loader>;
const loaders = new Map<string, Loader>(Object.entries(RAW).map(([path, load]) => [path.replace(/^.*\/([^/]+)\.md$/, "$1"), load]));

/**
 * `./router.md#x` to `/docs/guides/router#x`; other relative paths to GitHub; absolute and `#` targets untouched.
 * Relative paths resolve from `from` (default `docs`, where the guides live; package guides pass `docs/packages`, so
 * `../router.md` is the router guide and `./store.md` is the store package page).
 */
export function resolveDocLink(href: string, from = "docs"): { href: string; internal: boolean } | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return { href, internal: false };
  const [path = "", frag = ""] = href.split("#");
  const parts: string[] = from.split("/");
  for (const seg of path.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  const m = /^docs\/([a-z0-9-]+)\.md$/.exec(parts.join("/"));
  const pkg = /^docs\/packages\/([a-z0-9-]+)\.md$/.exec(parts.join("/"));
  if (pkg) return { href: `/docs/${pkg[1]}${frag ? "#" + frag : ""}`, internal: true };
  if (m && guideBySlug(m[1]!)) return { href: `/docs/guides/${m[1]}${frag ? "#" + frag : ""}`, internal: true };
  return { href: `${REPO}/blob/main/${parts.join("/")}${frag ? "#" + frag : ""}`, internal: false };
}

const cache = new Map<string, Promise<MarkdownDoc | null>>();

/** Loads and parses a guide; null for an unknown slug. */
export function loadGuide(slug: string): Promise<MarkdownDoc | null> {
  let p = cache.get(slug);
  if (!p) {
    const load = loaders.get(slug);
    p = load && guideBySlug(slug) ? load().then((src) => parseMarkdown(src, { resolveLink: resolveDocLink })) : Promise.resolve(null);
    cache.set(slug, p);
  }
  return p;
}

const PACKAGE_RAW = import.meta.glob("../../../docs/packages/*.md", { query: "?raw", import: "default" }) as Record<string, Loader>;
const packageLoaders = new Map<string, Loader>(Object.entries(PACKAGE_RAW).map(([path, load]) => [path.replace(/^.*\/([^/]+)\.md$/, "$1"), load]));
const packageCache = new Map<string, Promise<MarkdownDoc | null>>();

/** The slugs of the packages that have a guide (`docs/packages/<slug>.md`). */
export const packageGuideSlugs = (): string[] => [...packageLoaders.keys()];

/** The application packages whose guide exists, as the menu and the package page show them. */
export const appPackages = (): AppPackage[] => APP_PACKAGES.filter((a) => packageLoaders.has(a.slug));

/**
 * Loads and parses a package guide, `docs/packages/<slug>.md` (the slug is the API slug: `core`, `ui-primitives`, ...).
 * Null when the package has no guide, so its page falls back to the generated overview.
 */
export function loadPackageGuide(slug: string): Promise<MarkdownDoc | null> {
  let p = packageCache.get(slug);
  if (!p) {
    const load = packageLoaders.get(slug);
    p = load ? load().then((src) => parseMarkdown(src, { resolveLink: (href) => resolveDocLink(href, "docs/packages") })) : Promise.resolve(null);
    packageCache.set(slug, p);
  }
  return p;
}
