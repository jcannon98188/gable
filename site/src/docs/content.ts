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

/** Guides each package page points at, until the package guides (TASK-95.3) bring their own content. */
export const PACKAGE_GUIDES: Record<string, readonly string[]> = {
  core: ["router", "errors", "i18n", "accessibility", "performance", "devtools"],
  store: ["store"],
  "ui-primitives": ["ui-primitives"],
  ui: ["ui-items", "gable-ui-cli"],
  "gable-ui": ["gable-ui-cli"],
};

type Loader = () => Promise<string>;
// Lazy: each guide is its own chunk, fetched when its page (or the search index) first needs it.
const RAW = import.meta.glob("../../../docs/*.md", { query: "?raw", import: "default" }) as Record<string, Loader>;
const loaders = new Map<string, Loader>(Object.entries(RAW).map(([path, load]) => [path.replace(/^.*\/([^/]+)\.md$/, "$1"), load]));

/** `./router.md#x` to `/docs/guides/router#x`; other relative paths to GitHub; absolute and `#` targets untouched. */
export function resolveDocLink(href: string): { href: string; internal: boolean } | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return { href, internal: false };
  const [path = "", frag = ""] = href.split("#");
  const parts: string[] = ["docs"];
  for (const seg of path.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  const m = /^docs\/([a-z0-9-]+)\.md$/.exec(parts.join("/"));
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
